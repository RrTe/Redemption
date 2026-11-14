"""Pipeline Stage 10: Ability Logic Verification & Game Server Export

Audits the structured ability ASTs for semantic correctness, validates
chained target reference integrity, checks REG zone constraints, and exports
the production-ready cards_logic.json file for the Colyseus rules engine.
"""

from __future__ import annotations
import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(BASE_DIR))

from models.logic.card_logic import CardLogic
from models.logic.target_selector import TargetSelector
from models.logic.stat_filter import parse_stat_filters, StatFilter
from models.logic.target_decomposer import CANONICAL_CARD_TYPES, PLURAL_CARD_TYPE_MAP, SUBTYPE_MAP
from models.logic.dynamic_value import DynamicValue
from models.enums import (
    SelectionMode, Zone, ActionVerb, ActivationMode, Duration, ModifierType, ConditionType,
    CHARACTER_SIDE_TYPES, GENDERS,
)
from utils.card_linker import CardLinker, normalize_chained_targets
from utils.card_helpers import check_is_star_card, get_card_name, get_side_field, get_star_ability
from utils.ast_constants_exporter import export_ast_constants
from utils.card_hierarchy_exporter import export_card_hierarchy
from fact_matrix import extract_ast_facts, verify_fact_matrix

_BAND_ZONE_RESTRICTION_RE = __import__("re").compile(
    r"\bband\b[^.;]*\b(?:in\s+play|in\s+battle|in\s+territory|in\s+territories|from\s+hand|in\s+hand|"
    r"from\s+discard|in\s+discard|from\s+reserve|in\s+reserve|from\s+set-aside|in\s+set-aside)\b",
    __import__("re").IGNORECASE,
)
_PLURAL_SUBTYPE_SET = {k for k, v in SUBTYPE_MAP.items() if v[2]} | set(PLURAL_CARD_TYPE_MAP.keys())


def _audit_selector_invariants(sel: TargetSelector, ab_id: str, side_key: str, issues: List[str]) -> None:
    """Checks that a TargetSelector adheres to canonical CardType, singular identifier, and testament rules."""
    if sel.target_type and sel.target_type not in CANONICAL_CARD_TYPES:
        issues.append(f"Non-canonical target_type '{sel.target_type}' in '{ab_id}' ({side_key})")
    for ident in sel.identifiers:
        low = ident.strip().lower()
        if low in ("o.t.", "n.t.", "ot", "nt", "old testament", "new testament"):
            issues.append(f"Unextracted testament '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in ("male", "female"):
            issues.append(f"Unmigrated gender '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in _PLURAL_SUBTYPE_SET:
            issues.append(f"Unsplit/plural identifier '{ident}' in '{ab_id}' ({side_key})")
        if parse_stat_filters(ident):
            issues.append(f"Unmigrated stat filter '{ident}' in identifiers of '{ab_id}' ({side_key})")
    for sf in sel.stat_filters:
        if sf.value is None and not sf.variable:
            issues.append(f"StatFilter without value or variable in '{ab_id}' ({side_key})")
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

INPUT_FILE = BASE_DIR / _config.get("card_abilities_raw", "data/card_abilities_raw.json")
OUTPUT_LOGIC_FILE = BASE_DIR / _config.get("cards_logic_json", "data/dist/cards_logic.json")
OUTPUT_CONSTANTS_FILE = BASE_DIR / "data" / "dist" / "ast_constants.json"
OUTPUT_HIERARCHY_FILE = BASE_DIR / _config.get("card_hierarchy_json", "data/dist/cardHierarchy.json")
REPORT_LOG = BASE_DIR / _config.get("logic_verification_report", "data/logic_verification_report.log")
CARDS_EXT_FILE = BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")


def verify_card_logic(
    card_id: str,
    card_data: Dict[str, Any],
    linker: CardLinker | None = None,
    has_star_ability: bool = False,
    is_dual_card: bool = False,
    side_types: Dict[str, str] | None = None,
    side_genders: Dict[str, str] | None = None,
    raw_abilities: Dict[str, str] | None = None,
) -> tuple[List[str], Dict[str, Any] | None]:
    """Audits CardLogic node integrity and links referenced card_titles to canonical IDs.

    Args:
        card_id: Unique card identifier.
        card_data: Raw dictionary representation of CardLogic.
        linker: Optional CardLinker instance for resolving card_titles to IDs.
        has_star_ability: True if the card has a card-wide StarAbility in extended card data.
        is_dual_card: True if the card has a bottom side in extended card data.
        side_types: Optional mapping of side keys ('top', 'bottom') to CardType strings.
        raw_abilities: Optional mapping of card sides to raw ability texts for factual matrix audit.

    Returns:
        Tuple of (issues list, compiled/linked data dict or None).
    """
    issues: List[str] = []

    try:
        card_logic = CardLogic.model_validate(card_data)
    except Exception as e:
        return [f"Schema validation failure: {e}"], None

    if "shared" in card_logic.sides and not is_dual_card and "bottom" not in card_logic.sides:
        if "top" in card_logic.sides:
            issues.append("Conflicting 'shared' and 'top' sides on single-sided card (expected 'top' only)")
        else:
            issues.append("Orphaned 'shared' side on single-sided card (expected 'top')")

    for side_key, side_logic in card_logic.sides.items():
        raw_text_for_side = ""
        if raw_abilities:
            raw_text_for_side = raw_abilities.get(side_key) or raw_abilities.get("top") or raw_abilities.get("shared", "")
        side_card_type = ""
        if side_types:
            side_card_type = side_types.get(side_key) or side_types.get("top", "")
        if side_genders:
            resolved_side_gender = side_genders.get(side_key)
            if resolved_side_gender is None and side_key == "shared":
                unique_genders = set(side_genders.values())
                if len(unique_genders) == 1 and (not side_types or len(side_genders) == len(side_types)):
                    resolved_side_gender = next(iter(unique_genders))
            if resolved_side_gender in GENDERS:
                side_logic.gender = resolved_side_gender  # type: ignore[assignment]
        # Auto-renumber duplicate step indices before normalizing chained targets
        for ability in side_logic.abilities:
            cost_steps = [c.step for c in ability.costs]
            if len(cost_steps) != len(set(cost_steps)):
                for idx, cost in enumerate(ability.costs, start=1):
                    cost.step = idx
            eff_steps = [e.step for e in ability.effects]
            if len(eff_steps) != len(set(eff_steps)) or bool(set(cost_steps) & set(eff_steps)):
                offset = max(cost_steps) if cost_steps else 0
                for idx, eff in enumerate(ability.effects, start=1):
                    eff.step = offset + idx

        normalize_chained_targets(side_logic)
        for ability in side_logic.abilities:
            if (side_key == "shared" and has_star_ability) or (
                has_star_ability and (ability.is_star or ability.ability_id.lower().startswith("star_"))
            ):
                ability.is_star = True
                if not ability.trigger_event or ability.trigger_event.strip().lower() == "star":
                    ability.trigger_event = "star_phase"
                if not ability.ability_id.lower().startswith("star_"):
                    ability.ability_id = f"star_{ability.ability_id}"
                if ability.activation_mode == ActivationMode.IMMEDIATE:
                    ability.activation_mode = ActivationMode.TRIGGERED
            # Check sequential integrity within costs
            seen_cost_steps = set()
            for cost in ability.costs:
                if cost.step in seen_cost_steps:
                    issues.append(f"Duplicate step index {cost.step} in costs of '{ability.ability_id}' ({side_key})")
                seen_cost_steps.add(cost.step)

            # Check sequential integrity and chained references within effects
            seen_eff_steps = set()
            prior_steps = set(seen_cost_steps)
            for eff in ability.effects:
                if eff.step in seen_eff_steps:
                    issues.append(f"Duplicate step index {eff.step} in ability '{ability.ability_id}' ({side_key})")
                seen_eff_steps.add(eff.step)

                # Check chained target reference validity
                if eff.target and eff.target.selection_mode == SelectionMode.CHAINED_TARGET:
                    ref = eff.target.ref_step
                    if ref is None:
                        issues.append(f"Step {eff.step} uses CHAINED_TARGET but ref_step is missing in '{ability.ability_id}'")
                    elif ref >= eff.step or ref not in prior_steps:
                        issues.append(f"Step {eff.step} references non-prior step {ref} in '{ability.ability_id}'")
                prior_steps.add(eff.step)

                # Check Land of Bondage constraints per REG
                if eff.destination == Zone.LAND_OF_BONDAGE:
                    if eff.action != ActionVerb.CAPTURE and (not eff.target or eff.target.target_type != "lost_soul"):
                        # Characters are allowed via CAPTURE; lost souls are allowed directly
                        issues.append(f"Step {eff.step} moves to Land of Bondage without CAPTURE or Lost Soul in '{ability.ability_id}'")

                # Auto-normalize contradictory duration on instant actions (e.g. discard with permanent duration)
                if eff.action in (ActionVerb.DISCARD, ActionVerb.DRAW, ActionVerb.BANISH) and eff.duration in (Duration.PERMANENT, "permanent"):
                    eff.duration = Duration.INSTANT

                # Sanitize and normalize DRAW semantics across rule-based and AI-generated ASTs
                if eff.action == ActionVerb.DRAW:
                    if eff.destination is None:
                        eff.destination = Zone.HAND
                    if eff.target is None:
                        eff.target = TargetSelector(
                            selection_mode=SelectionMode.AUTOMATIC_NEXT,
                            zone_owner="controller",
                            scope=[Zone.DECK],
                            count=DynamicValue.from_int(1)
                        )
                    else:
                        if not eff.target.scope or eff.target.scope in ([Zone.BATTLE], [Zone.IN_PLAY]):
                            eff.target.scope = [Zone.DECK]
                        if eff.target.selection_mode == SelectionMode.AUTOMATIC_ALL:
                            eff.target.selection_mode = SelectionMode.AUTOMATIC_NEXT

                # Sanitize and normalize DISCARD semantics across rule-based and AI-generated ASTs
                if eff.action == ActionVerb.DISCARD:
                    if eff.destination is None:
                        eff.destination = Zone.DISCARD_PILE
                    if eff.target:
                        if eff.target.target_type == "evil card":
                            eff.target.target_type = "card"
                            if not eff.target.alignment:
                                eff.target.alignment = "evil"
                        elif eff.target.target_type == "good card":
                            eff.target.target_type = "card"
                            if not eff.target.alignment:
                                eff.target.alignment = "good"
                        if eff.target.alignment == "evil" and eff.target.zone_owner == "controller":
                            eff.target.zone_owner = "either"

                # Normalize standard BAND scope and validate against alignment hallucinations
                if eff.action == ActionVerb.BAND and eff.target:
                    if eff.target.scope in ([Zone.IN_PLAY], [Zone.BATTLE]) and not _BAND_ZONE_RESTRICTION_RE.search(raw_text_for_side):
                        eff.target.scope = [Zone.IN_PLAY, Zone.HAND]
                    if raw_text_for_side:
                        import re as _re
                        if side_card_type in ("EE", "Evil Character", "Curse") and (
                            eff.target.target_type == "hero" or eff.target.alignment == "good"
                        ):
                            if not _re.search(r"\b(?:hero|heroes|good)\b", raw_text_for_side, _re.I):
                                issues.append(
                                    f"Banding alignment hallucination in '{ability.ability_id}' ({side_key}): "
                                    f"{side_card_type} bands to hero/good without raw text support"
                                )
                        elif side_card_type in ("GE", "Hero", "Covenant") and (
                            eff.target.target_type == "evil_character" or eff.target.alignment == "evil"
                        ):
                            if not _re.search(r"\b(?:evil\s+characters?|evil)\b", raw_text_for_side, _re.I):
                                issues.append(
                                    f"Banding alignment hallucination in '{ability.ability_id}' ({side_key}): "
                                    f"{side_card_type} bands to evil_character/evil without raw text support"
                                )

            # Audit selector invariants across conditions, costs, effects, and triggers
            if ability.trigger_filter:
                _audit_selector_invariants(ability.trigger_filter, ability.ability_id, side_key, issues)
            for cond in ability.conditions:
                if cond.selector:
                    _audit_selector_invariants(cond.selector, ability.ability_id, side_key, issues)
            for cost in ability.costs:
                if cost.action == ActionVerb.BAND and cost.target:
                    if cost.target.scope in ([Zone.IN_PLAY], [Zone.BATTLE]) and not _BAND_ZONE_RESTRICTION_RE.search(raw_text_for_side):
                        cost.target.scope = [Zone.IN_PLAY, Zone.HAND]
                if cost.target:
                    _audit_selector_invariants(cost.target, ability.ability_id, side_key, issues)
            for eff in ability.effects:
                if eff.target:
                    _audit_selector_invariants(eff.target, ability.ability_id, side_key, issues)
                if eff.protection_filter:
                    for cs in eff.protection_filter.card_sources:
                        _audit_selector_invariants(cs, ability.ability_id, side_key, issues)

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
                    if eff.protection_filter:
                        for cs in eff.protection_filter.card_sources:
                            if cs.card_titles:
                                cs.target_card_ids = linker.resolve_titles(cs.card_titles)
                    if eff.action in (ActionVerb.PROTECT, ActionVerb.IMMUNE) and eff.target:
                        for ident in eff.target.identifiers:
                            if ident.lower() in ("harm", "rescue", "discard abilities", "capture abilities", "convert abilities"):
                                issues.append(f"Leaked protection cause in target.identifiers: '{ident}' in '{ability.ability_id}'")

        # Audit against raw ability text via factual game-mechanic matrix
        if raw_abilities:
            raw_text = raw_abilities.get(side_key) or raw_abilities.get("shared", "")
            if raw_text and raw_text.strip().lower() not in ("none", "n/a", "meek"):
                is_valid, fact_issues = verify_fact_matrix(raw_text, extract_ast_facts(side_logic))
                if not is_valid:
                    for fi in fact_issues:
                        issues.append(f"Fact matrix issue ({side_key}): {fi}")

    return issues, card_logic.model_dump(exclude_none=True)


def run_logic_verifier(export_dist: bool = True) -> None:
    """Audits all raw logic models and generates the production distribution file.

    Args:
        export_dist: Whether to export production files under data/dist/.
    """
    if not INPUT_FILE.exists():
        print(f"Error: Raw logic file not found at {INPUT_FILE}")
        sys.exit(1)

    linker: CardLinker | None = None
    id_to_meta: Dict[str, tuple[str, str]] = {}
    star_card_ids: set[str] = set()
    dual_card_ids: set[str] = set()
    id_to_side_types: Dict[str, Dict[str, str]] = {}
    id_to_side_genders: Dict[str, Dict[str, str]] = {}
    id_to_raw_abilities: Dict[str, Dict[str, str]] = {}
    if CARDS_EXT_FILE.exists():
        print(f"Loading extended cards for ID linking from: {CARDS_EXT_FILE}")
        with CARDS_EXT_FILE.open("r", encoding="utf-8") as f:
            ext_cards = json.load(f).get("cards", [])
            linker = CardLinker(ext_cards)
            for c in ext_cards:
                cid = str(c.get("Id", "")).strip()
                if not cid:
                    continue
                id_to_meta[cid] = (get_card_name(c), c.get("OfficialSet", ""))
                star_sa = get_star_ability(c)
                if star_sa or check_is_star_card(c):
                    star_card_ids.add(cid)
                sides_dict = c.get("CardSides", {})
                if "bottom" in sides_dict:
                    dual_card_ids.add(cid)
                st_map: Dict[str, str] = {}
                sg_map: Dict[str, str] = {}
                real_side_keys = [
                    k for k, v in sides_dict.items()
                    if k != "shared" and isinstance(v, dict)
                ] or ["top"]
                for sk in ("top", "bottom"):
                    t_val = get_side_field(c, sk, "Type")
                    if t_val:
                        st_map[sk] = str(t_val)
                for sk in real_side_keys:
                    t_val = get_side_field(c, sk, "Type")
                    if t_val in CHARACTER_SIDE_TYPES:
                        g_val = get_side_field(c, sk, "Gender")
                        if g_val in GENDERS:
                            sg_map[sk] = str(g_val)
                            if sk not in ("top", "bottom"):
                                sg_map.setdefault("top", str(g_val))
                id_to_side_types[cid] = st_map
                if sg_map:
                    id_to_side_genders[cid] = sg_map
                sm: Dict[str, str] = {}
                top_sa = get_side_field(c, "top", "SpecialAbility")
                bottom_sa = get_side_field(c, "bottom", "SpecialAbility")
                shared_sa = c.get("SpecialAbility", "")
                if star_sa:
                    sm["shared"] = star_sa
                elif shared_sa:
                    sm["shared"] = shared_sa
                if top_sa:
                    sm["top"] = top_sa
                if bottom_sa:
                    sm["bottom"] = bottom_sa
                id_to_raw_abilities[cid] = sm
            print(f"CardLinker initialized with {len(linker._index)} cards.")

    print(f"Loading raw card abilities from: {INPUT_FILE}")
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        raw_map: Dict[str, Dict[str, Any]] = json.load(f)

    # Merge AI generated abilities (Stage 9)
    AI_INPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
    if AI_INPUT_FILE.exists():
        print(f"Merging AI generated abilities from: {AI_INPUT_FILE}")
        with AI_INPUT_FILE.open("r", encoding="utf-8") as f_ai:
            ai_data = json.load(f_ai)
        for entry in ai_data.values():
            cid = str(entry.get("card_id", "")).strip()
            side = entry.get("side", "shared")
            ast = entry.get("ast")
            raw_ab = entry.get("raw_ability", "").strip()
            if not cid or not ast:
                continue
            if cid not in id_to_raw_abilities:
                id_to_raw_abilities[cid] = {}
            if raw_ab:
                id_to_raw_abilities[cid][side] = raw_ab
            if cid not in raw_map:
                raw_map[cid] = {"card_identifier": cid, "sides": {}}
            raw_map[cid]["sides"][side] = ast

    total_cards = len(raw_map)
    clean_cards = 0
    total_issues = 0
    issue_report: Dict[str, List[str]] = {}
    verified_distribution_map: Dict[str, Dict[str, Any]] = {}

    print(f"Verifying {total_cards} card logic trees...")
    for card_id, card_data in raw_map.items():
        card_issues, linked_data = verify_card_logic(
            card_id,
            card_data,
            linker=linker,
            has_star_ability=(card_id in star_card_ids),
            is_dual_card=(card_id in dual_card_ids),
            side_types=id_to_side_types.get(card_id),
            side_genders=id_to_side_genders.get(card_id),
            raw_abilities=id_to_raw_abilities.get(card_id),
        )
        meta_name, meta_set = id_to_meta.get(card_id, ("", ""))
        node = linked_data or card_data
        entry_payload = {
            "card_id": card_id,
            "card_name": meta_name or card_data.get("card_name", ""),
            "set": meta_set or card_data.get("set", ""),
            "sides": node.get("sides", {})
        }
        if card_issues:
            total_issues += len(card_issues)
            issue_report[card_id] = card_issues
        else:
            clean_cards += 1
            verified_distribution_map[card_id] = entry_payload

    if export_dist:
        # Ensure output dist directory exists
        OUTPUT_LOGIC_FILE.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT_LOGIC_FILE.open("w", encoding="utf-8") as out:
            json.dump(verified_distribution_map, out, indent=2, ensure_ascii=False)

        # Export canonical AST constants and enums as single source of truth
        export_ast_constants(OUTPUT_CONSTANTS_FILE)

        # Export canonical card type hierarchy (types, groups, IS-A inheritance)
        export_card_hierarchy(OUTPUT_HIERARCHY_FILE)

        # Bundle complete production card databases into dist/
        dist_dir = OUTPUT_LOGIC_FILE.parent
        if CARDS_EXT_FILE.exists():
            shutil.copy2(CARDS_EXT_FILE, dist_dir / "cards_extended_with_ordir_fuzzy.json")
        raw_carddata = BASE_DIR / "data" / "carddata.json"
        if raw_carddata.exists():
            shutil.copy2(raw_carddata, dist_dir / "carddata.json")

    # Write audit log report
    with REPORT_LOG.open("w", encoding="utf-8") as rep:
        rep.write(f"# Redemption Ability Logic Verification Report\n# Total Cards Evaluated: {total_cards}\n"
                  f"# Clean Verified Cards:  {clean_cards} ({clean_cards / max(1, total_cards):.1%})\n"
                  f"# Total Issues Found:    {total_issues}\n\n")

        if issue_report:
            rep.write("## Issues Detected:\n")
            for cid, errs in issue_report.items():
                rep.write(f"- Card [{cid}]:\n")
                for err in errs:
                    rep.write(f"    * {err}\n")
        else:
            rep.write("All evaluated cards passed semantic and structural validation without errors.\n")

    print(f"\nStage 10 Complete:\n - Evaluated Cards:        {total_cards}\n"
          f" - Clean Verified Cards:   {clean_cards} ({clean_cards / max(1, total_cards):.1%})\n"
          f" - Total Issues Found:     {total_issues}\n - Production File Export: {OUTPUT_LOGIC_FILE}\n"
          f" - AST Constants Export:   {OUTPUT_CONSTANTS_FILE}\n"
          f" - Card Hierarchy Export:  {OUTPUT_HIERARCHY_FILE}")

def _parse_args() -> argparse.Namespace:
    """Parses Stage 10 verifier command-line arguments."""
    parser = argparse.ArgumentParser(description="Stage 10 ability logic verification and dist export.")
    parser.add_argument(
        "--export-dist",
        action="store_true",
        default=True,
        help="Export cards_logic.json, cardHierarchy.json, ast_constants.json, and card databases to data/dist/.",
    )
    parser.add_argument(
        "--no-export-dist",
        action="store_false",
        dest="export_dist",
        help="Run verification report only without overwriting data/dist/ exports.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    _args = _parse_args()
    run_logic_verifier(export_dist=_args.export_dist)
