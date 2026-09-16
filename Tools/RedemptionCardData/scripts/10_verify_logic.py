"""Pipeline Stage 10: Ability Logic Verification & Game Server Export

Audits the structured ability ASTs for semantic correctness, validates
chained target reference integrity, checks REG zone constraints, and exports
the production-ready cards_logic.json file for the Colyseus rules engine.
"""

from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Dict, List, Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(BASE_DIR))

from models.logic.card_logic import CardLogic
from models.enums.selection_mode import SelectionMode
from models.enums.zone import Zone
from models.enums.action_verb import ActionVerb
from utils.card_linker import CardLinker

CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

INPUT_FILE = BASE_DIR / _config.get("card_abilities_raw", "data/card_abilities_raw.json")
OUTPUT_LOGIC_FILE = BASE_DIR / _config.get("cards_logic_json", "data/dist/cards_logic.json")
REPORT_LOG = BASE_DIR / _config.get("logic_verification_report", "data/logic_verification_report.log")
CARDS_EXT_FILE = BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")


def verify_card_logic(
    card_id: str,
    card_data: Dict[str, Any],
    linker: CardLinker | None = None
) -> tuple[List[str], Dict[str, Any] | None]:
    """Audits CardLogic node integrity and links referenced card_titles to canonical IDs.

    Args:
        card_id: Unique card identifier.
        card_data: Raw dictionary representation of CardLogic.
        linker: Optional CardLinker instance for resolving card_titles to IDs.

    Returns:
        Tuple of (issues list, compiled/linked data dict or None).
    """
    issues: List[str] = []

    try:
        card_logic = CardLogic.model_validate(card_data)
    except Exception as e:
        return [f"Schema validation failure: {e}"], None

    for side_key, side_logic in card_logic.sides.items():
        for ability in side_logic.abilities:
            # Check effect sequential integrity
            seen_steps = set()
            for eff in ability.effects:
                if eff.step in seen_steps:
                    issues.append(f"Duplicate step index {eff.step} in ability '{ability.ability_id}' ({side_key})")
                seen_steps.add(eff.step)

                # Check chained target reference validity
                if eff.target and eff.target.selection_mode == SelectionMode.CHAINED_TARGET:
                    ref = eff.target.ref_step
                    if ref is None:
                        issues.append(f"Step {eff.step} uses CHAINED_TARGET but ref_step is missing in '{ability.ability_id}'")
                    elif ref >= eff.step or ref not in seen_steps:
                        issues.append(f"Step {eff.step} references non-prior step {ref} in '{ability.ability_id}'")

                # Check Land of Bondage constraints per REG
                if eff.destination == Zone.LAND_OF_BONDAGE:
                    if eff.action != ActionVerb.CAPTURE and (not eff.target or eff.target.target_type != "lost_soul"):
                        # Characters are allowed via CAPTURE; lost souls are allowed directly
                        issues.append(f"Step {eff.step} moves to Land of Bondage without CAPTURE or Lost Soul in '{ability.ability_id}'")

                # Check contradictory duration on instant actions (e.g. discard with permanent duration)
                if eff.action in (ActionVerb.DISCARD, ActionVerb.DRAW, ActionVerb.BANISH) and eff.duration == "permanent":
                    issues.append(f"Step {eff.step} has instant action '{eff.action}' but duration is 'permanent' in '{ability.ability_id}'")

            # Check for completely empty ability clause
            if not ability.effects and not ability.costs and not ability.modifiers:
                issues.append(f"Ability '{ability.ability_id}' ({side_key}) has no effects, costs, or modifiers")

            # Resolve card_titles to canonical target_card_ids if linker provided
            if linker:
                for cond in ability.conditions:
                    if cond.selector and cond.selector.card_titles:
                        cond.selector.target_card_ids = linker.resolve_titles(cond.selector.card_titles)
                for cost in ability.costs:
                    if cost.target and cost.target.card_titles:
                        cost.target.target_card_ids = linker.resolve_titles(cost.target.card_titles)
                for eff in ability.effects:
                    if eff.target and eff.target.card_titles:
                        eff.target.target_card_ids = linker.resolve_titles(eff.target.card_titles)

    return issues, card_logic.model_dump(exclude_none=True)


def run_logic_verifier() -> None:
    """Audits all raw logic models and generates the production distribution file."""
    if not INPUT_FILE.exists():
        print(f"Error: Raw logic file not found at {INPUT_FILE}")
        sys.exit(1)

    linker: CardLinker | None = None
    if CARDS_EXT_FILE.exists():
        print(f"Loading extended cards for ID linking from: {CARDS_EXT_FILE}")
        with CARDS_EXT_FILE.open("r", encoding="utf-8") as f:
            ext_cards = json.load(f).get("cards", [])
            linker = CardLinker(ext_cards)
            print(f"CardLinker initialized with {len(linker._index)} cards.")

    print(f"Loading raw card abilities from: {INPUT_FILE}")
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        raw_map: Dict[str, Dict[str, Any]] = json.load(f)

    total_cards = len(raw_map)
    clean_cards = 0
    total_issues = 0
    issue_report: Dict[str, List[str]] = {}
    verified_distribution_map: Dict[str, Dict[str, Any]] = {}

    print(f"Verifying {total_cards} card logic trees...")
    for card_id, card_data in raw_map.items():
        card_issues, linked_data = verify_card_logic(card_id, card_data, linker=linker)
        if card_issues:
            total_issues += len(card_issues)
            issue_report[card_id] = card_issues
        else:
            clean_cards += 1
            verified_distribution_map[card_id] = linked_data or card_data

    # Ensure output dist directory exists
    OUTPUT_LOGIC_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_LOGIC_FILE.open("w", encoding="utf-8") as out:
        json.dump(verified_distribution_map, out, indent=2, ensure_ascii=False)

    # Write audit log report
    with REPORT_LOG.open("w", encoding="utf-8") as rep:
        rep.write("# Redemption Ability Logic Verification Report\n")
        rep.write(f"# Total Cards Evaluated: {total_cards}\n")
        rep.write(f"# Clean Verified Cards:  {clean_cards} ({clean_cards / max(1, total_cards):.1%})\n")
        rep.write(f"# Total Issues Found:    {total_issues}\n\n")

        if issue_report:
            rep.write("## Issues Detected:\n")
            for cid, errs in issue_report.items():
                rep.write(f"- Card [{cid}]:\n")
                for err in errs:
                    rep.write(f"    * {err}\n")
        else:
            rep.write("All evaluated cards passed semantic and structural validation without errors.\n")

    print(f"\nStage 10 Complete:")
    print(f" - Evaluated Cards:        {total_cards}")
    print(f" - Clean Verified Cards:   {clean_cards} ({clean_cards / max(1, total_cards):.1%})")
    print(f" - Total Issues Found:     {total_issues}")
    print(f" - Audit Report Written:   {REPORT_LOG}")
    print(f" - Production File Export: {OUTPUT_LOGIC_FILE}")


if __name__ == "__main__":
    run_logic_verifier()
