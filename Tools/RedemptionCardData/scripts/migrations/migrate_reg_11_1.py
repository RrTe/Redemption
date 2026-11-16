"""Migration script updating card ability ASTs from REG v11.0.0 to REG v11.1.0.

Migrates affected card entries in ``data/ai_generated_abilities.json`` and
``data/card_abilities_raw.json`` idempotently:
- Battle-entry and blocking prohibitions ('cannot/may not enter battle',
  'cannot/may not be blocked by') -> 'paralyze'.
- 'has no effect' targeting characters/cards -> 'negate' (never 'withdraw').
- Returning captured/captive characters to territory -> 'release'.
- Returning characters in battle/set-aside to territory -> 'withdraw'.
- Returning cards in play to owner's hand -> 'bounce'.
- 'choose opponent' target normalization -> zone_owner='opponent', scope=['territory'].
- 'present' target normalization -> scope=['hand', 'territory'].
- Parses 'Nicodemus (Blue)' (-27986015) deterministically via Stage 08 parser.
"""

from __future__ import annotations

import copy
import importlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(BASE_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.logic.card_logic import CardSideLogic

# Targeted REG v11.1.0 migration sets
PARALYZE_ENTER_BATTLE_KEYS: Set[str] = {
    "730143821_top",     # Absalom (Ki)
    "-2051463540_top",   # All Hope Lost
    "1707740502_top",    # Consumed by Doubt
    "146480717_top",     # Divisions in the Church
    "-1121067520_top",   # Fear of Danger
    "374917579_top",     # Judah's Sin
    "-1594714814_top",   # Palsy
    "429342979_top",     # Panic Demon (Pale Green)
    "1721325920_top",    # Pergamum
    "2068819044_top",    # Saul's Javelin (Ki)
    "814947424_top",     # Seeds of Doubt
    "1864595454_top",    # Sheba
}

PARALYZE_BLOCKED_BY_KEYS: Set[str] = {
    "-1141879242_top",   # Eve (Wo)
    "-1317767914_top",   # King David (Promo)
    "438521004_top",     # Lot
    "-845087604_top",    # Widow
    "732467072_top",     # Scarlet Line
    "-1338432448_top",   # Witnesses to Creation
}

HAS_NO_EFFECT_NEGATE_KEYS: Set[str] = {
    "-1200816243_top",   # Delilah (L)
    "-730370049_top",    # Delilah (UL)
    "1033659989_top",    # Household Idols
}

RELEASE_CAPTIVE_KEYS: Set[str] = {
    "1321962739_top",    # Goods Recovered
    "-1839885984_top",   # The Prodigal Returns
    "1533006290_top",    # Angel of Deliverance (Ap)
    "-142994480_shared", # I am Redemption
    "-1277344350_shared",# The New Covenant
    "1250852698_top",    # Peter (Ap)
    "-1355586689_top",   # Ezra's Journey
    "-750855855_top",    # Freeing Earthquake
}

WITHDRAW_IN_BATTLE_KEYS: Set[str] = {
    "-1875886207_top",   # Angel Departed
    "-1527129078_top",   # Herod the Great (Di)
    "1879127821_top",    # Tabitha (F)
    "-1098625920_top",   # Army of Simeonites
    "-1145240865_top",   # Jairus' Daughter (Wo)
    "-657271070_top",    # Jairus' Daughter (H)
}

IN_PLAY_BOUNCE_KEYS: Set[str] = {
    "1475778753_top",    # Abraham's Descendant
    "-1944963053_top",   # Ahimelek the Hittite
    "910212136_top",     # Buckler (Pi)
    "891460711_top",     # Cage (L)
    "-2107954083_top",   # Cage (UL)
    "161413499_top",     # Cage (Roots)
    "-407321859_top",    # Chains (C)
    "-884894018_top",    # Chains (A)
    "1606204542_top",    # Chains (L)
    "-1883218476_top",   # Coat of Many Colors (FoM)
    "1381610582_shared", # Covenant with Adam (PoC)
    "-1819828040_top",   # Devouring Birds (RoJ)
    "692711056_top",     # Highway
    "1920882163_top",    # Hypocrisy (EC)
    "-1874742100_top",   # Jacob's Rods
    "-374238981_top",    # Stillness (B)
    "-908745021_top",    # Stillness (Promo)
    "-598122835_top",    # Spreading Mildew
    "1332392687_top",    # Visions of Iddo the Seer
}

CHOOSE_OPPONENT_KEYS: Set[str] = {
    "-1070093237_top",   # Asahel (TxP)
    "809979804_top",     # Abner, the Commander (Roots)
    "-1510574136_bottom",# Amaziah, the Arrogant (LoC)
    "-984858917_top",    # Bathsheba, the Helper (LoC)
    "1746694347_top",    # Hamor
    "-686948383_top",    # Herod the Great (GoC)
}

PRESENT_KEYS: Set[str] = {
    "-614244789_top",    # Darkness (Wa)
    "-180027188_top",    # Death of Firstborn
    "-504575844_top",    # Give Us a King!
    "-185618155_top",    # Give Us a King! (CoW AB)
    "1655213259_top",    # Goliath (LoC)
    "293516259_top",     # Goliath (Promo)
    "-882142635_top",    # Goliath [2018 - Regional]
    "674633266_top",     # Lion Dwelling with the Calf
    "114821234_top",     # Narrow Escape (EC)
    "1636634374_top",    # The Fallen Star
}

IN_PLAY_BOUNCE_SCOPES: Set[str] = {"in_play", "battle", "territory", "set_aside"}


def _migrate_paralyze_enter_battle(key: str, ast: Dict[str, Any]) -> bool:
    """Migrates 'cannot/may not enter battle' prohibitions to ActionVerb 'paralyze'.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    abilities = ast.get("abilities", [])

    # Special case: Palsy (-1594714814_top) previously split 'paralyzed and cannot enter
    # battle until healed' into step 1 'paralyze' + step 2 'withdraw'. Consolidate cleanly.
    if key == "-1594714814_top" and abilities:
        effects = abilities[0].get("effects", [])
        if len(effects) == 2 and effects[0].get("action") == "paralyze":
            target = effects[0].setdefault("target", {})
            identifiers = target.setdefault("identifiers", [])
            if "until healed" not in identifiers:
                identifiers.append("until healed")
            abilities[0]["effects"] = [effects[0]]
            return True
        return False

    for ab in abilities:
        ab_id = ab.get("ability_id", "")
        if key == "1707740502_top" and ab_id != "prevent_enter_battle":
            continue
        if key == "146480717_top" and ab_id != "prevent_nt_heroes_enter_battle":
            continue
        if key == "1864595454_top" and ab_id != "sheba_david_cannot_enter_battle":
            continue

        for eff in ab.get("effects", []):
            step = eff.get("step")
            if key in {"-1121067520_top", "429342979_top", "2068819044_top", "814947424_top"} and step != 2:
                continue
            if eff.get("action") in {"restrict", "prevent", "withdraw"}:
                eff["action"] = "paralyze"
                changed = True
    return changed


def _migrate_paralyze_blocked_by(key: str, ast: Dict[str, Any]) -> bool:
    """Migrates 'cannot/may not be blocked by' prohibitions to ActionVerb 'paralyze'.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    for ab in ast.get("abilities", []):
        for eff in ab.get("effects", []):
            action = eff.get("action")
            if key in {"732467072_top", "-1338432448_top"}:
                if key == "-1338432448_top" and eff.get("step") != 2:
                    continue
                if action == "protect":
                    prot = eff.get("protection_filter") or {}
                    sources = prot.get("card_sources") or []
                    if sources:
                        eff["target"] = copy.deepcopy(sources[0])
                        eff["target"].pop("ref_step", None)
                    eff.pop("protection_filter", None)
                    eff["action"] = "paralyze"
                    changed = True
            elif action in {"prevent", "withdraw", "restrict"}:
                eff["action"] = "paralyze"
                if key == "438521004_top" and "destination" in eff:
                    eff.pop("destination", None)
                changed = True
    return changed


def _migrate_has_no_effect(key: str, ast: Dict[str, Any]) -> bool:
    """Migrates REG v11.1.0 'has no effect' character/card rules to ActionVerb 'negate'.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    for ab in ast.get("abilities", []):
        if key == "1033659989_top" and ab.get("ability_id") != "good_banding_cards_no_effect":
            continue
        for eff in ab.get("effects", []):
            if key in {"-1200816243_top", "-730370049_top"} and eff.get("step") != 1:
                continue
            if eff.get("action") == "withdraw":
                eff["action"] = "negate"
                changed = True
            if key == "1033659989_top":
                target = eff.setdefault("target", {})
                if target.get("target_type") != "card":
                    target["target_type"] = "card"
                    changed = True
    return changed


def _migrate_release_captive(key: str, ast: Dict[str, Any]) -> bool:
    """Migrates 'return captured card to territory' rules to ActionVerb 'release'.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    for ab in ast.get("abilities", []):
        ab_id = ab.get("ability_id", "")
        if key == "-1839885984_top" and ab_id != "prodigal_returns_hero":
            continue
        if key == "1533006290_top" and ab_id != "return_captive_hero_ability":
            continue
        if key == "-1277344350_shared" and ab_id != "new_covenant_return_captured":
            continue
        if key == "-1355586689_top" and ab_id != "return_heroes_to_territory":
            continue

        for eff in ab.get("effects", []):
            step = eff.get("step")
            if key == "1321962739_top" and step != 2:
                continue
            if key in {"-1355586689_top", "-750855855_top"} and step != 1:
                continue

            if eff.get("action") in {"place", "take", "withdraw"}:
                eff["action"] = "release"
                changed = True

            target = eff.setdefault("target", {})
            if key == "1321962739_top":
                if target.get("scope") != ["land_of_bondage"]:
                    target["scope"] = ["land_of_bondage"]
                    changed = True
                if target.get("zone_owner") != "both":
                    target["zone_owner"] = "both"
                    changed = True
                identifiers = target.setdefault("identifiers", [])
                if "captured" not in identifiers:
                    identifiers.append("captured")
                    changed = True
            elif key == "-1839885984_top":
                if eff.get("destination") != "territory":
                    eff["destination"] = "territory"
                    changed = True
            elif key == "1533006290_top":
                identifiers = target.setdefault("identifiers", [])
                if "captured" not in identifiers:
                    identifiers.append("captured")
                    changed = True
            elif key == "-142994480_shared":
                if target.get("scope") != ["land_of_bondage"]:
                    target["scope"] = ["land_of_bondage"]
                    changed = True
            elif key == "-1277344350_shared":
                if eff.get("destination") != "territory":
                    eff["destination"] = "territory"
                    changed = True
            elif key in {"-1355586689_top", "-750855855_top"}:
                if target.get("scope") != ["land_of_bondage"]:
                    target["scope"] = ["land_of_bondage"]
                    changed = True
                if eff.get("destination") != "territory":
                    eff["destination"] = "territory"
                    changed = True
    return changed


def _migrate_withdraw_in_battle(key: str, ast: Dict[str, Any]) -> bool:
    """Migrates 'return character in battle to territory' rules from 'place' to 'withdraw'.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    for ab in ast.get("abilities", []):
        if key == "-1527129078_top" and ab.get("ability_id") != "herod_search_and_return":
            continue
        for eff in ab.get("effects", []):
            step = eff.get("step")
            if key == "-1527129078_top" and step != 2:
                continue
            if key in {"-1098625920_top", "-1145240865_top", "-657271070_top"} and step != 1:
                continue
            if eff.get("action") == "place":
                eff["action"] = "withdraw"
                changed = True
    return changed


def _migrate_bounce(ast: Dict[str, Any]) -> bool:
    """Normalizes legacy 'return to hand' actions for in-play bounce effects to 'bounce'.

    Args:
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if any effect or cost was updated to 'bounce'.
    """
    changed = False
    for ab in ast.get("abilities", []):
        for lst_name in ("effects", "costs"):
            for eff in ab.get(lst_name, []):
                if eff.get("action") != "return to hand":
                    continue
                scope = set((eff.get("target") or {}).get("scope") or [])
                if scope & IN_PLAY_BOUNCE_SCOPES:
                    eff["action"] = "bounce"
                    changed = True
    return changed


def _migrate_choose_opponent(key: str, ast: Dict[str, Any]) -> bool:
    """Normalizes 'choose opponent' effects to opponent ownership in territory scope.

    Args:
        key: Composite card side key ('{card_id}_{side}').
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    for ab in ast.get("abilities", []):
        if key == "-1070093237_top" and ab.get("ability_id") != "choose_opponent_male_human_to_block":
            continue
        for eff in ab.get("effects", []):
            is_asahel_target = key == "-1070093237_top" and eff.get("action") in {
                "restrict",
                "choose opponent",
            }
            if eff.get("action") == "choose opponent" or is_asahel_target:
                if eff.get("action") != "choose opponent":
                    eff["action"] = "choose opponent"
                    changed = True
                target = eff.setdefault("target", {})
                if target.get("zone_owner") != "opponent":
                    target["zone_owner"] = "opponent"
                    changed = True
                if target.get("scope") != ["territory"]:
                    target["scope"] = ["territory"]
                    changed = True
    return changed


def _migrate_present(ast: Dict[str, Any]) -> bool:
    """Normalizes 'present' target scopes per REG v11.1.0 to ['hand', 'territory'].

    Args:
        ast: Mutable CardSideLogic dictionary for the card side.

    Returns:
        True if the AST was modified, False otherwise.
    """
    changed = False
    expected_scope = ["hand", "territory"]
    for ab in ast.get("abilities", []):
        for eff in ab.get("effects", []):
            if eff.get("action") == "present":
                target = eff.setdefault("target", {})
                if target.get("scope") != expected_scope:
                    target["scope"] = expected_scope
                    changed = True
    return changed


def _migrate_nicodemus_raw(
    raw_data: Dict[str, Any],
    cards_by_id: Dict[str, Dict[str, Any]],
) -> bool:
    """Populates Nicodemus (Blue) (-27986015) deterministically via Stage 08 parser.

    Args:
        raw_data: Loaded mapping from ``data/card_abilities_raw.json``.
        cards_by_id: Reference card data keyed by string card ID.

    Returns:
        True if Nicodemus (Blue) in ``raw_data`` was added or updated.
    """
    cid = "-27986015"
    card = cards_by_id.get(cid, {})
    side_info = (card.get("CardSides") or {}).get("top") or {}
    card_name = side_info.get("Name") or "Nicodemus (Blue)"
    raw_sa = side_info.get("SpecialAbility") or "Cannot be blocked by Pharisees or Sadducees."

    parser_mod = importlib.import_module("08_parse_abilities")
    parsed_logic, err = parser_mod.parse_side_ability(card_name, "top", raw_sa)
    if parsed_logic is None:
        raise RuntimeError(f"Stage 08 failed to parse Nicodemus (Blue): {err}")

    dumped = parsed_logic.model_dump(mode="json", exclude_none=True)
    entry = raw_data.setdefault(cid, {"card_identifier": cid, "sides": {}})
    sides = entry.setdefault("sides", {})
    if sides.get("top") == dumped:
        return False

    sides["top"] = dumped
    return True


def run_migration() -> Tuple[int, int]:
    """Executes the full REG v11.1.0 data migration and Pydantic validation.

    Returns:
        Tuple of (ai_entries_updated, raw_entries_updated).
    """
    with (BASE_DIR / "config.json").open("r", encoding="utf-8") as cf:
        cfg = json.load(cf)

    ai_path = BASE_DIR / cfg.get("ai_generated_abilities", "data/ai_generated_abilities.json")
    raw_path = BASE_DIR / cfg.get("card_abilities_raw", "data/card_abilities_raw.json")
    cards_path = BASE_DIR / cfg.get(
        "cards_extended_with_ordir_fuzzy", "data/dist/cards_extended_with_ordir_fuzzy.json"
    )

    ai_data: Dict[str, Dict[str, Any]] = json.loads(ai_path.read_text(encoding="utf-8"))
    raw_data: Dict[str, Dict[str, Any]] = json.loads(raw_path.read_text(encoding="utf-8"))
    cards_payload = json.loads(cards_path.read_text(encoding="utf-8"))
    cards_list = cards_payload if isinstance(cards_payload, list) else cards_payload.get("cards", [])
    cards_by_id = {str(c.get("Id")): c for c in cards_list}

    ai_updated = 0
    for key, wrapper in ai_data.items():
        ast = wrapper.get("ast")
        if not isinstance(ast, dict):
            continue

        entry_changed = False
        if key in PARALYZE_ENTER_BATTLE_KEYS:
            entry_changed |= _migrate_paralyze_enter_battle(key, ast)
        if key in PARALYZE_BLOCKED_BY_KEYS:
            entry_changed |= _migrate_paralyze_blocked_by(key, ast)
        if key in HAS_NO_EFFECT_NEGATE_KEYS:
            entry_changed |= _migrate_has_no_effect(key, ast)
        if key in RELEASE_CAPTIVE_KEYS:
            entry_changed |= _migrate_release_captive(key, ast)
        if key in WITHDRAW_IN_BATTLE_KEYS:
            entry_changed |= _migrate_withdraw_in_battle(key, ast)
        if key in IN_PLAY_BOUNCE_KEYS:
            entry_changed |= _migrate_bounce(ast)
        if key in CHOOSE_OPPONENT_KEYS:
            entry_changed |= _migrate_choose_opponent(key, ast)
        if key in PRESENT_KEYS:
            entry_changed |= _migrate_present(ast)

        if entry_changed:
            # Validate against current Pydantic CardSideLogic schema before persisting.
            validated = CardSideLogic.model_validate(ast)
            wrapper["ast"] = validated.model_dump(mode="json", exclude_none=True)
            ai_updated += 1

    raw_updated = 0
    if _migrate_nicodemus_raw(raw_data, cards_by_id):
        validated_nico = CardSideLogic.model_validate(raw_data["-27986015"]["sides"]["top"])
        raw_data["-27986015"]["sides"]["top"] = validated_nico.model_dump(
            mode="json", exclude_none=True
        )
        raw_updated += 1

    if ai_updated > 0:
        ai_path.write_text(json.dumps(ai_data, indent=2, ensure_ascii=False), encoding="utf-8")
    if raw_updated > 0:
        raw_path.write_text(json.dumps(raw_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"REG v11.1.0 migration complete: ai_updated={ai_updated}, raw_updated={raw_updated}")
    return ai_updated, raw_updated


if __name__ == "__main__":
    run_migration()
