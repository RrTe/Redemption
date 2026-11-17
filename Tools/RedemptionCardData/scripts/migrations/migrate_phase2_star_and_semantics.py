"""Idempotent Phase 2 migration for legacy STAR entries, missing sides, and semantic repairs."""

from __future__ import annotations

import argparse
import importlib
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from models.enums.zone import Zone
from models.logic.card_logic import CardSideLogic
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.migrations.phase2_instead_repairs import INSTEAD_REPAIRS
from scripts.migrations.phase2_missing_asts import MISSING_ASTS_PART1
from scripts.migrations.phase2_missing_asts_part2 import MISSING_ASTS_PART2
from scripts.migrations.phase2_missing_asts_part3 import MISSING_ASTS_PART3
from scripts.migrations.phase2_protect_repairs import PROTECT_AND_WORTH_REPAIRS
from scripts.migrations.phase2_protect_repairs_part2 import PROTECT_REPAIRS_PART2
from scripts.migrations.phase2_semantic_repairs import SEMANTIC_REPAIRS_PART1
from scripts.migrations.phase2_semantic_repairs_part2 import SEMANTIC_REPAIRS_PART2
from scripts.migrations.phase2_semantic_repairs_part3 import SEMANTIC_REPAIRS_PART3
from scripts.migrations.phase2_worth_repairs import WORTH_AND_STAGE08_INSTEAD_REPAIRS
from scripts.utils.card_helpers import get_card_name, get_side_field, get_star_ability
from scripts.utils.card_linker import CardLinker, link_side_logic_targets, normalize_chained_targets

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

EXT_PATH = ROOT_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = ROOT_DIR / "data" / "ai_generated_abilities.json"

MIXED_STAR_CIDS: Tuple[str, ...] = ("-550596861", "985228461", "1476690098", "896037237")
STALE_SHARED_KEYS: Tuple[str, ...] = (
    "973131797_shared",
    "-1782881223_shared",
    "1381610582_shared",
    "2020698611_shared",
    "2047453172_shared",
    "-1594853387_shared",
    "168335151_bottom",
)


def _is_pure_star(entry: Dict[str, Any]) -> bool:
    """Checks whether an AI entry represents only a StarAbility without regular side text."""
    gen09 = importlib.import_module("scripts.09_generate_ai_abilities")
    return bool(gen09.is_pure_star_entry(entry))


def _resolve_raw_ability(card: Dict[str, Any], side: str) -> str:
    """Resolves the canonical raw ability text for a card side."""
    if side == "star":
        return f"STAR: {get_star_ability(card)}"
    raw = get_side_field(card, side, "SpecialAbility")
    if not raw and side in ("top", "bottom"):
        raw = get_side_field(card, "shared", "SpecialAbility")
    return str(raw or "")


def _migrate_star_entries(
    ai_data: Dict[str, Any],
    ext_by_id: Dict[str, Dict[str, Any]],
    touched: Set[str],
) -> Dict[str, int]:
    """Moves legacy pure-STAR entries to _star and splits known mixed-STAR entries."""
    counts = {"moved_pure_star": 0, "removed_dup_star": 0, "split_mixed": 0, "removed_stale_shared": 0}

    for cid in MIXED_STAR_CIDS:
        top_key = f"{cid}_top"
        star_key = f"{cid}_star"
        entry = ai_data.get(top_key)
        if not isinstance(entry, dict):
            continue
        abilities = entry.get("ast", {}).get("abilities", [])
        star_abs = [a for a in abilities if a.get("is_star")]
        reg_abs = [a for a in abilities if not a.get("is_star")]
        if not star_abs or not reg_abs:
            continue
        card = ext_by_id.get(cid, {})
        star_raw = f"STAR: {get_star_ability(card)}"
        top_raw = str(get_side_field(card, "top", "SpecialAbility") or "")
        if star_key not in ai_data:
            ai_data[star_key] = {
                "card_id": cid,
                "card_name": entry.get("card_name") or get_card_name(card),
                "side": "star",
                "raw_ability": star_raw,
                "ast": {"classes": entry.get("ast", {}).get("classes", []), "modifiers": [], "abilities": star_abs},
            }
            touched.add(star_key)
        ai_data[top_key] = {
            "card_id": cid,
            "card_name": entry.get("card_name") or get_card_name(card),
            "side": "top",
            "raw_ability": top_raw,
            "ast": {
                "classes": entry.get("ast", {}).get("classes", []),
                "modifiers": entry.get("ast", {}).get("modifiers", []),
                "abilities": reg_abs,
            },
        }
        touched.add(top_key)
        counts["split_mixed"] += 1

    for key in list(ai_data.keys()):
        if key.endswith("_star"):
            continue
        entry = ai_data.get(key)
        if not isinstance(entry, dict) or "_" not in key:
            continue
        cid, side_name = key.rsplit("_", 1)
        if side_name not in ("top", "shared") or not _is_pure_star(entry):
            continue
        star_key = f"{cid}_star"
        if star_key not in ai_data:
            migrated = dict(entry)
            migrated["side"] = "star"
            card = ext_by_id.get(cid, {})
            if get_star_ability(card):
                migrated["raw_ability"] = f"STAR: {get_star_ability(card)}"
            ai_data[star_key] = migrated
            touched.add(star_key)
            counts["moved_pure_star"] += 1
        else:
            counts["removed_dup_star"] += 1
        del ai_data[key]

    for stale_key in STALE_SHARED_KEYS:
        if stale_key in ai_data:
            del ai_data[stale_key]
            counts["removed_stale_shared"] += 1

    return counts


def _apply_curated_dicts(
    ai_data: Dict[str, Any],
    ext_by_id: Dict[str, Dict[str, Any]],
    touched: Set[str],
) -> Dict[str, int]:
    """Merges curated missing ASTs and semantic repair ASTs into ai_data."""
    missing_merged: Dict[str, Dict[str, Any]] = {}
    for part in (MISSING_ASTS_PART1, MISSING_ASTS_PART2, MISSING_ASTS_PART3):
        missing_merged.update(part)

    repair_merged: Dict[str, Dict[str, Any]] = {}
    for part in (
        SEMANTIC_REPAIRS_PART1,
        SEMANTIC_REPAIRS_PART2,
        SEMANTIC_REPAIRS_PART3,
        PROTECT_AND_WORTH_REPAIRS,
        PROTECT_REPAIRS_PART2,
        WORTH_AND_STAGE08_INSTEAD_REPAIRS,
        INSTEAD_REPAIRS,
    ):
        repair_merged.update(part)

    for key, entry in missing_merged.items():
        ai_data[key] = json.loads(json.dumps(entry))
        touched.add(key)

    for key, ast_dict in repair_merged.items():
        cid, side_name = key.rsplit("_", 1)
        card = ext_by_id.get(cid, {})
        existing = ai_data.get(key, {})
        raw_ability = _resolve_raw_ability(card, side_name) or str(existing.get("raw_ability") or "")
        ai_data[key] = {
            "card_id": cid,
            "card_name": get_card_name(card) or existing.get("card_name", ""),
            "side": side_name,
            "raw_ability": raw_ability,
            "ast": json.loads(json.dumps(ast_dict)),
        }
        touched.add(key)

    return {"missing_applied": len(missing_merged), "repairs_applied": len(repair_merged)}


def _apply_global_hygiene(ai_data: Dict[str, Any], touched: Set[str]) -> Dict[str, int]:
    """Normalizes draw scopes and fortresses mislabeled as site across all AI entries."""
    draw_fixed = 0
    fort_fixed = 0
    for key, entry in ai_data.items():
        if not isinstance(entry, dict):
            continue
        raw_lower = str(entry.get("raw_ability") or "").lower()
        is_pure_fort = "fortress" in raw_lower and "site" not in raw_lower
        ast_dict = entry.get("ast") or {}
        changed = False
        for ability in ast_dict.get("abilities", []):
            for effect in ability.get("effects", []):
                target = effect.get("target")
                if not isinstance(target, dict):
                    continue
                if effect.get("action") == "draw" and target.get("scope") != [Zone.DECK.value]:
                    target["scope"] = [Zone.DECK.value]
                    changed = True
                    draw_fixed += 1
                if is_pure_fort and target.get("target_type") == "site":
                    target["target_type"] = "fortress"
                    if not target.get("card_titles") and target.get("target_card_ids"):
                        target["target_card_ids"] = []
                    changed = True
                    fort_fixed += 1
        if changed:
            touched.add(key)
    return {"draw_scope_fixed": draw_fixed, "fort_as_site_fixed": fort_fixed}


def _validate_touched(
    ai_data: Dict[str, Any],
    touched: Set[str],
    linker: CardLinker,
) -> Tuple[List[str], List[str]]:
    """Links card_titles, validates CardSideLogic schemas, and runs verify_fact_matrix."""
    schema_errors: List[str] = []
    fact_errors: List[str] = []
    for key in sorted(touched):
        entry = ai_data.get(key)
        if not isinstance(entry, dict):
            continue
        try:
            model = CardSideLogic.model_validate(entry["ast"])
            normalize_chained_targets(model)
            link_side_logic_targets(model, linker)
            entry["ast"] = model.model_dump(exclude_none=True, mode="json")
        except Exception as exc:
            schema_errors.append(f"{key} ({entry.get('card_name')}): {exc}")
            continue
        raw = str(entry.get("raw_ability") or "")
        fm_text = raw[5:].strip() if raw.startswith("STAR:") else raw
        passed, issues = verify_fact_matrix(fm_text, extract_ast_facts(model))
        if not passed:
            fact_errors.append(f"{key} ({entry.get('card_name')}): {issues} | raw={fm_text!r}")
    return schema_errors, fact_errors


def migrate_all(dry_run: bool = False) -> Dict[str, Any]:
    """Runs the Phase 2 migration idempotently and validates all modified entries.

    Args:
        dry_run: When True, validates everything without modifying disk files.

    Returns:
        Summary dictionary with migration and validation counts.
    """
    ext_cards: List[Dict[str, Any]] = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
    ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
    linker = CardLinker(ext_cards)
    ai_data: Dict[str, Any] = json.loads(AI_PATH.read_text(encoding="utf-8"))

    touched: Set[str] = set()
    star_counts = _migrate_star_entries(ai_data, ext_by_id, touched)
    curated_counts = _apply_curated_dicts(ai_data, ext_by_id, touched)
    hygiene_counts = _apply_global_hygiene(ai_data, touched)

    schema_errors, fact_errors = _validate_touched(ai_data, touched, linker)
    summary = {
        **star_counts,
        **curated_counts,
        **hygiene_counts,
        "touched_total": len(touched),
        "schema_errors": schema_errors,
        "fact_errors": fact_errors,
    }
    if schema_errors or fact_errors:
        logger.error("Validation failed (%d schema, %d fact_matrix)", len(schema_errors), len(fact_errors))
        return summary

    if not dry_run:
        AI_PATH.write_text(json.dumps(ai_data, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info("Updated %s cleanly (%d touched entries)", AI_PATH, len(touched))
    else:
        logger.info("Dry-run succeeded (%d touched entries, 0 errors)", len(touched))
    return summary


def main() -> None:
    """CLI entrypoint for Phase 2 migration."""
    parser = argparse.ArgumentParser(description="Run Phase 2 STAR migration and AST repairs.")
    parser.add_argument("--dry-run", action="store_true", help="Validate changes without writing disk.")
    args = parser.parse_args()
    result = migrate_all(dry_run=args.dry_run)
    for err in result["schema_errors"] + result["fact_errors"]:
        print("ERROR:", err)
    print(json.dumps({k: v for k, v in result.items() if k not in ("schema_errors", "fact_errors")}, indent=2))
    if result["schema_errors"] or result["fact_errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
