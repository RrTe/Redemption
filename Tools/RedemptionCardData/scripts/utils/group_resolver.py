"""Resolves and normalizes card group booleans and rule-based ORDIR tags."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from utils.card_helpers import get_side_field
from utils.generic_resolver import _dedupe_shared_fields

_TRIVIAL_ABILITY_TEXTS = {
    "",
    "none",
    "n/a",
    "meek",
    "-",
    "no special ability",
}

_JOSEPH_TITLE_PATTERN = re.compile(r"\bjoseph(?:'s)?\b", re.IGNORECASE)

ORDIR_CATEGORY_RENAMES: Dict[str, str] = {
    "Royalty (or Royal or Member of a Royal Family)": "Royalty",
}

TEMPLE_SIDE_TYPES = {"Fortress", "Site"}
TABERNACLE_SIDE_TYPES = {"Fortress"}


def _get_real_side_keys(card: dict) -> List[str]:
    """Returns concrete side keys for a card, falling back to shared/top.

    Args:
        card: Full card dictionary from extended card database.

    Returns:
        List of real side keys (e.g. ``['top']``, ``['top', 'bottom']``, or multi-type keys).
    """
    sides = card.get("CardSides") or {}
    real_keys = [k for k, v in sides.items() if k != "shared" and isinstance(v, dict)]
    if real_keys:
        return real_keys
    if isinstance(sides.get("shared"), dict):
        return ["shared"]
    return ["top"]


def resolve_is_cloud(card: dict, side_key: str) -> bool:
    """Determines whether a card side has the Cloud class/ORDIR marker.

    Combines fuzzy ORDIR ``Cloud Card`` entries and raw ``Cloud`` class tags
    because a handful of cards (e.g. ``Abel (CoW)`` vs ``David the Psalmist``)
    carry the marker on only one of the two sources.

    Args:
        card: Full card dictionary from extended card database.
        side_key: Target side key (e.g. ``'top'``, ``'bottom'``, or ``'shared'``).

    Returns:
        True if the side is a Cloud card, otherwise False.
    """
    side_ordir = get_side_field(card, side_key, "ORDIR", default=[]) or []
    card_ordir = card.get("ORDIR", []) or []
    for cat in list(side_ordir) + list(card_ordir):
        if str(cat).strip().lower() == "cloud card":
            return True

    side_classes = get_side_field(card, side_key, "Classes", default=[]) or []
    if isinstance(side_classes, str):
        side_classes = [c.strip() for c in side_classes.split(",") if c.strip()]
    if any(str(cl).strip().lower() == "cloud" for cl in side_classes):
        return True

    raw_class = str(card.get("Class", "") or "")
    if "cloud" in {c.strip().lower() for c in raw_class.split(",") if c.strip()}:
        return True

    return False


def resolve_is_meek(card: dict, side_key: str) -> bool:
    """Determines the printed face-value Meek state for a card side.

    Per REG v11.1.0, a card side is meek if it has no printed special ability
    (including vanilla Heroes/ECs/Enhancements/Sites/Lost Souls and explicit
    ``'Meek'`` dual-side text such as LoC/GoC flip cards and Saint Patrick).
    Single-sided cards with blank SpecialAbility whose only ability was moved
    into top-level ``StarAbility`` (e.g. Stricken Reminder Token) are not meek.

    Args:
        card: Full card dictionary from extended card database.
        side_key: Target side key (e.g. ``'top'``, ``'bottom'``, or ``'shared'``).

    Returns:
        True if the side's printed base identity is meek, otherwise False.
    """
    sa = get_side_field(card, side_key, "SpecialAbility", default="")
    sa_norm = (str(sa) if sa is not None else "").strip().lower()

    if sa_norm not in _TRIVIAL_ABILITY_TEXTS:
        return False

    # Printed "Meek" is explicitly meek even on single-sided Star Heroes (e.g. Saint Patrick (GoC)).
    if sa_norm == "meek":
        return True

    real_keys = _get_real_side_keys(card)
    star_ability = str(card.get("StarAbility") or "").strip()
    if len(real_keys) <= 1 and star_ability and sa_norm == "":
        return False

    return True


def _apply_boolean_side_field(
    card: dict,
    field_name: str,
    resolver,
) -> Optional[bool]:
    """Computes a boolean side field across CardSides and syncs card top-level value.

    Args:
        card: Mutable card dictionary.
        field_name: PascalCase field name (e.g. ``'IsCloud'`` or ``'IsMeek'``).
        resolver: Callable taking ``(card, side_key) -> bool``.

    Returns:
        Top-level boolean if all real sides agree, else None.
    """
    sides = card.get("CardSides")
    if not isinstance(sides, dict) or not sides:
        val = bool(resolver(card, "top"))
        card[field_name] = val
        return val

    real_keys = _get_real_side_keys(card)
    resolved_values: Dict[str, bool] = {}

    for sk in real_keys:
        if sk not in sides or not isinstance(sides[sk], dict):
            continue
        # Remove stale top-level duplicates in shared before recalculating per side.
        if sk != "shared" and isinstance(sides.get("shared"), dict):
            sides["shared"].pop(field_name, None)
        val = bool(resolver(card, sk))
        sides[sk][field_name] = val
        resolved_values[sk] = val

    _dedupe_shared_fields(sides)

    unique_vals = set(resolved_values.values())
    top_level_val: Optional[bool] = (
        next(iter(unique_vals)) if len(unique_vals) == 1 else None
    )
    card[field_name] = top_level_val
    return top_level_val


def apply_is_cloud_to_card_sides(card: dict) -> Optional[bool]:
    """Resolves and stores ``IsCloud`` on both ``CardSides`` and top-level card.

    Args:
        card: Mutable extended card dictionary.

    Returns:
        Top-level ``IsCloud`` boolean if uniform across sides, otherwise None.
    """
    return _apply_boolean_side_field(card, "IsCloud", resolve_is_cloud)


def apply_is_meek_to_card_sides(card: dict) -> Optional[bool]:
    """Resolves and stores ``IsMeek`` on both ``CardSides`` and top-level card.

    Args:
        card: Mutable extended card dictionary.

    Returns:
        Top-level ``IsMeek`` boolean if uniform across sides, otherwise None (``null``).
    """
    return _apply_boolean_side_field(card, "IsMeek", resolve_is_meek)


def _rename_ordir_list(categories: List[str]) -> List[str]:
    """Applies canonical category renames and deduplicates preserving sorted order.

    Args:
        categories: Raw list of ORDIR category strings.

    Returns:
        Sorted list of unique canonical category strings.
    """
    renamed = {ORDIR_CATEGORY_RENAMES.get(cat, cat) for cat in categories if cat}
    return sorted(renamed)


def apply_rule_based_ordir_tags(card: dict) -> None:
    """Applies canonical renames and deterministic rule-based ORDIR tags to a card.

    Normalizes verbose ORDIR category names (e.g. Royalty) and assigns:
    - ``"Temple"`` for Fortress/Site sides with ``temple`` in the card name.
    - ``"Tabernacle"`` for Fortress sides with ``tabernacle`` in the card name.
    - ``"Joseph in the Title or Scripture Verse"`` when word ``Joseph`` is in name.

    Does NOT alter card Alignment or Type (e.g. Herod's Temple (G) stays Neutral/Site).

    Args:
        card: Mutable card dictionary whose ``ORDIR`` lists are updated in place.
    """
    card_ordir = set(_rename_ordir_list(card.get("ORDIR", []) or []))
    sides = card.get("CardSides") or {}
    real_keys = _get_real_side_keys(card)

    if isinstance(sides.get("shared"), dict) and "ORDIR" in sides["shared"]:
        sides["shared"]["ORDIR"] = _rename_ordir_list(sides["shared"]["ORDIR"])
        card_ordir.update(sides["shared"]["ORDIR"])

    for sk in real_keys:
        side_dict = sides.get(sk)
        if not isinstance(side_dict, dict):
            continue
        side_ordir = set(_rename_ordir_list(side_dict.get("ORDIR", []) or []))
        name = str(get_side_field(card, sk, "Name", default="") or "").strip()
        side_type = str(get_side_field(card, sk, "Type", default="") or "").strip()
        name_lower = name.lower()

        extra_tags: List[str] = []
        if "temple" in name_lower and side_type in TEMPLE_SIDE_TYPES:
            extra_tags.append("Temple")
        if "tabernacle" in name_lower and side_type in TABERNACLE_SIDE_TYPES:
            extra_tags.append("Tabernacle")
        if name and _JOSEPH_TITLE_PATTERN.search(name):
            extra_tags.append("Joseph in the Title or Scripture Verse")

        if extra_tags:
            side_ordir.update(extra_tags)
            card_ordir.update(extra_tags)

        if side_ordir:
            side_dict["ORDIR"] = sorted(side_ordir)
        elif "ORDIR" in side_dict:
            del side_dict["ORDIR"]

    card["ORDIR"] = sorted(card_ordir)


def resolve_group_fields_for_card(card: dict) -> Tuple[Optional[bool], Optional[bool]]:
    """Convenience wrapper applying rule-based ORDIR tags, IsCloud, and IsMeek.

    Args:
        card: Mutable card dictionary.

    Returns:
        Tuple of ``(top_level_is_cloud, top_level_is_meek)``.
    """
    apply_rule_based_ordir_tags(card)
    is_cloud = apply_is_cloud_to_card_sides(card)
    is_meek = apply_is_meek_to_card_sides(card)
    return is_cloud, is_meek
