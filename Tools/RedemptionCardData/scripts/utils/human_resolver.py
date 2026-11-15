"""Resolves character IsHuman metadata and normalizes CardSides Classes."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

from models.enums.gender import CHARACTER_SIDE_TYPES

try:
    from utils.card_helpers import get_side_field
    from utils.generic_resolver import _dedupe_shared_fields
except ImportError:
    from scripts.utils.card_helpers import get_side_field
    from scripts.utils.generic_resolver import _dedupe_shared_fields

NON_HUMAN_ORDIR_CATEGORIES: Set[str] = {
    "Angel",
    "Revelation Angel",
    "Animal",
    "Demon",
    "Beast",
    "Symbolic Character",
}

# Closed ORDIR 7.0.0 list (p. 124) of Symbolic Characters (lowercased base names).
SYMBOLIC_CHARACTER_BASE_NAMES: Set[str] = {
    "hope",
    "humble seeker",
    "mighty warrior",
    "righteous seeker",
    "the mighty warrior",
    "warrior in training",
    "conquer",
    "first seal, conquer",
    "death",
    "fourth seal, death",
    "fourth seal",
    "death & hades",
    "doubt",
    "famine",
    "third seal, famine",
    "third seal",
    "madness",
    "roaring lion",
    "self",
    "terror",
    "sixth seal, terror",
    "sixth seal",
    "war",
    "second seal, war",
    "second seal",
}

_BRACKETS_RE = re.compile(r"\[[^\]]*\]|\([^)]*\)")
_HUMAN_EXPLICIT_TOKENS: Set[str] = {"human", "male human", "female human"}
_NON_HUMAN_EXPLICIT_TOKENS: Set[str] = {
    "angel",
    "animal",
    "demon",
    "beast",
    "symbolic",
    "non-human",
    "evil character is an animal",
    "evil character is a demon",
}


def _strip_name_decorators(name: str) -> str:
    """Strips parenthetical set tags and bracketed suffixes from a card name.

    Args:
        name: Raw card side name string.

    Returns:
        Lowercased base name string without decorators.
    """
    cleaned = _BRACKETS_RE.sub("", name)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def _extract_clean_identifier_tokens(identifier: str, side_type: str) -> List[str]:
    """Extracts role tokens relevant to the target character side from Identifier.

    Strips parenthetical notes, square-bracketed token definitions, formula clauses
    containing '=', and Taunt reminders so referenced nouns (e.g. 'X = # of humans')
    cannot falsely mark a non-human character as human.

    Args:
        identifier: Raw card-level Identifier string.
        side_type: Character CardType of the evaluated side (e.g. 'Hero', 'Evil Character').

    Returns:
        List of cleaned lowercase tokens applicable to the evaluated side.
    """
    if not identifier:
        return []

    side_low = side_type.lower()
    is_evil_side = "evil" in side_low
    is_hero_side = "hero" in side_low or "good" in side_low

    stripped = _BRACKETS_RE.sub(" ", identifier)
    tokens: List[str] = []
    for raw_part in stripped.split(","):
        part = re.sub(r"\s+", " ", raw_part).strip().lower()
        if not part or "=" in part or part.startswith("taunt"):
            continue

        m_evil = re.match(r"^evil\s+character\s+is\s+(?:an?\s+)?(.+)$", part)
        if m_evil:
            if is_evil_side:
                tokens.append(part)
                tokens.append(m_evil.group(1).strip())
            continue

        m_hero = re.match(r"^(?:hero|good\s+character)\s+is\s+(?:an?\s+)?(.+)$", part)
        if m_hero:
            if is_hero_side:
                tokens.append(part)
                tokens.append(m_hero.group(1).strip())
            continue

        tokens.append(part)
    return tokens


def resolve_is_human(card: Dict[str, Any], side_key: str = "top") -> Optional[bool]:
    """Determines whether a card side represents a human character per ORDIR 7.0.0.

    Returns True for human characters (including Giants and dual-role Human cards
    such as Great Multitude), False for non-human characters (Angels, Animals,
    Demons, Beasts, Symbolic Characters, and single-brigade Silver Heroes /
    Orange Evil Characters), and None for non-character sides.

    Args:
        card: Card dictionary containing Type/CardSides/ORDIR/Identifier metadata.
        side_key: Target side key ('top', 'bottom', etc.). Defaults to 'top'.

    Returns:
        True for human characters, False for non-human characters, or None if not a character side.
    """
    side_type = get_side_field(card, side_key, "Type") or card.get("Type")
    if not side_type or side_type not in CHARACTER_SIDE_TYPES:
        return None

    identifier = str(card.get("Identifier") or "")
    ident_tokens = _extract_clean_identifier_tokens(identifier, str(side_type))
    if any(tok in _HUMAN_EXPLICIT_TOKENS for tok in ident_tokens):
        return True

    ordir_tags = set(get_side_field(card, side_key, "ORDIR") or card.get("ORDIR") or [])
    if ordir_tags & NON_HUMAN_ORDIR_CATEGORIES:
        return False

    if any(tok in _NON_HUMAN_EXPLICIT_TOKENS for tok in ident_tokens):
        return False

    raw_name = str(get_side_field(card, side_key, "Name") or card.get("Name") or "")
    base_name = _strip_name_decorators(raw_name)
    if base_name in SYMBOLIC_CHARACTER_BASE_NAMES:
        return False

    brigades = get_side_field(card, side_key, "Brigades")
    if brigades is None:
        brigades = card.get("Brigades") or []
    if side_type in {"Hero", "Hero Token"} and brigades == ["Silver"]:
        return False
    if side_type in {"Evil Character", "Evil Character Token"} and brigades == ["Orange"]:
        return False

    return True


def apply_is_human_to_card_sides(card: Dict[str, Any]) -> None:
    """Applies resolved IsHuman flags to all character sides in CardSides.

    Strips IsHuman from top-level card dicts and non-character sides, writes
    per-side IsHuman values for character sides, and deduplicates identical
    dual-card fields into CardSides['shared'].

    Args:
        card: Card dictionary mutated in place.
    """
    card.pop("IsHuman", None)
    sides = card.get("CardSides")
    if not isinstance(sides, dict) or not sides:
        return

    shared = sides.get("shared")
    if isinstance(shared, dict):
        shared.pop("IsHuman", None)

    real_keys = [k for k in sides.keys() if k != "shared" and isinstance(sides[k], dict)]
    for sk in real_keys:
        resolved = resolve_is_human(card, sk)
        if resolved is None:
            sides[sk].pop("IsHuman", None)
        else:
            sides[sk]["IsHuman"] = resolved

    _dedupe_shared_fields(sides)


def _split_cls_list(cls_list: Any) -> List[str]:
    """Splits slash- or comma-delimited class entries into canonical class names.

    Args:
        cls_list: Existing Classes field (list of strings, or None).

    Returns:
        Deduplicated list of trimmed class names preserving original order.
    """
    if not isinstance(cls_list, list):
        return []
    result: List[str] = []
    seen = set()
    for raw_item in cls_list:
        for part in re.split(r"[,/]", str(raw_item)):
            cleaned = part.strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                result.append(cleaned)
    return result


def normalize_card_classes(card: Dict[str, Any]) -> None:
    """Normalizes CardSides['Classes'] and restricts dual-card character-only Territory class.

    Splits compound class strings (e.g. 'Territory/Warrior', 'Territory / Warrior') into
    separate list elements, ensures 'Character is territory class' and 'Hero is Territory Class'
    apply only to character sides (and adds missing Territory class such as on -1456985059),
    and re-deduplicates identical fields into CardSides['shared'].

    Args:
        card: Card dictionary mutated in place.
    """
    sides = card.get("CardSides")
    if not isinstance(sides, dict) or not sides:
        return

    shared = sides.get("shared")
    if isinstance(shared, dict) and "Classes" in shared:
        split_shared = _split_cls_list(shared.get("Classes"))
        if split_shared:
            shared["Classes"] = split_shared
        else:
            shared.pop("Classes", None)

    real_keys = [k for k in sides.keys() if k != "shared" and isinstance(sides[k], dict)]
    for sk in real_keys:
        if "Classes" in sides[sk]:
            split_side = _split_cls_list(sides[sk].get("Classes"))
            if split_side:
                sides[sk]["Classes"] = split_side
            else:
                sides[sk].pop("Classes", None)

    ident_low = str(card.get("Identifier") or "").lower()
    if "character is territory class" in ident_low or "hero is territory class" in ident_low:
        shared_cls_base: List[str] = []
        if isinstance(shared, dict) and isinstance(shared.get("Classes"), list):
            shared_cls_base = list(shared["Classes"])
            rem_shared = [c for c in shared_cls_base if c != "Territory"]
            if rem_shared:
                shared["Classes"] = rem_shared
            else:
                shared.pop("Classes", None)

        for sk in real_keys:
            side_type = get_side_field(card, sk, "Type")
            cur_cls = list(sides[sk].get("Classes") or [])
            # Preserve any non-Territory shared classes onto sides if extracted out of shared.
            for sc in shared_cls_base:
                if sc != "Territory" and sc not in cur_cls:
                    cur_cls.append(sc)
            if side_type in CHARACTER_SIDE_TYPES:
                if "Territory" not in cur_cls:
                    cur_cls.append("Territory")
                sides[sk]["Classes"] = cur_cls
            else:
                cur_cls = [c for c in cur_cls if c != "Territory"]
                if cur_cls:
                    sides[sk]["Classes"] = cur_cls
                else:
                    sides[sk].pop("Classes", None)

    _dedupe_shared_fields(sides)
