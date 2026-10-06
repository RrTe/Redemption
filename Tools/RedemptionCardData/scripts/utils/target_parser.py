"""Target parsing and classification utilities for Redemption CCG abilities.

Handles REG v11.0.0 compliant zone extraction, owner resolution, and
target alignment/type separation.
"""

from __future__ import annotations
import re
from typing import List, Optional, Tuple, Literal

from models.enums.zone import Zone
from models.enums.selection_mode import SelectionMode
from models.logic.target_selector import TargetSelector
from models.logic.dynamic_value import DynamicValue

# Zone Suffix Pattern matching trailing or embedded zone phrases
ZONE_SUFFIX_PATTERN = re.compile(
    r'\s+(?:from|in|of)\s+(each\s+opponent\'s|opponent\'s|your|the|a\s+player\'s|a|an)?\s*'
    r'(territory|hand|deck|discard\s+pile|discard|set-aside\s+area|set-aside|land\s+of\s+bondage|'
    r'battle|field\s+of\s+battle|field\s+of\s+play|play|reserve\s+pile|reserve)\b',
    re.IGNORECASE
)


def parse_target_zone_suffix(text: str) -> Tuple[str, Zone, Literal["controller", "opponent", "both", "either"]]:
    """Extracts trailing zone descriptions (e.g. 'from opponent's territory').

    Per REG v11.0.0, if no explicit zone is specified, targets default to 'in_play',
    and unrestricted targets can belong to 'either' player.

    Args:
        text: Target text chunk.

    Returns:
        Tuple of (clean_target_text, Zone, zone_owner).
    """
    m = ZONE_SUFFIX_PATTERN.search(text)
    if not m:
        is_all = bool(re.search(r'\ball\b', text, re.IGNORECASE))
        return text.strip(), Zone.IN_PLAY, "both" if is_all else "either"

    owner_str = (m.group(1) or "").lower().strip()
    zone_str = m.group(2).lower().strip()

    zone = Zone.IN_PLAY
    if "territory" in zone_str:
        zone = Zone.TERRITORY
    elif "hand" in zone_str:
        zone = Zone.HAND
    elif "deck" in zone_str:
        zone = Zone.DECK
    elif "discard" in zone_str:
        zone = Zone.DISCARD_PILE
    elif "reserve" in zone_str:
        zone = Zone.RESERVE_PILE
    elif "set-aside" in zone_str:
        zone = Zone.SET_ASIDE
    elif "bondage" in zone_str:
        zone = Zone.LAND_OF_BONDAGE
    elif "battle" in zone_str:
        zone = Zone.BATTLE
    elif "play" in zone_str:
        zone = Zone.IN_PLAY

    owner: Literal["controller", "opponent", "both", "either"] = "either"
    if "each opponent" in owner_str or "opponent" in owner_str:
        owner = "opponent"
    elif "your" in owner_str:
        owner = "controller"
    elif "both" in owner_str:
        owner = "both"
    elif re.search(r'\ball\b', text, re.IGNORECASE):
        owner = "both"

    clean_target = ZONE_SUFFIX_PATTERN.sub("", text).strip()
    return clean_target, zone, owner


def parse_target_classification(target_text: str) -> Tuple[Optional[str], Optional[str], List[str]]:
    """Separates alignment, canonical target_type, and extra identifiers from target text.

    Args:
        target_text: Raw or clean target text (e.g. 'an evil card', 'all Demons').

    Returns:
        Tuple of (target_type, alignment, identifiers).
    """
    clean = target_text.strip()
    clean = re.sub(r'^(?:an?|the|all|one)\s+', '', clean, flags=re.IGNORECASE).strip()

    alignment: Optional[str] = None
    if re.search(r'\bevil\b', clean, re.IGNORECASE):
        alignment = "evil"
        clean = re.sub(r'\bevil\b', '', clean, flags=re.IGNORECASE).strip()
    elif re.search(r'\bgood\b', clean, re.IGNORECASE):
        alignment = "good"
        clean = re.sub(r'\bgood\b', '', clean, flags=re.IGNORECASE).strip()
    elif re.search(r'\bneutral\b', clean, re.IGNORECASE):
        alignment = "neutral"
        clean = re.sub(r'\bneutral\b', '', clean, flags=re.IGNORECASE).strip()

    clean = re.sub(r'\s+', ' ', clean).strip().lower()

    target_type: Optional[str] = None
    identifiers: List[str] = []

    if clean in ("card", "cards", ""):
        target_type = "card"
    elif clean in ("character", "characters"):
        target_type = "character"
    elif clean in ("hero", "heroes"):
        target_type = "hero"
        if alignment is None:
            alignment = "good"
    elif clean in ("evil character", "evil characters"):
        target_type = "character"
        alignment = "evil"
    elif clean in ("enhancement", "enhancements"):
        target_type = "enhancement"
    elif clean in ("demon", "demons"):
        target_type = "demon"
        if alignment is None:
            alignment = "evil"
    elif clean in ("lost soul", "lost souls"):
        target_type = "lost_soul"
        alignment = "neutral"
    elif clean in ("artifact", "artifacts"):
        target_type = "artifact"
    elif clean in ("fortress", "fortresses"):
        target_type = "fortress"
    elif clean in ("site", "sites"):
        target_type = "site"
    else:
        target_type = clean

    return target_type, alignment, identifiers


def build_target_selector(
    raw_target: str,
    cnt_token: Optional[str] = None,
    limit_val: Optional[int] = None
) -> TargetSelector:
    """Builds a validated TargetSelector from a raw target clause.

    Args:
        raw_target: Raw target text snippet (e.g. 'an evil card in battle').
        cnt_token: Optional count string (e.g. '1', '2', 'all', 'x').
        limit_val: Optional limit integer if a limit clause was present.

    Returns:
        Structured TargetSelector instance.
    """
    clean_target, scope_zone, zone_owner = parse_target_zone_suffix(raw_target)
    target_type, alignment, extra_ids = parse_target_classification(clean_target)

    is_all = bool(cnt_token and cnt_token.lower() == "all") or bool(re.search(r'\ball\b', raw_target, re.IGNORECASE))
    sel_mode = SelectionMode.AUTOMATIC_ALL if is_all else SelectionMode.MANUAL_CONTROLLER

    count_obj: Optional[DynamicValue] = None
    if cnt_token:
        c_clean = cnt_token.lower().strip()
        if c_clean == "all":
            count_obj = None
        elif c_clean == "x":
            count_obj = DynamicValue.from_variable("X", limit=limit_val)
        elif c_clean in ("one", "a", "an"):
            count_obj = DynamicValue.from_int(1)
        elif c_clean.isdigit():
            count_obj = DynamicValue.from_int(int(c_clean))
    elif not is_all:
        count_obj = DynamicValue.from_int(1)

    return TargetSelector(
        selection_mode=sel_mode,
        scope=scope_zone,
        zone_owner=zone_owner,
        target_type=target_type,
        alignment=alignment,
        identifiers=extra_ids,
        count=count_obj
    )
