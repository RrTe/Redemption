"""Pipeline Stage 9: AI-Assisted Ability Extractor (Offline Batch)

Processes unparsed abilities using Gemini, Groq, OpenRouter, or Ollama with strict
Pydantic JSON schema constraints, automatic resume, and 1-turn self-correction retry.
"""

from __future__ import annotations
import argparse
import concurrent.futures
import copy
import json
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any, Dict, List, Optional
from pydantic import ValidationError

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(Path(__file__).resolve().parent), str(BASE_DIR)])

from models.enums.activation_mode import ActivationMode
from models.enums.trigger_event import TriggerEvent
from models.logic.card_logic import CardSideLogic
from ability_prompt import build_system_prompt
from ai_client import load_env, query_llm_messages, QuotaExhaustedError, sanitize_error_message
from utils.finding_logger import log_finding, resolve_card_findings, get_findings_summary, FINDINGS_FILE
from utils.card_linker import CardLinker, link_side_logic_targets, normalize_chained_targets
from utils.choice_group_helper import reconcile_side_choice_groups

_config = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8")) if (BASE_DIR / "config.json").exists() else {}

UNPARSED_LOG = BASE_DIR / _config.get("unparsed_abilities_log", "data/unparsed_abilities.log")
AI_OUTPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
CARDS_EXT_FILE = BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")


_SIDE_SUFFIX_RE = re.compile(r"_(?:top|bottom|shared|star)$", re.IGNORECASE)
_STAR_PREFIX_RE = re.compile(r"^(?:STAR\s*:|\(\s*Star\s*\))", re.IGNORECASE)


def canonical_card_id(card_identifier: str) -> str:
    """Strips any accidental side suffix from a card identifier.

    Args:
        card_identifier: Raw or suffixed card identifier string.

    Returns:
        Canonical card ID without trailing ``_top``, ``_bottom``, ``_shared``, or ``_star``.
    """
    return _SIDE_SUFFIX_RE.sub("", str(card_identifier).strip())


def is_pure_star_entry(entry: Dict[str, Any]) -> bool:
    """Checks whether an AI output entry represents solely a Star ability.

    Legacy Stage 9 runs stored pure ``STAR:`` extractions under ``{cid}_top`` or
    ``{cid}_shared``. Such entries must never block extraction of the regular
    ``top`` or ``shared`` ability side.

    Args:
        entry: Saved AI entry dictionary from ``ai_generated_abilities.json``.

    Returns:
        True if the entry contains only Star ability logic (or has ``side='star'``).
    """
    side = str(entry.get("side") or "").strip().lower()
    if side == "star":
        return True
    ast_abs = (entry.get("ast") or {}).get("abilities") or []
    has_star = any(bool(ab.get("is_star")) for ab in ast_abs)
    has_reg = any(not bool(ab.get("is_star")) for ab in ast_abs)
    if has_star and not has_reg:
        return True
    raw_ab = str(entry.get("raw_ability") or "").strip()
    if not ast_abs and bool(_STAR_PREFIX_RE.match(raw_ab)):
        return True
    return False


def compute_done_entry_keys(results: Dict[str, Any]) -> set[str]:
    """Collects completed non-blocking side keys from ``ai_generated_abilities.json``.

    Excludes legacy pure-``STAR:`` entries stored under ``top`` or ``shared`` so
    regular side abilities remain scheduled for extraction.

    Args:
        results: Mapping of AI entry keys to saved AST dictionaries.

    Returns:
        Set of normalized ``{cid}_{side}`` keys for genuinely completed entries.
    """
    done: set[str] = set()
    for key, entry in results.items():
        if not isinstance(entry, dict):
            continue
        cid = canonical_card_id(entry.get("card_id", "")) or canonical_card_id(key)
        side = str(entry.get("side") or "").strip().lower()
        if not cid or not side:
            continue
        if side != "star" and is_pure_star_entry(entry):
            continue
        done.add(f"{cid}_{side}")
    return done


def compute_star_done_cids(results: Dict[str, Any]) -> set[str]:
    """Collects canonical card IDs that already have an AI Star ability AST.

    Args:
        results: Mapping of AI entry keys to saved AST dictionaries.

    Returns:
        Set of canonical card IDs that already contain at least one ``is_star`` ability.
    """
    done: set[str] = set()
    for entry in results.values():
        cid = canonical_card_id(entry.get("card_id", ""))
        if not cid:
            continue
        if entry.get("side") == "star":
            done.add(cid)
            continue
        abilities = entry.get("ast", {}).get("abilities", [])
        if any(bool(ab.get("is_star")) for ab in abilities):
            done.add(cid)
    return done


def is_entry_done(
    cid: str,
    side: str,
    existing: Optional[set | Dict[str, Any]] = None,
    star_done_cids: Optional[set[str]] = None,
    results: Optional[Dict[str, Any]] = None,
) -> bool:
    """Checks accurately whether a card side or Star entry has already been extracted.

    Unlike legacy heuristics, presence of ``{cid}_top`` never skips ``bottom`` or
    ``star`` entries, presence of ``{cid}_shared`` never skips ``top``, and a
    legacy pure-``STAR:`` entry stored under ``{cid}_top`` or ``{cid}_shared``
    never marks a regular ``top`` or ``shared`` side as done.

    Args:
        cid: Canonical card identifier.
        side: Unparsed entry side key (``top``, ``bottom``, ``shared``, or ``star``).
        existing: Set of existing result keys (``{cid}_{side}``) or raw results dict.
        star_done_cids: Set of card IDs that already have an extracted Star ability.
        results: Optional full AI results dictionary for inspecting pure-Star entries.

    Returns:
        True if the exact requested side/star entry is already present.
    """
    results_map = results if results is not None else (existing if isinstance(existing, dict) else None)
    existing_keys = existing if isinstance(existing, set) else None

    if existing_keys is None and results_map is None:
        return False
    canon_cid = canonical_card_id(cid)
    norm_side = str(side).strip().lower()
    target_key = f"{canon_cid}_{norm_side}"

    if norm_side == "star":
        if existing_keys and target_key in existing_keys:
            return True
        if star_done_cids and canon_cid in star_done_cids:
            return True
        if results_map is not None:
            if target_key in results_map or canon_cid in compute_star_done_cids(results_map):
                return True
        return False

    if results_map is not None:
        entry = results_map.get(target_key)
        if entry is not None:
            return not is_pure_star_entry(entry)
        return False

    return bool(existing_keys and target_key in existing_keys)


def _iter_unparsed_entries(log_path: Path) -> List[Dict[str, str]]:
    """Parses all entries from ``unparsed_abilities.log`` into normalized dicts.

    Args:
        log_path: Path to the Stage 8 unparsed log file.

    Returns:
        List of entry dicts containing ``card_identifier``, ``side``, ``card_name``,
        ``raw_ability``, and optional ``reason``.
    """
    if not log_path.exists():
        return []
    parsed: List[Dict[str, str]] = []
    current: Dict[str, str] = {}
    with log_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^\[(.*?)\]\s*\((.*?)\)\s*(.*)$", line)
            if m:
                if current and "raw_ability" in current:
                    parsed.append(current)
                current = {
                    "card_identifier": canonical_card_id(m.group(1)),
                    "side": m.group(2).strip(),
                    "card_name": m.group(3).strip(),
                }
            elif line.startswith("Ability:") and current:
                current["raw_ability"] = line[8:].strip()
            elif line.startswith("Reason:") and current:
                current["reason"] = line[7:].strip()
        if current and "raw_ability" in current:
            parsed.append(current)
    return parsed


def _ensure_star_ast_dict(ast_dict: Dict[str, Any], side: str, raw_ability: str) -> Dict[str, Any]:
    """Ensures cached/copied AST dictionaries carry Star flags when required.

    Args:
        ast_dict: Serialized CardSideLogic dictionary.
        side: Entry side key from Stage 8 unparsed log.
        raw_ability: Raw ability text.

    Returns:
        Normalized copy/mutated AST dictionary with ``is_star=True`` on Star clauses.
    """
    is_star = side == "star" or bool(_STAR_PREFIX_RE.match(raw_ability.strip()))
    if not is_star:
        return ast_dict
    for ab in ast_dict.get("abilities", []):
        ab["is_star"] = True
        raw_trig = ab.get("trigger_event")
        if isinstance(raw_trig, list):
            if not raw_trig:
                ab["trigger_event"] = TriggerEvent.STAR_PHASE.value
        else:
            trig = str(raw_trig or "").strip().lower()
            if not trig or trig == "star":
                ab["trigger_event"] = TriggerEvent.STAR_PHASE.value
        ab_id = ab.get("ability_id") or "ability"
        if not ab_id.lower().startswith("star_"):
            ab["ability_id"] = f"star_{ab_id}"
        if ab.get("activation_mode") != "triggered":
            ab["activation_mode"] = "triggered"
    return ast_dict


def _normalize_side_ast_dict(ast_dict: Dict[str, Any], side: str, raw_ability: str) -> Dict[str, Any]:
    """Normalizes Star flags and choice_groups on serialized CardSideLogic dictionaries.

    Args:
        ast_dict: Serialized CardSideLogic dictionary.
        side: Entry side key from Stage 8 unparsed log.
        raw_ability: Raw ability text for this side.

    Returns:
        Normalized CardSideLogic dictionary.
    """
    normalized = _ensure_star_ast_dict(ast_dict, side, raw_ability)
    is_star = side == "star" or bool(_STAR_PREFIX_RE.match(raw_ability.strip()))
    reconcile_side_choice_groups(
        normalized,
        raw_text="" if is_star else raw_ability,
        star_text=raw_ability if is_star else "",
    )
    return normalized


def load_unparsed_sample(
    offset: int = 0,
    max_items: int = 10,
    existing: Optional[set] = None,
    star_done_cids: Optional[set[str]] = None,
    results: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Parses unparsed ability entries with offset, limit, and exact side filtering.

    Args:
        offset: Number of non-extracted entries to skip.
        max_items: Maximum entries to return.
        existing: Set of already generated entry keys (``{card_id}_{side}``) to skip.
        star_done_cids: Optional set of card IDs that already possess an ``is_star`` ability.
        results: Optional full AI results dict to filter legacy pure-Star entries.

    Returns:
        List of unparsed card entry dictionaries.
    """
    entries: List[Dict[str, str]] = []
    seen = 0
    for item in _iter_unparsed_entries(UNPARSED_LOG):
        cid = item["card_identifier"]
        side = item["side"]
        if is_entry_done(cid, side, existing=existing, star_done_cids=star_done_cids, results=results):
            continue
        seen += 1
        if seen > offset:
            entries.append(item)
            if len(entries) >= max_items:
                break
    print(f"Loaded {len(entries)} unparsed cards for AI extraction.")
    return entries


from fact_matrix import extract_ast_facts, verify_fact_matrix


def _collect_trigger_issues(side_logic: CardSideLogic) -> List[str]:
    """Detects missing trigger_event on triggered abilities or triggers on non-triggered abilities."""
    trig_issues: List[str] = []
    for ab in side_logic.abilities:
        if ab.activation_mode == ActivationMode.TRIGGERED and not ab.trigger_event:
            trig_issues.append(f"Missing required trigger_event on triggered ability '{ab.ability_id}'")
        elif ab.activation_mode != ActivationMode.TRIGGERED and (
            ab.trigger_event or ab.trigger_subject or ab.trigger_source
        ):
            trig_issues.append(
                f"Non-triggered ability '{ab.ability_id}' ({ab.activation_mode.value}) cannot have trigger_event/trigger_subject/trigger_source"
            )
    return trig_issues


def _process_single_card(backend: str, prompt: str, name: str, raw_ability: str = "") -> Optional[CardSideLogic]:
    """Queries backend and performs multi-turn self-correction for schema or factual errors.

    Args:
        backend: Provider identifier.
        prompt: Initial extraction prompt.
        name: Card name for logging.
        raw_ability: Raw text for factual verification.

    Returns:
        Validated CardSideLogic instance or None if unrecoverable.
    """
    messages = [{"role": "user", "content": prompt}]
    raw_resp = query_llm_messages(backend, messages)

    try:
        data = json.loads(raw_resp)
        validated = CardSideLogic.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as err:
        log_finding(name, "SCHEMA_ERROR", str(err), resolved=False, raw_ability=raw_ability)
        print(f" [RETRY] Validation error for {name}: {err}\n Requesting self-correction...", flush=True)
        time.sleep(2.0)
        correction_msg = (
            f"Your generated JSON had the following validation error:\n{err}\n\n"
            "Please fix the error and return ONLY the corrected valid JSON."
        )
        retry_messages = [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": raw_resp},
            {"role": "user", "content": correction_msg}
        ]
        retry_resp = query_llm_messages(backend, retry_messages)
        retry_data = json.loads(retry_resp)
        validated = CardSideLogic.model_validate(retry_data)
        log_finding(name, "SCHEMA_ERROR", f"Auto-corrected: {err}", resolved=True, raw_ability=raw_ability)
        print(f" [OK-RETRY] Successfully self-corrected schema for {name}!", flush=True)

    # In-flight fact invariant, trigger integrity & chained target check
    if validated and raw_ability:
        _, fact_issues = verify_fact_matrix(raw_ability, extract_ast_facts(validated))
        ambig_issues = normalize_chained_targets(validated)
        trig_issues = _collect_trigger_issues(validated)
        if trig_issues:
            log_finding(name, "MISSING_OR_INVALID_TRIGGER_EVENT", ", ".join(trig_issues), resolved=False, raw_ability=raw_ability)
        issues = fact_issues + ambig_issues + trig_issues
        if issues:
            log_finding(name, "VALIDATION_ISSUE", ", ".join(issues), resolved=False, raw_ability=raw_ability)
            print(f" [RETRY-ISSUES] Issues for {name}: {issues}\n Requesting correction...", flush=True)
            time.sleep(2.0)
            corr_msg = (
                f"Your JSON had the following issues:\n{', '.join(issues)}\n\n"
                "Please fix these issues (specify ref_step for chained targets, include missing facts) and return ONLY valid JSON."
            )
            retry_messages = [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": raw_resp},
                {"role": "user", "content": corr_msg}
            ]
            try:
                retry_resp = query_llm_messages(backend, retry_messages)
                retry_data = json.loads(retry_resp)
                validated = CardSideLogic.model_validate(retry_data)
                normalize_chained_targets(validated)
                log_finding(name, "VALIDATION_ISSUE", f"Auto-fixed: {', '.join(issues)}", resolved=True, raw_ability=raw_ability)
                print(f" [OK-RETRY] Successfully fixed issues for {name}!", flush=True)
            except Exception as e:
                print(f" [WARN] Correction retry could not parse: {sanitize_error_message(str(e))}. Keeping previous valid AST.", flush=True)

    return validated


def _worker_task(
    item: Dict[str, str], backend: str, sys_prompt: str,
    results: Dict[str, Any], text_cache: Dict[str, Dict[str, Any]],
    lock: threading.Lock, stats: Dict[str, int],
    linker: Optional[CardLinker] = None
) -> None:
    """Worker task processing a single card ability in parallel."""
    cid = canonical_card_id(item["card_identifier"])
    name, raw = item["card_name"], item["raw_ability"]
    side = item["side"]
    card_key = f"{cid}_{side}"
    raw_clean = raw.strip()

    # Instant resolution if another worker just completed the identical text
    with lock:
        if raw_clean in text_cache:
            cached_ast = _normalize_side_ast_dict(copy.deepcopy(text_cache[raw_clean]), side, raw_clean)
            results[card_key] = {
                "card_id": cid,
                "card_name": name,
                "side": side,
                "raw_ability": raw,
                "ast": cached_ast,
            }
            stats["success"] += 1
            print(f" [OK-CACHE] Reused validated AST for {name} ({stats['success']}/{stats['total']})", flush=True)
            return

    prompt = f"{sys_prompt}\n\nParse this card ability for card '{name}':\n\"{raw}\""
    try:
        validated = _process_single_card(backend, prompt, name, raw_ability=raw)
        if validated:
            if side == "star" or _STAR_PREFIX_RE.match(raw_clean):
                for ab in validated.abilities:
                    ab.is_star = True
                    if not ab.trigger_event:
                        ab.trigger_event = TriggerEvent.STAR_PHASE
                    if not ab.ability_id.lower().startswith("star_"):
                        ab.ability_id = f"star_{ab.ability_id}"
                    if ab.activation_mode == "immediate":
                        ab.activation_mode = "triggered"
            normalize_chained_targets(validated)
            is_star_entry = side == "star" or bool(_STAR_PREFIX_RE.match(raw_clean))
            reconcile_side_choice_groups(
                validated,
                raw_text="" if is_star_entry else raw_clean,
                star_text=raw_clean if is_star_entry else "",
            )
            if linker:
                link_side_logic_targets(validated, linker)
            with lock:
                ast_dict = validated.model_dump()
                results[card_key] = {
                    "card_id": cid,
                    "card_name": name,
                    "side": side,
                    "raw_ability": raw,
                    "ast": ast_dict,
                }
                text_cache[raw_clean] = ast_dict
                stats["success"] += 1
                for _ in range(3):
                    try:
                        AI_OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
                        break
                    except OSError:
                        time.sleep(0.5)
                resolve_card_findings(name)
                print(f" [OK] Validated {name} ({stats['success']}/{stats['total']})", flush=True)
    except QuotaExhaustedError as qe:
        safe_err = sanitize_error_message(str(qe))
        log_finding(name, "QUOTA_EXHAUSTED", safe_err, resolved=False, raw_ability=raw, card_identifier=cid)
        print(f"\n[FATAL] Quota exhausted on card '{name}': {safe_err}. Cooling down 45s...", flush=True)
        time.sleep(45.0)
    except Exception as e:
        safe_err = sanitize_error_message(str(e))
        log_finding(name, "EXTRACTION_FAILED", safe_err, resolved=False, raw_ability=raw, card_identifier=cid)
        print(f" [FAIL] Failed {name}: {safe_err}", flush=True)


def auto_resolve_exact_text_matches(
    results: Dict[str, Any],
    text_cache: Dict[str, Dict[str, Any]],
) -> int:
    """Scans unparsed abilities and auto-resolves identical raw text matches.

    Args:
        results: In-memory dictionary of all extracted ASTs.
        text_cache: Mapping of exact raw_ability string to validated AST dictionary.

    Returns:
        Number of entries newly auto-resolved.
    """
    if not UNPARSED_LOG.exists() or not text_cache:
        return 0

    existing_keys = compute_done_entry_keys(results)
    star_done_cids = compute_star_done_cids(results)
    resolved_count = 0

    for item in _iter_unparsed_entries(UNPARSED_LOG):
        cid = item["card_identifier"]
        side = item["side"]
        card_key = f"{cid}_{side}"
        raw = item["raw_ability"].strip()
        if is_entry_done(cid, side, existing=existing_keys, star_done_cids=star_done_cids, results=results):
            continue
        if raw in text_cache:
            cached_ast = _normalize_side_ast_dict(copy.deepcopy(text_cache[raw]), side, raw)
            results[card_key] = {
                "card_id": cid,
                "card_name": item["card_name"],
                "side": side,
                "raw_ability": item["raw_ability"],
                "ast": cached_ast,
            }
            existing_keys.add(card_key)
            if side == "star":
                star_done_cids.add(cid)
            resolved_count += 1

    return resolved_count


def run_ai_generator() -> None:
    """Batch-processes unparsed abilities using concurrent worker threads."""
    parser = argparse.ArgumentParser(description="Stage 9: AI Ability Extractor")
    parser.add_argument("--backend", choices=["gemini", "groq", "openrouter", "ollama", "nvidia"], default="gemini")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=1, help="Parallel worker threads")
    parser.add_argument("--max-runtime", type=float, default=7200.0)
    parser.add_argument("--overwrite", action="store_true", help="Force re-extraction of cards")
    args = parser.parse_args()

    load_env()
    results: Dict[str, Any] = {}
    if AI_OUTPUT_FILE.exists():
        try:
            results = json.loads(AI_OUTPUT_FILE.read_text(encoding="utf-8"))
            print(f"Loaded {len(results)} existing ASTs from {AI_OUTPUT_FILE}")
        except Exception:
            results = {}

    text_cache: Dict[str, Dict[str, Any]] = {}
    for entry in results.values():
        raw_text = entry.get("raw_ability", "").strip()
        if raw_text and "ast" in entry:
            if is_pure_star_entry(entry) and not _STAR_PREFIX_RE.match(raw_text):
                continue
            text_cache[raw_text] = entry["ast"]

    newly_resolved = auto_resolve_exact_text_matches(results, text_cache)
    if newly_resolved > 0:
        print(f"Auto-resolved {newly_resolved} cards by exact raw_ability match against existing ASTs.")
        AI_OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Selected AI backend: {args.backend.upper()} (Target: {args.count} cards, Workers: {args.workers})")
    skip_set = None if args.overwrite else compute_done_entry_keys(results)
    star_done_cids = None if args.overwrite else compute_star_done_cids(results)
    samples = load_unparsed_sample(
        offset=args.offset,
        max_items=args.count,
        existing=skip_set,
        star_done_cids=star_done_cids,
        results=None if args.overwrite else results,
    )
    if not samples:
        print("No unparsed cards left to process.")
        return

    sys_prompt = build_system_prompt()
    lock = threading.Lock()
    stats = {"success": 0, "total": len(samples)}
    linker = None
    if CARDS_EXT_FILE.exists():
        try:
            db_cards = json.loads(CARDS_EXT_FILE.read_text(encoding="utf-8")).get("cards", [])
            linker = CardLinker(db_cards)
        except Exception:
            pass
    print(f"Starting {args.workers} concurrent workers for {len(samples)} cards...", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(_worker_task, item, args.backend, sys_prompt, results, text_cache, lock, stats, linker)
            for item in samples
        ]
        concurrent.futures.wait(futures, timeout=args.max_runtime)

    rate = (stats["success"] / len(samples) * 100) if samples else 0
    print(f"\nFinished: {stats['success']}/{len(samples)} ({rate:.1f}%) ASTs in batch. Total saved: {len(results)} -> {AI_OUTPUT_FILE}")

    post_resolved = auto_resolve_exact_text_matches(results, text_cache)
    if post_resolved > 0:
        print(f"Post-batch auto-resolved {post_resolved} cards with identical text across remaining unparsed abilities.")
        AI_OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    fs = get_findings_summary()
    if fs["total"]:
        print(f"[FINDINGS] Total logged: {fs['total']} ({fs['unresolved']} unresolved) -> {FINDINGS_FILE}")


if __name__ == "__main__":
    run_ai_generator()
