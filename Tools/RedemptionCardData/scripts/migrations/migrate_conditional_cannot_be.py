"""Migration script for conditional 'Cannot be negated/interrupted/prevented' clauses.

Removes unconditionally propagated side-level protection modifiers and flags from
cards whose 'Cannot be <negated|interrupted|prevented>' clause is qualified by a
condition or source (e.g. 'if used by ...', 'unless ...', 'by ...'), and replaces them
with dedicated static conditional protection Ability nodes parsed via
extract_conditional_protection_abilities().
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set, Tuple

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.logic.card_logic import CardSideLogic  # noqa: E402
from utils.ability_patterns import (  # noqa: E402
    CONDITIONAL_PROTECTION_SENTENCE_RE,
    PROTECTION_REGEX,
    extract_conditional_protection_abilities,
    protect_abbreviations,
    restore_abbreviations,
)
from utils.card_helpers import check_is_star_card, get_side_field, get_star_ability  # noqa: E402

_DATA_DIR = _PROJECT_ROOT / "data"
_FUZZY_PATH = _DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
_RAW_PATH = _DATA_DIR / "card_abilities_raw.json"
_AI_PATH = _DATA_DIR / "ai_generated_abilities.json"

_PROTECTION_MOD_TYPES: Set[str] = {
    "cannot_be_negated",
    "cannot_be_interrupted",
    "cannot_be_prevented",
}

_MAIN_COND_RE = re.compile(r"\b(?:if|while|unless|when)\b", re.IGNORECASE)
_INDEXED_ID_RE = re.compile(r"^(?:star_)?ab_\d+_")


def _load_json(path: Path) -> Any:
    """Loads a UTF-8 JSON file from disk.

    Args:
        path: Path to the JSON file.

    Returns:
        Parsed JSON value.
    """
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_json_with_min(path: Path, payload: Any) -> None:
    """Writes a pretty-printed JSON file and updates its .min.json sibling if present.

    Args:
        path: Target JSON path.
        payload: JSON-serializable payload.
    """
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    min_path = path.with_suffix(".min.json")
    if min_path.exists():
        with min_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"), ensure_ascii=False)


def _extract_raw_cards_map(raw_data: Any) -> Dict[str, Any]:
    """Extracts the mutable card-ID dictionary from card_abilities_raw.json.

    Args:
        raw_data: Parsed card_abilities_raw.json structure.

    Returns:
        Dictionary mapping card IDs to card logic dictionaries.
    """
    if isinstance(raw_data, dict) and isinstance(raw_data.get("cards"), dict):
        return raw_data["cards"]
    if isinstance(raw_data, dict):
        return raw_data
    raise ValueError("Unsupported card_abilities_raw.json structure")


def _split_conditional_protection(raw_text: str) -> Tuple[str, List[Any], Set[str]]:
    """Extracts conditional protection abilities and identifies unconditional protection mods.

    Args:
        raw_text: Original card side special ability text.

    Returns:
        Tuple of (remaining_text_without_cond_prot, cond_prot_abilities, unconditional_mod_types).
    """
    if not raw_text:
        return "", [], set()
    masked = protect_abbreviations(raw_text)
    if not CONDITIONAL_PROTECTION_SENTENCE_RE.search(masked):
        return raw_text, [], set()

    remainder, cond_abilities = extract_conditional_protection_abilities(raw_text, start_idx=1)
    uncond_types: Set[str] = set()
    for match in PROTECTION_REGEX.finditer(remainder):
        prot_str = match.group(1).lower()
        if "negat" in prot_str:
            uncond_types.add("cannot_be_negated")
        if "interrupt" in prot_str:
            uncond_types.add("cannot_be_interrupted")
        if "prevent" in prot_str:
            uncond_types.add("cannot_be_prevented")
    return remainder, cond_abilities, uncond_types


def _cond_mod_types_from_abilities(abilities: Iterable[Any]) -> Set[str]:
    """Collects modifier type strings from generated conditional protection abilities.

    Args:
        abilities: Sequence of Ability models.

    Returns:
        Set of protection modifier_type string values.
    """
    mod_types: Set[str] = set()
    for ab in abilities:
        for mod in ab.modifiers:
            val = mod.modifier_type.value if hasattr(mod.modifier_type, "value") else str(mod.modifier_type)
            mod_types.add(val)
    return mod_types


def _is_dedicated_protection_placeholder(ab: Dict[str, Any], total_abilities: int) -> bool:
    """Determines whether an existing ability dict is solely a placeholder protection clause.

    Preserves abilities carrying real gameplay effects (e.g. 'protect', 'prevent', 'discard')
    while removing pure 'cannot_be_*' or placeholder 'gain' protection shells so they can be
    replaced cleanly by canonical gated static protection abilities.

    Args:
        ab: Serialized Ability dictionary.
        total_abilities: Number of abilities currently on the side.

    Returns:
        True if the ability should be replaced by the newly built conditional protection node.
    """
    mod_types = {
        str(m.get("modifier_type", "")).lower()
        for m in (ab.get("modifiers") or [])
        if isinstance(m, dict)
    }
    if not (mod_types & _PROTECTION_MOD_TYPES):
        return False
    if ab.get("costs"):
        return False

    effects = ab.get("effects") or []
    if not effects:
        return True

    if total_abilities <= 1:
        return False

    ab_id = str(ab.get("ability_id", "")).lower()
    all_gain_placeholders = all(
        isinstance(e, dict) and str(e.get("action", "")).lower() == "gain" and not e.get("protection_filter")
        for e in effects
    )
    if all_gain_placeholders:
        return True

    return False


def _renumber_prot_abilities(
    cond_abilities: List[Any],
    start_idx: int,
    is_star_only: bool,
) -> List[Dict[str, Any]]:
    """Renumbers and serializes generated conditional protection abilities.

    Args:
        cond_abilities: List of Ability objects built from conditional clauses.
        start_idx: Starting 1-based ability index after existing main abilities.
        is_star_only: Whether the entire card side is a STAR ability.

    Returns:
        List of serialized Ability dicts ready for JSON storage.
    """
    serialized: List[Dict[str, Any]] = []
    for offset, ab in enumerate(cond_abilities):
        ab_dict = ab.model_dump(exclude_none=True)
        suffix = _INDEXED_ID_RE.sub("", str(ab_dict["ability_id"]), count=1)
        prefix = "star_" if is_star_only else ""
        ab_dict["ability_id"] = f"{prefix}ab_{start_idx + offset}_{suffix}"
        if is_star_only:
            ab_dict["is_star"] = True
            ab_dict["trigger_event"] = "star_phase"
        serialized.append(ab_dict)
    return serialized


def _restore_main_ability_flags(
    ab: Dict[str, Any],
    conditional_mod_types: Set[str],
    uncond_mod_types: Set[str],
) -> None:
    """Restores false protection flags and strips conditional modifiers from a main ability.

    Args:
        ab: Mutable main Ability dictionary.
        conditional_mod_types: Protection modifier types governed by conditional clauses.
        uncond_mod_types: Protection modifier types that are genuinely unconditional on this side.
    """
    target_mods = conditional_mod_types - uncond_mod_types
    if "cannot_be_negated" in target_mods and ab.get("is_negatable") is False:
        ab["is_negatable"] = True
    if "cannot_be_interrupted" in target_mods and ab.get("is_interruptible") is False:
        ab["is_interruptible"] = True
    if "cannot_be_prevented" in target_mods and ab.get("is_preventable") is False:
        ab["is_preventable"] = True

    if ab.get("modifiers"):
        ab["modifiers"] = [
            m for m in ab["modifiers"]
            if str(m.get("modifier_type", "")).lower() not in target_mods
        ]


def _build_raw_text_lookup(ext_cards: List[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    """Builds a mapping card_id -> side_key -> raw SpecialAbility text.

    Args:
        ext_cards: List of extended card dictionaries.

    Returns:
        Mapping of card IDs to per-side ability text strings.
    """
    lookup: Dict[str, Dict[str, str]] = {}
    for card in ext_cards:
        cid = str(card.get("Id", "")).strip()
        if not cid:
            continue
        sides = card.get("CardSides", {}) or {}
        bottom_data = sides.get("bottom") if isinstance(sides.get("bottom"), dict) else None
        per_side: Dict[str, List[str]] = {}
        star_sa = (get_star_ability(card) or "").strip()
        shared_sa = (get_side_field(card, "shared", "SpecialAbility") or "").strip()
        top_sa = (get_side_field(card, "top", "SpecialAbility") or "").strip()
        bottom_sa = (get_side_field(card, "bottom", "SpecialAbility") or "").strip() if bottom_data else ""

        if star_sa:
            star_side = "shared" if bottom_data is not None else "top"
            per_side.setdefault(star_side, []).append(star_sa)
        if shared_sa and not re.match(r"^(?:STAR\s*:|\(\s*Star\s*\))", shared_sa, re.IGNORECASE):
            s_side = "shared" if bottom_data is not None else "top"
            per_side.setdefault(s_side, []).append(shared_sa)
        if top_sa:
            per_side.setdefault("top", []).append(top_sa)
        if bottom_sa:
            per_side.setdefault("bottom", []).append(bottom_sa)

        lookup[cid] = {sk: ". ".join(parts) for sk, parts in per_side.items()}
    return lookup


def _clean_ai_leaked_conditions(side_id: str, rem_text: str, main_abilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Removes leaked 'Cannot be ...' conditions from AI-generated main abilities.

    Args:
        side_id: AI entry key (e.g. '1686944990_top').
        rem_text: Raw ability text outside the conditional 'Cannot be ...' clause.
        main_abilities: Mutable list of main Ability dicts.

    Returns:
        Updated list of main Ability dicts.
    """
    # Beast from the Sea duplicated its single draw/topdeck ability purely for the Red Dragon condition.
    if side_id in ("-1356503623_top", "-1840028184_top"):
        primary = next(
            (ab for ab in main_abilities if ab.get("ability_id") == "beast_from_sea_draw_topdeck_condition_reddragon"),
            main_abilities[0] if main_abilities else None,
        )
        if primary is not None:
            primary["ability_id"] = "beast_from_sea_draw_topdeck"
            primary["conditions"] = []
            return [primary]

    # When the remaining text has no 'if/while/unless/when', any condition on a main ability came solely from Cannot be.
    has_main_cond = bool(_MAIN_COND_RE.search(restore_abbreviations(rem_text)))
    if not has_main_cond:
        for ab in main_abilities:
            if ab.get("conditions"):
                ab["conditions"] = []
        return main_abilities

    if side_id == "1686944990_top":
        for ab in main_abilities:
            ab["conditions"] = [
                c for c in (ab.get("conditions") or [])
                if "John the Forerunner" not in ((c.get("selector") or {}).get("card_titles") or [])
            ]
    elif side_id in ("428173092_top", "-1329991126_top"):
        for ab in main_abilities:
            if ab.get("ability_id") == "faith_of_barak_discard":
                ab["conditions"] = []
    elif side_id == "-2120749271_top":
        for ab in main_abilities:
            ab["conditions"] = [
                c for c in (ab.get("conditions") or [])
                if not (c.get("condition_type") == "count_comparison" and c.get("value") == 2)
            ]

    return main_abilities


def _migrate_side_dict(
    side_id: str,
    side_ast: Dict[str, Any],
    raw_text: str,
    is_ai: bool,
) -> bool:
    """Migrates one CardSideLogic dictionary in-place when it has conditional 'Cannot be ...'.

    Args:
        side_id: Side identifier for logging and targeted AI cleanup.
        side_ast: Mutable CardSideLogic dictionary.
        raw_text: Raw SpecialAbility text for this card side.
        is_ai: True if migrating an ai_generated_abilities entry, False for card_abilities_raw.

    Returns:
        True if the side AST was modified, False otherwise.
    """
    rem_text, cond_abilities, uncond_mod_types = _split_conditional_protection(raw_text)
    if not cond_abilities:
        return False

    cond_mod_types = _cond_mod_types_from_abilities(cond_abilities)
    target_strip_mods = cond_mod_types - uncond_mod_types
    before_snapshot = json.dumps(side_ast, sort_keys=True)

    # 1. Remove conditional protection modifiers from side-level modifiers.
    if side_ast.get("modifiers"):
        side_ast["modifiers"] = [
            m for m in side_ast["modifiers"]
            if str(m.get("modifier_type", "")).lower() not in target_strip_mods
        ]

    # 2. Keep genuine gameplay abilities and drop old dedicated protection placeholders.
    old_abilities = list(side_ast.get("abilities") or [])
    total_abs = len(old_abilities)
    main_abilities = [
        ab for ab in old_abilities
        if not _is_dedicated_protection_placeholder(ab, total_abs)
    ]

    for ab in main_abilities:
        _restore_main_ability_flags(ab, cond_mod_types, uncond_mod_types)

    if is_ai:
        main_abilities = _clean_ai_leaked_conditions(side_id, rem_text, main_abilities)

    # 3. Append canonical gated static protection abilities.
    is_star_only = bool(main_abilities) and all(bool(ab.get("is_star")) for ab in main_abilities)
    new_prot_dicts = _renumber_prot_abilities(
        cond_abilities, start_idx=len(main_abilities) + 1, is_star_only=is_star_only
    )
    side_ast["abilities"] = main_abilities + new_prot_dicts

    # 4. Validate and normalize through Pydantic.
    validated = CardSideLogic.model_validate(side_ast)
    dumped = validated.model_dump(exclude_none=True)
    side_ast.clear()
    side_ast.update(dumped)

    return json.dumps(side_ast, sort_keys=True) != before_snapshot


def migrate(dry_run: bool = False) -> None:
    """Runs conditional 'Cannot be ...' AST migration and Stage 10 export.

    Args:
        dry_run: When True, validates changes without modifying files on disk.
    """
    fuzzy_payload = _load_json(_FUZZY_PATH)
    ext_cards = fuzzy_payload.get("cards", fuzzy_payload) if isinstance(fuzzy_payload, dict) else fuzzy_payload
    raw_text_lookup = _build_raw_text_lookup(ext_cards)

    raw_data = _load_json(_RAW_PATH)
    raw_cards = _extract_raw_cards_map(raw_data)
    ai_data = _load_json(_AI_PATH)

    raw_migrated = 0
    for cid, card_entry in raw_cards.items():
        if not isinstance(card_entry, dict):
            continue
        sides = card_entry.get("sides") or {}
        per_side_texts = raw_text_lookup.get(cid, {})
        for sk, side_ast in sides.items():
            if not isinstance(side_ast, dict):
                continue
            raw_text = per_side_texts.get(sk) or per_side_texts.get("shared") or per_side_texts.get("top") or ""
            if _migrate_side_dict(f"{cid}_{sk}", side_ast, raw_text, is_ai=False):
                raw_migrated += 1

    ai_migrated = 0
    for key, ai_entry in ai_data.items():
        if not isinstance(ai_entry, dict) or not isinstance(ai_entry.get("ast"), dict):
            continue
        raw_text = str(ai_entry.get("raw_ability") or "")
        if _migrate_side_dict(key, ai_entry["ast"], raw_text, is_ai=True):
            ai_migrated += 1

    print(f"[Migration] Migrated Raw sides={raw_migrated}, AI sides={ai_migrated}")

    if not dry_run:
        _save_json_with_min(_RAW_PATH, raw_data)
        _save_json_with_min(_AI_PATH, ai_data)
        stage10 = _SCRIPTS_DIR / "10_verify_logic.py"
        print("[Stage 10] Running verification and dist export...")
        subprocess.run(
            [sys.executable, str(stage10), "--export-dist"],
            cwd=str(_PROJECT_ROOT),
            check=True,
        )


def main() -> None:
    """CLI entry point for migrate_conditional_cannot_be.py."""
    parser = argparse.ArgumentParser(description="Migrate conditional 'Cannot be ...' protection ASTs.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without writing files.")
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
