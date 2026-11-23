"""Idempotent Phase 1 migration for ActionVerb normalization, target_phase, and DynamicValue stat mods.

Fixes all 9 'action: unknown' effects, populates canonical REG target_phase /
battle_restriction / resumes_previous_phase fields on 'begin a new phase' effects,
fixes Falling Away (-1474676710), migrates misclassified placeholder modify_stats/decrease
entries, upgrades dynamic stat modifiers to structured DynamicValue expressions, and
normalizes all effect/cost/protection_filter action synonyms ('return to hand' -> 'bounce',
'remove from the game' -> 'banish', 'increase'/'decrease' -> 'modify_stats' with signed mods).
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from models.enums import ActionVerb, ActivationMode, SelectionMode
from models.logic.card_logic import CardSideLogic
from models.logic.dynamic_value import DynamicValue
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.card_helpers import get_card_name, get_side_field

EXT_PATH = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = BASE_DIR / "data" / "ai_generated_abilities.json"


def _dyn_mod(
    source: Optional[str] = None,
    operation: str = "add",
    multiplier: int | float = 1,
    fixed_value: Optional[int] = None,
    limit: Optional[int] = None,
    selector: Optional[Dict[str, Any]] = None,
    ref_step: Optional[int] = None,
) -> Dict[str, Any]:
    """Builds a canonical DynamicValue dict for strength_mod or toughness_mod."""
    calc: Dict[str, Any] = {"operation": operation, "multiplier": multiplier}
    if source is not None:
        calc["source"] = source
    if fixed_value is not None:
        calc["fixed_value"] = fixed_value
    if limit is not None:
        calc["limit"] = limit
    if selector is not None:
        base_sel: Dict[str, Any] = {
            "selection_mode": SelectionMode.AUTOMATIC_ALL.value,
            "zone_owner": "both",
            "scope": ["in_play"],
            "brigades": [],
            "classes": [],
            "references": [],
            "identifiers": [],
            "card_titles": [],
            "target_card_ids": [],
            "stat_filters": [],
        }
        base_sel.update(selector)
        calc["selector"] = base_sel
    if ref_step is not None:
        calc["ref_step"] = ref_step
    return {"dynamic": calc}


def _set_both_mods(eff: Dict[str, Any], mod_spec: Dict[str, Any], clear_count: bool = False) -> None:
    """Assigns deep-copied stat modifier specs when semantically different from existing values."""
    eff["action"] = ActionVerb.MODIFY_STATS.value
    try:
        target_dyn = DynamicValue.model_validate(mod_spec)
    except Exception:
        target_dyn = None
    for key in ("strength_mod", "toughness_mod"):
        existing = eff.get(key)
        already_equivalent = False
        if target_dyn is not None and isinstance(existing, dict):
            try:
                already_equivalent = DynamicValue.model_validate(existing) == target_dyn
            except Exception:
                already_equivalent = False
        if not already_equivalent:
            eff[key] = copy.deepcopy(mod_spec)
    if clear_count and isinstance(eff.get("target"), dict):
        eff["target"].pop("count", None)


def _set_zero_strength_dyn_toughness(
    eff: Dict[str, Any],
    mod_spec: Dict[str, Any],
    clear_count: bool = False,
) -> None:
    """Assigns strength_mod=0 and a dynamic toughness_mod when semantically changed."""
    eff["action"] = ActionVerb.MODIFY_STATS.value
    eff["strength_mod"] = 0
    try:
        target_dyn = DynamicValue.model_validate(mod_spec)
    except Exception:
        target_dyn = None
    existing = eff.get("toughness_mod")
    already_equivalent = False
    if target_dyn is not None and isinstance(existing, dict):
        try:
            already_equivalent = DynamicValue.model_validate(existing) == target_dyn
        except Exception:
            already_equivalent = False
    if not already_equivalent:
        eff["toughness_mod"] = copy.deepcopy(mod_spec)
    if clear_count and isinstance(eff.get("target"), dict):
        eff["target"].pop("count", None)


def _apply_targeted_unknown_fixes(key: str, ast: Dict[str, Any], counts: Counter) -> None:
    """Repairs all 9 'action: unknown' cards and Falling Away (-1474676710)."""
    abilities = ast.get("abilities") or []

    if key in ("868887774_top", "278140191_shared", "1514466594_shared", "-2065445572_top", "-85107037_top"):
        for ab in abilities:
            for eff in ab.get("effects") or []:
                if eff.get("action") == ActionVerb.UNKNOWN.value:
                    eff["action"] = ActionVerb.DEACTIVATE.value
                    counts["fixed_unknown_deactivate"] += 1

    elif key in ("586612795_top", "-1996231490_top"):
        for ab in abilities:
            for eff in ab.get("effects") or []:
                if eff.get("action") == ActionVerb.UNKNOWN.value:
                    eff["action"] = ActionVerb.DEACTIVATE.value
                    tgt = eff.get("target")
                    if isinstance(tgt, dict):
                        tgt["target_type"] = "curse"
                    counts["fixed_unknown_deactivate"] += 1

    elif key == "780421164_top":
        for ab in abilities:
            if ab.get("ability_id") == "begin_new_battle_if_condition":
                if ab.get("activation_mode") == ActivationMode.STATIC.value:
                    ab["activation_mode"] = ActivationMode.IMMEDIATE.value
                for eff in ab.get("effects") or []:
                    if eff.get("action") == ActionVerb.UNKNOWN.value:
                        eff["action"] = ActionVerb.BEGIN_NEW_PHASE.value
                        eff["target_phase"] = "battle_phase"
                        counts["fixed_unknown_begin_phase"] += 1

    elif key == "957979145_top":
        for ab in abilities:
            if ab.get("ability_id") == "harvest_time_play_lost_souls":
                effects = ab.get("effects") or []
                if len(effects) == 2 and effects[0].get("action") == ActionVerb.UNKNOWN.value:
                    play_eff = copy.deepcopy(effects[1])
                    play_eff["step"] = 1
                    play_eff["dependency"] = "always"
                    tgt = play_eff.setdefault("target", {})
                    tgt["count"] = {"dynamic": {"source": "player_choice", "operation": "add", "multiplier": 1}}
                    ab["effects"] = [play_eff]
                    counts["fixed_unknown_harvest_time"] += 1

    elif key == "-1474676710_top":
        for ab in abilities:
            if ab.get("ability_id") == "falling_away_ability":
                effects = ab.get("effects") or []
                if len(effects) >= 1 and effects[0].get("action") == ActionVerb.PLACE.value:
                    tgt = effects[0].get("target")
                    if isinstance(tgt, dict):
                        tgt["scope"] = ["land_of_redemption"]
                    effects[0]["destination"] = "land_of_bondage"
                if len(effects) == 3 and effects[2].get("action") == ActionVerb.DECREASE.value:
                    ab["effects"] = effects[:2]
                    counts["fixed_falling_away"] += 1


def _apply_begin_phase_fixes(key: str, ast: Dict[str, Any], counts: Counter) -> None:
    """Populates canonical target_phase, battle_restriction, and resumes_previous_phase."""
    abilities = ast.get("abilities") or []

    if key == "791959658_top":
        for ab in abilities:
            if ab.get("ability_id") == "ambush_the_city_ability":
                for eff in ab.get("effects") or []:
                    if eff.get("step") == 2 and eff.get("action") == ActionVerb.RESCUE.value:
                        eff["action"] = ActionVerb.BEGIN_NEW_PHASE.value
                        eff["target_phase"] = "battle_phase"
                        eff["battle_restriction"] = "rescue_attempt"
                        eff["resumes_previous_phase"] = True
                        counts["fixed_begin_new_phase"] += 1

    draw_keys = {"1689524727_top", "-590899574_top", "-1851578757_top"}
    for ab in abilities:
        for eff in (ab.get("effects") or []) + (ab.get("costs") or []):
            if eff.get("action") != ActionVerb.BEGIN_NEW_PHASE.value:
                continue
            if eff.get("target_phase") is not None:
                continue
            if key in draw_keys:
                eff["target_phase"] = "draw_phase"
            elif key == "38114992_top":
                eff["target_phase"] = "battle_phase"
                eff["battle_restriction"] = "rescue_attempt"
            else:
                eff["target_phase"] = "battle_phase"
            counts["fixed_begin_new_phase"] += 1


def _apply_misclassified_modify_stats_fixes(key: str, ast: Dict[str, Any], counts: Counter) -> None:
    """Fixes non-stat abilities previously misclassified as modify_stats or decrease."""
    abilities = ast.get("abilities") or []

    gain_keys = {
        "-486046805_top",
        "534006292_bottom",
        "-1207612900_top",
        "-1880941772_top",
        "-546615752_top",
        "-1609507562_top",
        "-1359191282_top",
    }
    if key in gain_keys:
        for ab in abilities:
            for eff in ab.get("effects") or []:
                if (
                    eff.get("action") == ActionVerb.MODIFY_STATS.value
                    and eff.get("strength_mod") is None
                    and eff.get("toughness_mod") is None
                ):
                    eff["action"] = ActionVerb.GAIN.value
                    counts["fixed_misclassified_modify_stats"] += 1

    elif key == "935171339_top":
        kept = [ab for ab in abilities if ab.get("ability_id") != "battle_determined_by_numbers"]
        if len(kept) != len(abilities):
            ast["abilities"] = kept
            counts["fixed_misclassified_modify_stats"] += 1

    elif key == "1167085011_top":
        for ab in abilities:
            if ab.get("ability_id") == "judge_condition_effect":
                effects = ab.get("effects") or []
                for eff in effects:
                    if eff.get("action") == ActionVerb.DECREASE.value and eff.get("strength_mod") is None:
                        eff["action"] = ActionVerb.GAIN.value
                        counts["fixed_misclassified_modify_stats"] += 1

    elif key == "-595114592_shared":
        for ab in abilities:
            for eff in ab.get("effects") or []:
                pf = eff.get("protection_filter")
                if isinstance(pf, dict) and pf.get("actions") == ["decrease", "modify_stats"]:
                    pf["actions"] = ["decrease"]
                    counts["fixed_protection_filter"] += 1


def _apply_dynamic_stat_mod_fixes(key: str, ast: Dict[str, Any], counts: Counter) -> None:
    """Converts dynamic X/X, half, double, triple, set, and chained stat effects to DynamicValue."""
    abilities = ast.get("abilities") or []

    if key == "1351563776_top":
        for ab in abilities:
            if ab.get("ability_id") == "worked_to_exhaustion_decrease":
                for eff in ab.get("effects") or []:
                    before_eff = json.dumps(eff, sort_keys=True)
                    eff["action"] = ActionVerb.MODIFY_STATS.value
                    eff["strength_mod"] = _dyn_mod(operation="set", fixed_value=1)
                    eff["toughness_mod"] = _dyn_mod(operation="set", fixed_value=3)
                    if json.dumps(eff, sort_keys=True) != before_eff:
                        counts["fixed_dynamic_stat_mod"] += 1
        return

    if key == "-112531310_top":
        already_split = any(ab.get("ability_id") == "potter_and_the_clay_hero_increase" for ab in abilities)
        if not already_split:
            new_abilities: List[Dict[str, Any]] = []
            x_sel = {"zone_owner": "controller", "scope": ["hand"], "target_type": "card"}
            pos_mod = _dyn_mod(source="count_cards", operation="add", multiplier=1, selector=x_sel)
            neg_mod = _dyn_mod(source="count_cards", operation="add", multiplier=-1, selector=x_sel)
            for ab in abilities:
                aid = ab.get("ability_id")
                if aid == "potter_and_the_clay_hero":
                    inc_ab = copy.deepcopy(ab)
                    inc_ab["ability_id"] = "potter_and_the_clay_hero_increase"
                    inc_ab["choice_group"] = "choice_1"
                    _set_both_mods(inc_ab["effects"][0], pos_mod)

                    dec_ab = copy.deepcopy(ab)
                    dec_ab["ability_id"] = "potter_and_the_clay_hero_decrease"
                    dec_ab["choice_group"] = "choice_1"
                    _set_both_mods(dec_ab["effects"][0], neg_mod)
                    new_abilities.extend([inc_ab, dec_ab])
                    counts["fixed_dynamic_stat_mod"] += 2
                elif aid == "potter_and_the_clay_ec":
                    inc_ab = copy.deepcopy(ab)
                    inc_ab["ability_id"] = "potter_and_the_clay_ec_increase"
                    inc_ab["choice_group"] = "choice_2"
                    _set_both_mods(inc_ab["effects"][0], pos_mod)

                    dec_ab = copy.deepcopy(ab)
                    dec_ab["ability_id"] = "potter_and_the_clay_ec_decrease"
                    dec_ab["choice_group"] = "choice_2"
                    _set_both_mods(dec_ab["effects"][0], neg_mod)
                    new_abilities.extend([inc_ab, dec_ab])
                    counts["fixed_dynamic_stat_mod"] += 2
                else:
                    new_abilities.append(ab)
            ast["abilities"] = new_abilities
        return

    # Single-target or specific dynamic stat formulas
    for ab in abilities:
        for eff in ab.get("effects") or []:
            act = eff.get("action")
            if act not in (ActionVerb.INCREASE.value, ActionVerb.DECREASE.value, ActionVerb.MODIFY_STATS.value):
                continue
            before_eff = json.dumps(eff, sort_keys=True)

            if key in ("1609027840_top", "-175016065_top"):
                _set_both_mods(eff, _dyn_mod(source="target_stat", operation="multiply", multiplier=0.5))
            elif key == "-832897936_top":
                eff["action"] = ActionVerb.MODIFY_STATS.value
                eff["strength_mod"] = _dyn_mod(source="target_stat", operation="multiply", multiplier=0.5)
                eff["toughness_mod"] = 0
            elif key == "1678855601_top":
                _set_both_mods(eff, _dyn_mod(source="target_stat", operation="multiply", multiplier=1.5))
            elif key == "644114855_top":
                _set_both_mods(eff, _dyn_mod(source="target_stat", operation="multiply", multiplier=2))
            elif key in ("218903353_top", "-2108859648_top", "-573600504_top"):
                _set_both_mods(eff, _dyn_mod(source="target_stat", operation="multiply", multiplier=3), clear_count=True)
            elif key == "-129942653_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="set",
                        multiplier=1,
                        selector={"zone_owner": "both", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "brigades": ["Silver"]},
                    ),
                    clear_count=True,
                )
            elif key == "-1574426638_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="set",
                        multiplier=1,
                        selector={"zone_owner": "both", "scope": ["in_play"], "target_type": "evil_character", "alignment": "evil"},
                    ),
                    clear_count=True,
                )
            elif key == "1358950550_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="multiply",
                        multiplier=1,
                        selector={"zone_owner": "both", "scope": ["battle"], "target_type": "evil_character", "alignment": "evil"},
                    ),
                    clear_count=True,
                )
            elif key == "-498691425_top":
                _set_both_mods(eff, _dyn_mod(source="chained_target_stats", operation="add", multiplier=1, ref_step=1))
            elif key == "1409316791_top" and ab.get("ability_id") == "self_copy_hero_stats":
                _set_both_mods(eff, _dyn_mod(source="chained_target_stats", operation="set", multiplier=1, ref_step=1), clear_count=True)
            elif key == "2066751713_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "both", "scope": ["in_play"], "target_type": "site", "state_filters": ["unoccupied"]},
                    ),
                )
            elif key in ("350288796_shared", "-1195788911_shared"):
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["in_play"]},
                    ),
                )
            elif key == "1134744551_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={
                            "zone_owner": "controller",
                            "scope": ["in_play"],
                            "target_type": "hero",
                            "alignment": "good",
                            "is_meek": True,
                            "references": ["Genesis"],
                            "identifiers": [],
                        },
                    ),
                )
            elif key in ("158154325_top", "-1819828040_top"):
                _set_both_mods(eff, _dyn_mod(source="cost_target_stats", operation="add", multiplier=1))
            elif key == "1502480890_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "both", "scope": ["in_play"], "target_type": "hero", "alignment": "good"},
                    ),
                )
            elif key == "-636306929_shared":
                _set_both_mods(
                    eff,
                    _dyn_mod(source="cards_drawn", operation="add", multiplier=-1, selector={"zone_owner": "opponent"}),
                )
            elif key == "-221430606_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["hand"], "target_type": "card"},
                    ),
                )
            elif key in ("-461971196_top", "-759847346_top"):
                is_hero_dec = (
                    act == ActionVerb.DECREASE.value
                    or ((eff.get("target") or {}).get("target_type") == "hero")
                )
                mult = -1 if is_hero_dec else 1
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=mult,
                        selector={"zone_owner": "opponent", "scope": ["in_play"], "alignment": "good"},
                    ),
                )
            elif key in ("-338133947_top", "1927279002_top", "-1960265032_top", "-2133059799_top"):
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["in_play"], "alignment": "good"},
                    ),
                    clear_count=(key in ("-338133947_top", "1927279002_top")),
                )
            elif key == "-879877081_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=1,
                        selector={
                            "zone_owner": "controller",
                            "scope": ["in_play"],
                            "target_type": "enhancement",
                            "identifiers": ["Armor of God Enhancement"],
                        },
                    ),
                )
            elif key == "-1117292569_top":
                _set_both_mods(eff, _dyn_mod(source="card_x_identifier", operation="add", multiplier=-1))
                if isinstance(eff.get("target"), dict):
                    eff["target"]["count"] = {"fixed_value": 1}
            elif key in ("-1967514634_bottom", "304866712_bottom"):
                _set_both_mods(eff, _dyn_mod(source="chained_target_stats", operation="add", multiplier=-1, ref_step=1))
            elif key in ("-509144683_top", "515819652_top"):
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={
                            "zone_owner": "controller",
                            "scope": ["in_play"],
                            "target_type": "evil_character",
                            "alignment": "evil",
                            "identifiers": ["Demon"],
                        },
                    ),
                )
            elif key == "-2054624411_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=1,
                        selector={"zone_owner": "opponent", "scope": ["banish_pile"], "target_type": "card"},
                    ),
                )
            elif key == "-1594853387_bottom":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["in_play"]},
                    ),
                    clear_count=True,
                )
            elif key == "-1363263826_top":
                _set_zero_strength_dyn_toughness(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["territory"], "alignment": "good"},
                    ),
                    clear_count=True,
                )
            elif key == "-1616070336_top":
                _set_both_mods(
                    eff,
                    _dyn_mod(
                        source="count_brigades",
                        operation="add",
                        multiplier=-1,
                        selector={"zone_owner": "opponent", "scope": ["discard_pile"], "alignment": "good"},
                    ),
                )
            elif key == "1844193792_top":
                _set_zero_strength_dyn_toughness(
                    eff,
                    _dyn_mod(
                        source="count_cards",
                        operation="add",
                        multiplier=-1,
                        selector={
                            "zone_owner": "both",
                            "scope": ["in_play"],
                            "target_type": "hero",
                            "alignment": "good",
                            "references": ["Daniel"],
                        },
                    ),
                )
            elif key in ("-101318748_shared", "-1999869087_shared"):
                _set_zero_strength_dyn_toughness(
                    eff,
                    _dyn_mod(
                        source="card_x_identifier",
                        operation="add",
                        multiplier=-1,
                        limit=11,
                    ),
                    clear_count=True,
                )
            else:
                continue

            if json.dumps(eff, sort_keys=True) != before_eff:
                counts["fixed_dynamic_stat_mod"] += 1


def _normalize_generic_action_synonyms(ast: Dict[str, Any], counts: Counter) -> None:
    """Normalizes remaining legacy action verbs and protection_filter action aliases."""
    for ab in ast.get("abilities") or []:
        for item in list(ab.get("effects") or []) + list(ab.get("costs") or []):
            act = item.get("action")
            if act == ActionVerb.RETURN_TO_HAND.value:
                item["action"] = ActionVerb.BOUNCE.value
                counts["normalized_return_to_hand"] += 1
            elif act == ActionVerb.REMOVE_FROM_GAME.value:
                item["action"] = ActionVerb.BANISH.value
                counts["normalized_remove_from_game"] += 1
            elif act == ActionVerb.INCREASE.value:
                item["action"] = ActionVerb.MODIFY_STATS.value
                counts["normalized_increase_to_modify_stats"] += 1
            elif act == ActionVerb.DECREASE.value:
                sm = item.get("strength_mod")
                tm = item.get("toughness_mod")
                if isinstance(sm, int) and not isinstance(sm, bool) and sm > 0:
                    item["strength_mod"] = -sm
                if isinstance(tm, int) and not isinstance(tm, bool) and tm > 0:
                    item["toughness_mod"] = -tm
                item["action"] = ActionVerb.MODIFY_STATS.value
                counts["normalized_decrease_to_modify_stats"] += 1

            pf = item.get("protection_filter")
            if isinstance(pf, dict):
                for fld in ("actions", "except_actions"):
                    orig = pf.get(fld)
                    if not isinstance(orig, list):
                        continue
                    mapped: List[str] = []
                    changed = False
                    for pa in orig:
                        new_pa = pa
                        if pa == ActionVerb.RETURN_TO_HAND.value:
                            new_pa = ActionVerb.BOUNCE.value
                            changed = True
                        elif pa == ActionVerb.REMOVE_FROM_GAME.value:
                            new_pa = ActionVerb.BANISH.value
                            changed = True
                        if new_pa not in mapped:
                            mapped.append(new_pa)
                        else:
                            changed = True
                    if changed:
                        pf[fld] = mapped
                        counts["fixed_protection_filter"] += 1


def migrate_ai_data(
    ai_data: Dict[str, Any],
    ext_by_id: Dict[str, Dict[str, Any]],
) -> Tuple[Dict[str, Any], Counter, List[str]]:
    """Applies Phase 1 deterministic migration over a deep copy of AI ability data.

    Args:
        ai_data: Parsed ``data/ai_generated_abilities.json`` dictionary.
        ext_by_id: Mapping of string card IDs to ``cards_extended`` records.

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

        before = json.dumps(ast, sort_keys=True)
        _apply_targeted_unknown_fixes(key, ast, counts)
        _apply_begin_phase_fixes(key, ast, counts)
        _apply_misclassified_modify_stats_fixes(key, ast, counts)
        _apply_dynamic_stat_mod_fixes(key, ast, counts)
        _normalize_generic_action_synonyms(ast, counts)

        if json.dumps(ast, sort_keys=True) != before:
            counts["modified_entries"] += 1
            cid = str(entry.get("card_id") or (key.rsplit("_", 1)[0] if "_" in key else key))
            side = str(entry.get("side") or (key.rsplit("_", 1)[1] if "_" in key else "top"))
            card = ext_by_id.get(cid, {})
            raw_sa = str(entry.get("raw_ability") or get_side_field(card, side if side != "star" else "top", "SpecialAbility") or "")
            try:
                side_model = CardSideLogic.model_validate(ast)
                ok_fm, fm_issues = verify_fact_matrix(raw_sa, extract_ast_facts(side_model))
                if not ok_fm:
                    errors.append(f"{key} ({get_card_name(card)}): fact_matrix issues: {fm_issues}")
            except Exception as exc:
                errors.append(f"{key} ({get_card_name(card)}): validation error: {exc}")

    return migrated, counts, errors


def main() -> int:
    """CLI entrypoint for executing or dry-running the Phase 1 action migration."""
    parser = argparse.ArgumentParser(description="Phase 1 action & dynamic stat-mod normalization migration")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing ai_generated_abilities.json")
    args = parser.parse_args()

    ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
    ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
    ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))

    migrated, counts, errors = migrate_ai_data(ai_data, ext_by_id)

    print("Phase 1 Migration Summary:")
    for stat_key, stat_val in sorted(counts.items()):
        print(f"  {stat_key}: {stat_val}")
    print(f"  validation_errors: {len(errors)}")
    for err in errors[:30]:
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
