"""Resolves and normalizes character IsGeneric flags from ORDIR and Identifier metadata."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from models.enums.gender import CHARACTER_SIDE_TYPES
from utils.card_helpers import get_side_field

# Dual-sided cards sometimes annotate generic status for only one alignment/side in Identifier,
# e.g. "Roman Centurion, (Evil) Generic", "Evil Character is a Generic, Animal",
# or "[Evil Character is generic] Persian".
_EVIL_GENERIC_PATTERN = re.compile(
    r"(?:\(Evil\)\s*Generic\b|\bEvil\s+Character\s+is\s+(?:a\s+)?Generic\b)",
    re.IGNORECASE,
)
_HERO_GENERIC_PATTERN = re.compile(
    r"(?:\((?:Good|Hero)\)\s*Generic\b|\b(?:Good\s+Character|Hero)\s+is\s+(?:a\s+)?Generic\b)",
    re.IGNORECASE,
)
_UNQUALIFIED_GENERIC_PATTERN = re.compile(r"(?<![a-zA-Z-])generic\b", re.IGNORECASE)

# Card ID where ORDIR placed "Generic Character" on the bottom GE side instead of the top Hero side.
_LOST_SHEEP_GOC_ID = "1058469578"
_ORDIR_GENERIC_TAG = "Generic Character"


def _identifier_marks_side_generic(identifier: str, side_type: str) -> bool:
    """Checks whether a card-level Identifier string marks the given character side as generic.

    Handles dual-card side-specific qualifiers (such as "(Evil) Generic" or
    "Evil Character is (a) generic") so that an alignment-restricted annotation does
    not leak onto the opposite alignment side.

    Args:
        identifier: Raw card-level Identifier string.
        side_type: CardType of the character side being evaluated (e.g. "Hero", "Evil Character").

    Returns:
        True if the Identifier string marks this character side as generic, False otherwise.
    """
    if not identifier:
        return False

    side_low = side_type.lower()
    is_evil_side = "evil" in side_low
    is_hero_side = "hero" in side_low or "good" in side_low

    if is_evil_side and _EVIL_GENERIC_PATTERN.search(identifier):
        return True
    if is_hero_side and _HERO_GENERIC_PATTERN.search(identifier):
        return True

    # Strip side-restricted generic clauses before checking for an unrestricted "Generic" token.
    stripped = _EVIL_GENERIC_PATTERN.sub(" ", identifier)
    stripped = _HERO_GENERIC_PATTERN.sub(" ", stripped)
    return bool(_UNQUALIFIED_GENERIC_PATTERN.search(stripped))


def resolve_is_generic(card: Dict[str, Any], side_key: str = "top") -> Optional[bool]:
    """Determines whether a card side is a generic character.

    Unifies both metadata sources: "Generic Character" in the side's ORDIR tags and
    generic markers in the card's Identifier field. Non-character sides are excluded.

    Args:
        card: Card dictionary containing Type/CardSides/ORDIR/Identifier metadata.
        side_key: Target side key ("top", "bottom", etc.). Defaults to "top".

    Returns:
        True for generic characters, False for non-generic (unique) characters, or None
        when the given side is not a character type.
    """
    side_type = get_side_field(card, side_key, "Type") or card.get("Type")
    if not side_type or side_type not in CHARACTER_SIDE_TYPES:
        return None

    ordir_tags = get_side_field(card, side_key, "ORDIR") or []
    has_ordir_generic = isinstance(ordir_tags, list) and _ORDIR_GENERIC_TAG in ordir_tags
    if has_ordir_generic:
        return True

    identifier = str(card.get("Identifier") or "")
    return _identifier_marks_side_generic(identifier, str(side_type))


def _dedupe_shared_fields(sides: Dict[str, Any]) -> None:
    """Moves identical non-empty fields across dual card sides into CardSides['shared'].

    Note that boolean False is intentionally preserved (distinct from None / [] / {}).

    Args:
        sides: CardSides dictionary mutated in place.
    """
    real_keys: List[str] = [
        k for k in sides.keys() if k != "shared" and isinstance(sides[k], dict)
    ]
    if len(real_keys) < 2:
        return

    shared = sides.get("shared")
    if not isinstance(shared, dict):
        shared = {}

    common_fields = set(sides[real_keys[0]].keys())
    for sk in real_keys[1:]:
        common_fields &= set(sides[sk].keys())

    for field in list(common_fields):
        values = [sides[sk][field] for sk in real_keys]
        first = values[0]
        if first is not None and first != [] and first != {} and all(v == first for v in values):
            shared[field] = first
            for sk in real_keys:
                sides[sk].pop(field, None)

    if shared:
        sides["shared"] = shared
    else:
        sides.pop("shared", None)


def apply_is_generic_to_card_sides(card: Dict[str, Any]) -> None:
    """Applies resolved IsGeneric flags to all character sides in CardSides.

    Also repairs known misattributed ORDIR "Generic Character" placement on card
    1058469578 (Lost Sheep / Good Shepherd (GoC)), strips IsGeneric from non-character
    sides, and re-deduplicates identical dual-card fields into CardSides['shared'].

    Args:
        card: Card dictionary mutated in place.
    """
    sides = card.get("CardSides")
    if not isinstance(sides, dict) or not sides:
        return

    if str(card.get("Id") or card.get("ID") or "") == _LOST_SHEEP_GOC_ID:
        bottom = sides.get("bottom")
        top = sides.get("top")
        if (
            isinstance(bottom, dict)
            and isinstance(bottom.get("ORDIR"), list)
            and _ORDIR_GENERIC_TAG in bottom["ORDIR"]
        ):
            bottom["ORDIR"] = [t for t in bottom["ORDIR"] if t != _ORDIR_GENERIC_TAG]
            if isinstance(top, dict):
                top_ordir = top.get("ORDIR")
                if not isinstance(top_ordir, list):
                    top_ordir = []
                    top["ORDIR"] = top_ordir
                if _ORDIR_GENERIC_TAG not in top_ordir:
                    top_ordir.append(_ORDIR_GENERIC_TAG)

    shared = sides.get("shared")
    if isinstance(shared, dict):
        shared.pop("IsGeneric", None)

    real_keys = [k for k in sides.keys() if k != "shared" and isinstance(sides[k], dict)]
    for sk in real_keys:
        resolved = resolve_is_generic(card, sk)
        if resolved is None:
            sides[sk].pop("IsGeneric", None)
        else:
            sides[sk]["IsGeneric"] = resolved

    _dedupe_shared_fields(sides)
