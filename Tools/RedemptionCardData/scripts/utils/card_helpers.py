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
