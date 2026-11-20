"""Idempotent Phase 4 migration for modal choice_group integrity in AI-generated ASTs.

Uses the shared deterministic choice_group_helper across ``data/ai_generated_abilities.json``
to strip invalid singleton choice_groups and assign consistent choice_group labels to
unlinked modal-OR and split-sibling ability choices without touching independent clauses,
and/or constructions, universal quantifiers, or instead replacements.
"""

from __future__ import annotations

import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.logic.card_logic import CardSideLogic
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.card_helpers import get_card_name, get_side_field, get_star_ability
from scripts.utils.choice_group_helper import reconcile_side_choice_groups

EXT_PATH = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = BASE_DIR / "data" / "ai_generated_abilities.json"


def _build_fact_text(
    side_model: CardSideLogic,
    raw_sa: str,
    star_sa: str,
) -> str:
    """Builds the appropriate raw text for fact_matrix verification on a migrated side."""
    has_star = any(ab.is_star for ab in side_model.abilities)
    has_reg = any(not ab.is_star for ab in side_model.abilities)
    if has_star and not has_reg:
        return star_sa or raw_sa
    if has_star and has_reg and star_sa and star_sa.lower() not in raw_sa.lower():
        return f"{raw_sa} {star_sa}".strip()
    return raw_sa


def migrate_ai_data(
    ai_data: Dict[str, Any],
    ext_by_id: Dict[str, Dict[str, Any]],
) -> Tuple[Dict[str, Any], Counter, List[str]]:
    """Applies Phase 4 deterministic choice_group reconciliation to AI ability entries.

    Args:
        ai_data: Parsed ``data/ai_generated_abilities.json`` dictionary.
        ext_by_id: Mapping of string card IDs to extended card records.

    Returns:
        Tuple of ``(migrated_data, change_counts, validation_errors)``.
    """
    migrated = copy.deepcopy(ai_data)
    counts: Counter = Counter()
    errors: List[str] = []

    for key, entry in migrated.items():
        if not isinstance(entry, dict):
            continue
        ast = entry.get("ast")
        if not isinstance(ast, dict) or not isinstance(ast.get("abilities"), list):
            continue

        cid = str(entry.get("card_id") or (key.rsplit("_", 1)[0] if "_" in key else key)).strip()
        side = str(entry.get("side") or (key.rsplit("_", 1)[1] if "_" in key else "top")).strip().lower()
        card = ext_by_id.get(cid, {})
        star_sa = str(get_star_ability(card) or "").strip() if side in ("top", "shared", "star") else ""

        if side == "star":
            raw_sa = ""
            entry_star = str(entry.get("raw_ability") or star_sa).strip()
        else:
            fallback_side = "top" if side == "shared" else side
            raw_sa = str(
                entry.get("raw_ability")
                or get_side_field(card, fallback_side, "SpecialAbility")
                or card.get("SpecialAbility")
                or ""
            ).strip()
            entry_star = star_sa

        cleared, added = reconcile_side_choice_groups(
            ast,
            raw_text=raw_sa,
            star_text=entry_star,
        )
        if not cleared and not added:
            continue

        counts["cleared_singletons"] += cleared
        counts["added_choice_groups"] += added
        counts["modified_entries"] += 1

        try:
            side_model = CardSideLogic.model_validate(ast)
            if side_model.find_singleton_choice_groups():
                errors.append(
                    f"{key} ({get_card_name(card)}): singleton choice_group remains after reconciliation"
                )
            fact_text = _build_fact_text(side_model, raw_sa, entry_star)
            if fact_text and fact_text.strip().lower() not in ("none", "n/a", "meek"):
                ok_fm, fm_issues = verify_fact_matrix(fact_text, extract_ast_facts(side_model))
                if not ok_fm:
                    errors.append(f"{key} ({get_card_name(card)}): fact_matrix issues: {fm_issues}")
        except Exception as exc:
            errors.append(f"{key} ({get_card_name(card)}): validation error: {exc}")

    return migrated, counts, errors


def main() -> int:
    """CLI entrypoint for executing or dry-running the Phase 4 choice_group migration."""
    parser = argparse.ArgumentParser(description="Phase 4 deterministic choice_group migration")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute changes without writing ai_generated_abilities.json",
    )
    args = parser.parse_args()

    ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
    ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
    ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))

    migrated, counts, errors = migrate_ai_data(ai_data, ext_by_id)

    print("Phase 4 Choice-Group Migration Summary:")
    for stat_key in ("modified_entries", "cleared_singletons", "added_choice_groups"):
        print(f"  {stat_key}: {counts[stat_key]}")
    print(f"  validation_errors: {len(errors)}")
    for err in errors[:20]:
        print(f"  ERROR: {err}")

    if errors:
        return 1

    if not args.dry_run and counts["modified_entries"] > 0:
        AI_PATH.write_text(json.dumps(migrated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated {AI_PATH}")
    elif args.dry_run:
        print("Dry-run complete; no files written.")
    else:
        print("No changes needed (already idempotent).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
