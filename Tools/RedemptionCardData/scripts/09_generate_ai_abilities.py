"""Pipeline Stage 9: AI-Assisted Ability Extractor (Offline Batch)

Processes unparsed abilities using Gemini, Groq, OpenRouter, or Ollama with strict
Pydantic JSON schema constraints, automatic resume, and 1-turn self-correction retry.
"""

from __future__ import annotations
import argparse
import concurrent.futures
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

from models.logic.card_logic import CardSideLogic
from ability_prompt import build_system_prompt
from ai_client import load_env, query_llm_messages, QuotaExhaustedError
from utils.finding_logger import log_finding, resolve_card_findings, get_findings_summary, FINDINGS_FILE
from utils.card_linker import CardLinker, link_side_logic_targets, normalize_chained_targets

_config = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8")) if (BASE_DIR / "config.json").exists() else {}

UNPARSED_LOG = BASE_DIR / _config.get("unparsed_abilities_log", "data/unparsed_abilities.log")
AI_OUTPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
CARDS_EXT_FILE = BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")


def load_unparsed_sample(offset: int = 0, max_items: int = 10, existing: Optional[set] = None) -> List[Dict[str, str]]:
    """Parses unparsed ability entries with offset, limit, and existing card filtering.

    Args:
        offset: Number of non-extracted cards to skip.
        max_items: Maximum entries to return.
        existing: Set of already generated card keys to skip.

    Returns:
        List of unparsed card dictionaries.
    """
    if not UNPARSED_LOG.exists():
        return []
    entries: List[Dict[str, str]] = []
    current: Dict[str, str] = {}
    seen = 0
    with UNPARSED_LOG.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^\[(.*?)\]\s*\((.*?)\)\s*(.*)$", line)
            if m:
                if current and "raw_ability" in current:
                    cid, side = current["card_identifier"], current["side"]
                    is_done = existing and any(f"{cid}_{s}" in existing for s in (side, "shared", "top"))
                    if not is_done:
                        seen += 1
                        if seen > offset:
                            entries.append(current)
                            if len(entries) >= max_items:
                                break
                current = {"card_identifier": m.group(1), "side": m.group(2), "card_name": m.group(3)}
            elif line.startswith("Ability:") and current:
                current["raw_ability"] = line[8:].strip()
            elif line.startswith("Reason:") and current:
                current["reason"] = line[7:].strip()
        if current and "raw_ability" in current and len(entries) < max_items:
            cid, side = current["card_identifier"], current["side"]
            is_done = existing and any(f"{cid}_{s}" in existing for s in (side, "shared", "top"))
            if not is_done:
                seen += 1
                if seen > offset:
                    entries.append(current)
    print(f"Loaded {len(entries)} unparsed cards for AI extraction.")
    return entries


from fact_matrix import extract_ast_facts, verify_fact_matrix


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

    # In-flight fact invariant & chained target check
    if validated and raw_ability:
        _, fact_issues = verify_fact_matrix(raw_ability, extract_ast_facts(validated))
        ambig_issues = normalize_chained_targets(validated)
        issues = fact_issues + ambig_issues
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
                print(f" [WARN] Correction retry could not parse: {e}. Keeping previous valid AST.", flush=True)

    return validated


def _worker_task(
    item: Dict[str, str], backend: str, sys_prompt: str,
    results: Dict[str, Any], lock: threading.Lock, stats: Dict[str, int],
    linker: Optional[CardLinker] = None
) -> None:
    """Worker task processing a single card ability in parallel."""
    cid, name, raw = item["card_identifier"], item["card_name"], item["raw_ability"]
    card_key = f"{cid}_{item['side']}"
    prompt = f"{sys_prompt}\n\nParse this card ability for card '{name}':\n\"{raw}\""
    try:
        validated = _process_single_card(backend, prompt, name, raw_ability=raw)
        if validated:
            normalize_chained_targets(validated)
            if linker:
                link_side_logic_targets(validated, linker)
            with lock:
                results[card_key] = {
                    "card_id": cid,
                    "card_name": name,
                    "side": item["side"],
                    "raw_ability": raw,
                    "ast": validated.model_dump()
                }
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
        log_finding(name, "QUOTA_EXHAUSTED", str(qe), resolved=False, raw_ability=raw, card_identifier=cid)
        print(f"\n[FATAL] Quota exhausted on card '{name}': {qe}", flush=True)
    except Exception as e:
        log_finding(name, "EXTRACTION_FAILED", str(e), resolved=False, raw_ability=raw, card_identifier=cid)
        print(f" [FAIL] Failed {name}: {e}", flush=True)


def run_ai_generator() -> None:
    """Batch-processes unparsed abilities using concurrent worker threads."""
    parser = argparse.ArgumentParser(description="Stage 9: AI Ability Extractor")
    parser.add_argument("--backend", choices=["gemini", "groq", "openrouter", "ollama", "nvidia"], default="nvidia")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4, help="Parallel worker threads")
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

    print(f"Selected AI backend: {args.backend.upper()} (Target: {args.count} cards, Workers: {args.workers})")
    skip_set = None if args.overwrite else set(results.keys())
    samples = load_unparsed_sample(offset=args.offset, max_items=args.count, existing=skip_set)
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
            executor.submit(_worker_task, item, args.backend, sys_prompt, results, lock, stats, linker)
            for item in samples
        ]
        concurrent.futures.wait(futures, timeout=args.max_runtime)

    rate = (stats["success"] / len(samples) * 100) if samples else 0
    print(f"\nFinished: {stats['success']}/{len(samples)} ({rate:.1f}%) ASTs in batch. Total saved: {len(results)} -> {AI_OUTPUT_FILE}")
    fs = get_findings_summary()
    if fs["total"]:
        print(f"[FINDINGS] Total logged: {fs['total']} ({fs['unresolved']} unresolved) -> {FINDINGS_FILE}")


if __name__ == "__main__":
    run_ai_generator()
