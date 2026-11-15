"""Idempotent migration script for IsGeneric metadata and TargetSelector.is_generic ASTs.

Unifies ORDIR ("Generic Character") and Identifier ("Generic") into CardSide.IsGeneric
on extended card datasets, migrates existing "generic"/"unique" qualifiers out of
TargetSelector.identifiers into TargetSelector.is_generic across raw/AI AST caches,
repairs the 23 missing generic/unique ability selectors, and triggers Stage 10 dist export.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.logic.card_logic import CardSideLogic  # noqa: E402
from models.logic.target_decomposer import try_decompose_phrase  # noqa: E402
from utils.generic_resolver import apply_is_generic_to_card_sides  # noqa: E402

_DATA_DIR = _PROJECT_ROOT / "data"
_EXTENDED_FILES = (
    _DATA_DIR / "cards_extended.json",
    _DATA_DIR / "cards_extended_with_ordir_fuzzy.json",
)
_AI_PATH = _DATA_DIR / "ai_generated_abilities.json"
_RAW_PATH = _DATA_DIR / "card_abilities_raw.json"


def _load_json(path: Path) -> Any:
    """Loads JSON content from disk using UTF-8 encoding.

    Args:
        path: File path to read.

    Returns:
        Parsed JSON value.
    """
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_json_with_min(path: Path, payload: Any) -> None:
    """Writes formatted JSON and companion .min.json when present.

    Args:
        path: Primary JSON file path.
        payload: JSON-serializable payload.
    """
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    min_path = path.with_suffix(".min.json")
    if min_path.exists():
        with min_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"), ensure_ascii=False)


def _extract_cards_list(dataset: Any) -> List[Dict[str, Any]]:
    """Extracts the list of card dictionaries from either list or {'cards': list} payloads.

    Args:
        dataset: Parsed extended card JSON payload.

    Returns:
        Mutable list of card dictionaries.
    """
    if isinstance(dataset, dict) and isinstance(dataset.get("cards"), list):
        return dataset["cards"]
    if isinstance(dataset, list):
        return dataset
    raise ValueError("Unsupported extended cards JSON structure")


def _find_ability(abilities: List[Dict[str, Any]], ability_id: str) -> Optional[Dict[str, Any]]:
    """Finds an ability dictionary in an abilities list by its ability_id.

    Args:
        abilities: List of serialized Ability dictionaries.
        ability_id: Identifier of the target ability.

    Returns:
        Matching ability dictionary, or None if not found.
    """
    for ab in abilities:
        if isinstance(ab, dict) and ab.get("ability_id") == ability_id:
            return ab
    return None


def _add_unique_ident(target: Dict[str, Any], ident: str) -> bool:
    """Appends an identifier string case-insensitively if not already present.

    Args:
        target: Serialized TargetSelector dictionary.
        ident: Identifier tag to add.

    Returns:
        True if target was modified, False otherwise.
    """
    idents = target.setdefault("identifiers", [])
    if not isinstance(idents, list):
        idents = []
        target["identifiers"] = idents
    if ident.lower() not in {str(x).lower() for x in idents}:
        idents.append(ident)
        return True
    return False


def _set_effect_target_generic(
    abilities: List[Dict[str, Any]],
    ability_id: str,
    step_index: int,
    is_generic: bool,
    extra_idents: Iterable[str] = (),
    override_target_type: Optional[str] = None,
    override_alignment: Optional[str] = None,
) -> bool:
    """Patches is_generic (and optional target fields) on a specific effect step target.

    Args:
        abilities: Ability list inside a CardSideLogic dict.
        ability_id: Target ability_id.
        step_index: 0-based index into ab['effects'].
        is_generic: Boolean value to assign to target['is_generic'].
        extra_idents: Optional missing identifiers to append on the target.
        override_target_type: Optional corrected target_type string.
        override_alignment: Optional corrected alignment string.

    Returns:
        True if any field changed, False otherwise.
    """
    ab = _find_ability(abilities, ability_id)
    if not ab:
        raise KeyError(f"Missing ability '{ability_id}'")
    effects = ab.get("effects") or []
    if step_index >= len(effects):
        raise IndexError(f"Missing effect index {step_index} in '{ability_id}'")
    target = effects[step_index].get("target")
    if not isinstance(target, dict):
        raise ValueError(f"Missing target dict at {ability_id}[{step_index}]")

    changed = False
    if target.get("is_generic") is not is_generic:
        target["is_generic"] = is_generic
        changed = True
    if override_target_type and target.get("target_type") != override_target_type:
        target["target_type"] = override_target_type
        changed = True
    if override_alignment and target.get("alignment") != override_alignment:
        target["alignment"] = override_alignment
        changed = True
    for ident in extra_idents:
        if _add_unique_ident(target, ident):
            changed = True
    return changed


def _patch_ai_entries(ai_data: Dict[str, Any]) -> int:
    """Applies the 21 missing generic/unique fixes in ai_generated_abilities.json.

    Args:
        ai_data: Full parsed ai_generated_abilities.json mapping.

    Returns:
        Number of entries modified by targeted patches.
    """
    patched = 0

    simple_effect_patches: List[Tuple[str, str, int, bool, Tuple[str, ...], Optional[str], Optional[str]]] = [
        ("2063286881_top", "band_to_generic_priest", 0, True, (), None, None),
        ("1163510011_top", "band_to_generic_priest", 0, True, (), None, None),
        ("-1166348963_top", "band_ability", 0, True, (), None, None),
        ("808108586_top", "band_increase_ability", 0, True, (), None, None),
        ("-72788002_top", "band_to_generic_lion", 0, True, (), None, None),
        ("-1485050753_top", "band_to_demon", 0, True, (), None, None),
        ("1033858820_top", "play_meek_lost_soul_resurrect_pharisee", 1, True, (), "character", "evil"),
        ("422383239_top", "upkeep_search_and_place", 0, True, (), None, None),
        ("1192839223_top", "band_to_generic_egyptian_warrior", 0, True, ("Egyptian", "Warrior"), None, None),
        ("-251717583_top", "search_deck_for_demon", 0, True, (), None, None),
        ("-251717583_top", "search_discard_for_demon", 0, True, (), None, None),
        ("-513195493_top", "band_angel", 0, True, (), None, None),
        ("618190496_top", "band_to_generic_evil_nt_human", 0, True, ("Human",), None, None),
        ("1607934870_top", "band_to_generic_warrior", 0, True, (), None, None),
        ("-1088840158_top", "band_to_generic_warrior", 0, True, (), None, None),
        ("230932253_top", "meek_lost_soul_rescued_resurrect", 0, True, (), None, None),
        ("629762477_top", "imitating_evil_band_copy", 1, True, (), None, None),
        ("-363128690_top", "imitating_evil_band_and_copy", 1, True, (), None, None),
        ("446819577_top", "band_to_generic_exodus_female", 0, True, (), None, None),
        ("226799305_top", "band_to_generic_exodus_female", 0, True, (), None, None),
    ]

    for card_key, ab_id, idx, val, extra, t_type, align in simple_effect_patches:
        if card_key not in ai_data:
            raise KeyError(f"Missing AI key '{card_key}'")
        abilities = ai_data[card_key].get("ast", {}).get("abilities", [])
        if _set_effect_target_generic(abilities, ab_id, idx, val, extra, t_type, align):
            patched += 1

    # -633274785_top (Evil Strength [RR2]): "If used by a generic demon, repeat 1 time."
    es_key = "-633274785_top"
    es_ab = _find_ability(ai_data[es_key]["ast"]["abilities"], "evil_strength_repeat")
    if not es_ab or not es_ab.get("conditions"):
        raise KeyError(f"Missing condition in {es_key} evil_strength_repeat")
    es_sel = es_ab["conditions"][0]["selector"]
    if es_sel.get("is_generic") is not True:
        es_sel["is_generic"] = True
        patched += 1

    # -679664345_top (Evil Released (Roots)): "Play a demon from discard pile or Reserve. If it is unique, banish this card."
    er_key = "-679664345_top"
    unique_demon_condition = {
        "condition_type": "zone_check",
        "selector": {
            "selection_mode": "automatic_all",
            "zone_owner": "controller",
            "scope": ["in_play"],
            "target_type": "evil_character",
            "brigades": [],
            "alignment": "evil",
            "is_generic": False,
            "references": [],
            "identifiers": ["Demon"],
            "card_titles": [],
            "target_card_ids": [],
        },
        "operator": "==",
        "value": None,
    }
    for er_ab_id in (
        "play_demon_from_discard_banish_if_unique",
        "play_demon_from_reserve_banish_if_unique",
    ):
        er_ab = _find_ability(ai_data[er_key]["ast"]["abilities"], er_ab_id)
        if not er_ab:
            raise KeyError(f"Missing {er_ab_id} in {er_key}")
        conds = er_ab.setdefault("conditions", [])
        if not any(
            isinstance(c, dict)
            and isinstance(c.get("selector"), dict)
            and c["selector"].get("is_generic") is False
            for c in conds
        ):
            conds.append(json.loads(json.dumps(unique_demon_condition)))
            patched += 1

    return patched


def _patch_plot_to_kill(raw_cards: Dict[str, Any]) -> int:
    """Repairs Plot to Kill (-1278294591, -557944514) to model conditional unique cannot_be_prevented.

    Args:
        raw_cards: Mapping from card ID to raw parsed AST card entry.

    Returns:
        Number of entries modified.
    """
    patched = 0
    for cid in ("-1278294591", "-557944514"):
        entry = raw_cards.get(cid)
        if not isinstance(entry, dict):
            raise KeyError(f"Missing raw card '{cid}'")
        top_side = entry.get("sides", {}).get("top")
        if not isinstance(top_side, dict):
            raise KeyError(f"Missing sides.top on raw card '{cid}'")

        changed = False
        if top_side.get("modifiers"):
            top_side["modifiers"] = []
            changed = True

        abilities = top_side.setdefault("abilities", [])
        ab1 = _find_ability(abilities, "ab_1_negate_and_discard")
        if ab1 and ab1.get("is_preventable") is False:
            ab1["is_preventable"] = True
            changed = True

        if not _find_ability(abilities, "ab_2_cannot_be_prevented"):
            abilities.append({
                "ability_id": "ab_2_cannot_be_prevented",
                "is_star": False,
                "activation_mode": "static",
                "is_optional": False,
                "is_preventable": True,
                "is_interruptible": False,
                "is_negatable": False,
                "trigger_event": None,
                "trigger_filter": None,
                "conditions": [
                    {
                        "condition_type": "zone_check",
                        "selector": {
                            "selection_mode": "automatic_all",
                            "zone_owner": "controller",
                            "scope": ["battle"],
                            "target_type": "evil_character",
                            "brigades": [],
                            "alignment": "evil",
                            "is_generic": False,
                            "testament": None,
                            "references": [],
                            "identifiers": ["Pharisee", "Sadducee"],
                            "card_titles": [],
                            "target_card_ids": [],
                            "count": None,
                            "ref_step": None,
                        },
                        "operator": "==",
                        "value": None,
                    }
                ],
                "costs": [],
                "effects": [],
                "modifiers": [
                    {
                        "modifier_type": "cannot_be_prevented",
                        "applies_to": "this_side",
                        "limit_params": None,
                        "replacement_params": None,
                    }
                ],
                "choice_group": None,
            })
            changed = True

        if changed:
            patched += 1
    return patched


def _migrate_selector_dict(sel: Dict[str, Any]) -> bool:
    """Moves generic/unique qualifiers from a selector's identifiers list into is_generic in place.

    Args:
        sel: Serialized TargetSelector dictionary mutated in place.

    Returns:
        True if the selector was modified, False otherwise.
    """
    idents = sel.get("identifiers")
    if not isinstance(idents, list) or not idents:
        return False

    new_idents: List[str] = []
    changed = False
    for ident in idents:
        ident_str = str(ident)
        low = ident_str.strip().lower()
        if low == "generic":
            if sel.get("is_generic") is None:
                sel["is_generic"] = True
            changed = True
            continue
        if low == "unique":
            if sel.get("is_generic") is None:
                sel["is_generic"] = False
            changed = True
            continue
        dec = try_decompose_phrase(ident_str, is_from_titles=False)
        if dec is not None and dec.get("is_generic") is not None:
            if sel.get("is_generic") is None:
                sel["is_generic"] = dec["is_generic"]
            for extra in dec.get("identifiers", []):
                if extra.lower() not in {x.lower() for x in new_idents}:
                    new_idents.append(extra)
            if dec.get("target_type") and not sel.get("target_type"):
                sel["target_type"] = dec["target_type"]
            if dec.get("alignment") and not sel.get("alignment"):
                sel["alignment"] = dec["alignment"]
            if dec.get("gender") and not sel.get("gender"):
                sel["gender"] = dec["gender"]
            if dec.get("testament") and not sel.get("testament"):
                sel["testament"] = dec["testament"]
            changed = True
            continue
        if ident_str not in new_idents:
            new_idents.append(ident_str)
        else:
            changed = True

    if changed:
        sel["identifiers"] = new_idents
    return changed


def _walk_selectors(node: Any) -> int:
    """Recursively visits selector dictionaries inside abilities, conditions, costs, and triggers.

    Args:
        node: Arbitrary JSON subtree (dict or list) within CardSideLogic.

    Returns:
        Number of selector dictionaries modified.
    """
    changes = 0
    if isinstance(node, dict):
        if isinstance(node.get("identifiers"), list) and (
            "selection_mode" in node or "target_type" in node
        ):
            if _migrate_selector_dict(node):
                changes += 1
        for val in node.values():
            changes += _walk_selectors(val)
    elif isinstance(node, list):
        for item in node:
            changes += _walk_selectors(item)
    return changes


def _migrate_and_validate_side_dict(side_dict: Dict[str, Any]) -> bool:
    """Migrates generic/unique selectors in place and validates the side against CardSideLogic.

    Args:
        side_dict: Serialized CardSideLogic dictionary mutated in place when selectors change.

    Returns:
        True if any selector inside side_dict was modified in place, False otherwise.
    """
    modified_count = 0
    for ab in side_dict.get("abilities") or []:
        if not isinstance(ab, dict):
            continue
        if isinstance(ab.get("trigger_filter"), dict):
            modified_count += _walk_selectors(ab["trigger_filter"])
        for cond in ab.get("conditions") or []:
            if isinstance(cond, dict) and isinstance(cond.get("selector"), dict):
                modified_count += _walk_selectors(cond["selector"])
        for cost in ab.get("costs") or []:
            if isinstance(cost, dict):
                if isinstance(cost.get("target"), dict):
                    modified_count += _walk_selectors(cost["target"])
                if isinstance(cost.get("selector"), dict):
                    modified_count += _walk_selectors(cost["selector"])
        for eff in ab.get("effects") or []:
            if isinstance(eff, dict) and isinstance(eff.get("target"), dict):
                modified_count += _walk_selectors(eff["target"])

    CardSideLogic.model_validate(side_dict)
    return modified_count > 0


def migrate(dry_run: bool = False) -> None:
    """Executes all metadata and AST migrations for IsGeneric / is_generic.

    Args:
        dry_run: When True, logs counts without writing JSON files or running dist export.
    """
    for ext_path in _EXTENDED_FILES:
        if not ext_path.exists():
            continue
        dataset = _load_json(ext_path)
        cards = _extract_cards_list(dataset)
        for card in cards:
            apply_is_generic_to_card_sides(card)
        print(f"[Extended] Applied IsGeneric across {len(cards)} cards in {ext_path.name}")
        if not dry_run:
            _save_json_with_min(ext_path, dataset)

    ai_data = _load_json(_AI_PATH)
    ai_patched = _patch_ai_entries(ai_data)
    ai_migrated = 0
    for key, entry in ai_data.items():
        if isinstance(entry, dict) and isinstance(entry.get("ast"), dict):
            if _migrate_and_validate_side_dict(entry["ast"]):
                ai_migrated += 1
    print(f"[AI ASTs] Patched={ai_patched}, MigratedSelectors={ai_migrated} in {_AI_PATH.name}")
    if not dry_run:
        _save_json_with_min(_AI_PATH, ai_data)

    raw_data = _load_json(_RAW_PATH)
    raw_cards = (
        raw_data["cards"]
        if isinstance(raw_data, dict) and isinstance(raw_data.get("cards"), dict)
        else raw_data
    )
    raw_patched = _patch_plot_to_kill(raw_cards)
    raw_migrated = 0
    for cid, entry in raw_cards.items():
        sides = entry.get("sides") if isinstance(entry, dict) else None
        if not isinstance(sides, dict):
            continue
        for sk, s_ast in list(sides.items()):
            if isinstance(s_ast, dict) and _migrate_and_validate_side_dict(s_ast):
                raw_migrated += 1
    print(f"[Raw ASTs] Patched={raw_patched}, MigratedSelectors={raw_migrated} in {_RAW_PATH.name}")
    if not dry_run:
        _save_json_with_min(_RAW_PATH, raw_data)

    if not dry_run:
        stage10 = _SCRIPTS_DIR / "10_verify_logic.py"
        print("[Stage 10] Running verification and dist export...")
        subprocess.run(
            [sys.executable, str(stage10), "--export-dist"],
            cwd=str(_PROJECT_ROOT),
            check=True,
        )


def main() -> None:
    """CLI entry point for migrate_generic.py."""
    parser = argparse.ArgumentParser(description="Migrate IsGeneric / is_generic metadata and ASTs.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report changes without writing files.")
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
