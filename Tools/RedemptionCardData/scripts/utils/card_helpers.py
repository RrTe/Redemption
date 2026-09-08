"""
Shared helper utilities for accessing card data in the new CardSides schema.

This module provides a unified API so all pipeline scripts use the same
field-access logic, regardless of whether a card is single-sided or dual-sided.

Usage pattern for side-specific fields:
    name = get_side_field(card, "top", "Name")
    # Falls back to CardSides["shared"] if not present in "top".

Usage pattern for the primary card name (convenience wrapper):
    name = get_card_name(card)
"""

from __future__ import annotations

import re


def get_side_field(card: dict, side_key: str, field: str, default=None):
    """Returns a side-specific field, with fallback to the 'shared' block.

    Looks up the field in ``CardSides[side_key]`` first. If absent, falls back
    to ``CardSides['shared']``. If still absent, returns ``default``.

    Args:
        card: Full card dict from the JSON database.
        side_key: The side to query, typically ``"top"`` or ``"bottom"``.
        field: The field name to retrieve (e.g. ``"Name"``, ``"Type"``).
        default: Value to return when the field is not found anywhere.

    Returns:
        The field value from the side, shared block, or default.
    """
    sides = card.get("CardSides", {})
    side = sides.get(side_key, {})
    if field in side:
        return side[field]
    shared = sides.get("shared", {})
    return shared.get(field, default)


def get_card_name(card: dict, side_key: str = "top") -> str:
    """Returns the display name for a card, checking side then shared.

    Args:
        card: Full card dict from the JSON database.
        side_key: The preferred side to query. Defaults to ``"top"``.

    Returns:
        The card name string, or an empty string if not found.
    """
    return get_side_field(card, side_key, "Name", default="")


def get_all_types(card: dict) -> list[str]:
    """Returns all unique card types across all sides (excluding 'shared').

    Args:
        card: Full card dict from the JSON database.

    Returns:
        List of unique type strings found in any CardSide.
    """
    sides = card.get("CardSides", {})
    types = []
    for key, side in sides.items():
        if key == "shared":
            continue
        if isinstance(side, dict):
            t = side.get("Type")
            if t and t not in types:
                types.append(t)
    return types


def check_is_star_card(card: dict) -> bool:
    """Determines whether a card qualifies as a Star card based on Option 3 criteria.

    A card is recognized as a Star card if any of the following conditions hold:
    1. 'Class' or side 'Classes' contains 'star' (case-insensitive).
    2. Any 'SpecialAbility' contains a 'STAR:' tag or entry trigger.
    3. 'Star Card' is present in 'ORDIR' categories.

    Args:
        card: Full card dictionary from the database.

    Returns:
        bool: True if any Star card criterion is fulfilled, False otherwise.
    """
    if card.get("IsStarCard") is True:
        return True

    # 1. Check Class / Classes
    raw_class = card.get("Class", "")
    if "star" in str(raw_class).lower():
        return True

    sides = card.get("CardSides", {})
    for side_key, side_val in sides.items():
        if isinstance(side_val, dict):
            cls = side_val.get("Classes", [])
            if isinstance(cls, list) and any("star" in str(c).lower() for c in cls):
                return True
            if isinstance(cls, str) and "star" in cls.lower():
                return True
            if "star" in str(side_val.get("Class", "")).lower():
                return True

    # 2. Check SpecialAbility for STAR: tag
    star_regex = re.compile(r"(?:^|[\s/])STAR:\s*", re.IGNORECASE)
    raw_ability = card.get("SpecialAbility", "")
    if star_regex.search(str(raw_ability)):
        return True

    for side_key, side_val in sides.items():
        if isinstance(side_val, dict):
            ab = side_val.get("SpecialAbility", "")
            if ab and star_regex.search(str(ab)):
                return True

    # 3. Check ORDIR categories
    ordir = card.get("ORDIR", [])
    if any(str(cat).lower() == "star card" for cat in ordir):
        return True

    return False
