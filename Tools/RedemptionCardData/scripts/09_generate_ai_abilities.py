"""Pipeline Stage 9: AI-Assisted Ability Extractor (Offline Batch)

Processes unparsed abilities using Gemini, Groq, OpenRouter, or Ollama with strict
Pydantic JSON schema constraints, automatic resume, and 1-turn self-correction retry.
"""

from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import sys
import time
from typing import Any, Dict, List, Optional
from pydantic import ValidationError

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(Path(__file__).resolve().parent), str(BASE_DIR)])

from models.logic.card_logic import CardSideLogic
from ability_prompt import build_system_prompt
from ai_client import load_env, query_llm_messages, QuotaExhaustedError

CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

UNPARSED_LOG = BASE_DIR / _config.get("unparsed_abilities_log", "data/unparsed_abilities.log")
AI_OUTPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"


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
                    cid, name, side = current["card_identifier"], current["card_name"], current["side"]
                    k = f"{cid}_{name}_{side}" if cid != name else f"{name}_{side}"
                    if not (existing and k in existing):
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
            cid, name, side = current["card_identifier"], current["card_name"], current["side"]
            k = f"{cid}_{name}_{side}" if cid != name else f"{name}_{side}"
            if not (existing and k in existing):
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
        print(f" [OK-RETRY] Successfully self-corrected schema for {name}!", flush=True)

    # In-flight fact invariant check (numbers, modifiers, primary actions)
    if validated and raw_ability:
        passed_facts, fact_issues = verify_fact_matrix(raw_ability, extract_ast_facts(validated))
        if not passed_facts:
            print(f" [FACT-RETRY] Fact check issues for {name}: {fact_issues}\n Requesting factual correction...", flush=True)
            time.sleep(2.0)
            fact_msg = (
                f"Your JSON missed the following factual card mechanics from the text:\n"
                f"{', '.join(fact_issues)}\n\n"
                "Please update the JSON to accurately include these mechanics and return ONLY the corrected JSON."
            )
            retry_messages = [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": raw_resp},
                {"role": "user", "content": fact_msg}
            ]
            retry_resp = query_llm_messages(backend, retry_messages)
            try:
                retry_data = json.loads(retry_resp)
                validated = CardSideLogic.model_validate(retry_data)
                print(f" [OK-FACT-RETRY] Successfully fixed facts for {name}!", flush=True)
            except Exception as e:
                print(f" [WARN] Fact retry could not parse: {e}. Keeping previous valid AST.", flush=True)

    return validated


def run_ai_generator() -> None:
    """Batch-processes unparsed abilities using the available LLM backend."""
    parser = argparse.ArgumentParser(description="Stage 9: AI Ability Extractor")
    parser.add_argument("--backend", choices=["gemini", "groq", "openrouter", "ollama"], default="openrouter")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--delay", type=float, default=7.5)
    parser.add_argument("--max-runtime", type=float, default=7200.0)
    args = parser.parse_args()

    load_env()
    results: Dict[str, Any] = {}
    if AI_OUTPUT_FILE.exists():
        try:
            results = json.loads(AI_OUTPUT_FILE.read_text(encoding="utf-8"))
            print(f"Loaded {len(results)} existing ASTs from {AI_OUTPUT_FILE}")
        except Exception:
            results = {}

    print(f"Selected AI backend: {args.backend.upper()} (Target: {args.count} cards, delay: {args.delay}s)")
    samples = load_unparsed_sample(offset=args.offset, max_items=args.count, existing=set(results.keys()))
    if not samples:
        print("No unparsed cards left to process.")
        return

    sys_prompt = build_system_prompt()
    success_count = 0
    start_time = time.time()
    try:
        for idx, item in enumerate(samples, start=1):
            if time.time() - start_time > args.max_runtime:
                print(f"\n[TIMEOUT] Reached {args.max_runtime}s runtime. Aborting batch.")
                break
            cid, name, raw = item["card_identifier"], item["card_name"], item["raw_ability"]
            card_key = f"{cid}_{name}_{item['side']}" if cid != name else f"{name}_{item['side']}"
            print(f"[{idx}/{len(samples)}] [{cid}] {name} -> '{raw}'", flush=True)
            prompt = f"{sys_prompt}\n\nParse this card ability for card '{name}':\n\"{raw}\""
            try:
                validated = _process_single_card(args.backend, prompt, name, raw_ability=raw)
                if validated:
                    results[card_key] = {
                        "card_name": name,
                        "side": item["side"],
                        "raw_ability": raw,
                        "ast": validated.model_dump()
                    }
                    AI_OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
                    success_count += 1
                    print(f" [OK] Validated {name}", flush=True)
            except QuotaExhaustedError as qe:
                print(f"\n[FATAL] Quota exhausted on card '{name}': {qe}", flush=True)
                break
            except Exception as e:
                print(f" [FAIL] Failed {name}: {e}", flush=True)
            if idx < len(samples):
                time.sleep(args.delay)
    finally:
        if results:
            AI_OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
            AI_OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    rate = (success_count / len(samples) * 100) if samples else 0
    print(f"\nFinished: {success_count}/{len(samples)} ({rate:.1f}%) ASTs in batch. Total saved: {len(results)} -> {AI_OUTPUT_FILE}")


if __name__ == "__main__":
    run_ai_generator()
