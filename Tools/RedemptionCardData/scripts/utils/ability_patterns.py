"""Regex pattern engine and tokenizers for parsing Redemption card abilities.

Extracts protection modifiers, limits, triggers, context creators, and
standard effect clauses per the Redemption Exegesis Guide (REG v11.0.0).
"""

from __future__ import annotations
import re
from typing import Dict, List, Optional, Tuple, Literal

from models.enums.modifier_type import ModifierType
from models.enums.activation_mode import ActivationMode
from models.enums.action_verb import ActionVerb
from models.enums.zone import Zone
from models.enums.condition_type import ConditionType
from models.enums.selection_mode import SelectionMode
from models.logic.modifier import Modifier, LimitParams, ReplacementParams
from models.logic.condition_expression import ConditionExpression
from models.logic.target_selector import TargetSelector

# Protection modifier patterns
PROTECTION_REGEX = re.compile(
    r'\b(?:can\s*\[?not\]?|cannot)\s+be\s+([a-zA-Z\s,]+?)(?:\.|$)',
    re.IGNORECASE
)

# Limit Pattern
LIMIT_PATTERN = re.compile(
    r'\blimit(?:\s*:\s*|\s+)(once|twice|\d+)\s+per\s+(turn|battle|round|game)\b',
    re.IGNORECASE
)

# Instead / Replacement Pattern
INSTEAD_PATTERN = re.compile(
    r'\bif\s+([a-zA-Z\s]+?),\s*([a-zA-Z\s]+?)\s+instead\b',
    re.IGNORECASE
)

# STAR Entry Trigger
STAR_PATTERN = re.compile(
    r'^\s*STAR\s*:\s*(.*)$',
    re.IGNORECASE
)

# Zone Suffixes
ZONE_SUFFIX_PATTERN = re.compile(
    r'\s+(?:from|in)\s+(each\s+opponent\'s|opponent\'s|your|the)?\s*(territory|hand|deck|discard pile|set-aside area|land of bondage|battle|field of battle|field of play|play)\b',
    re.IGNORECASE
)

# Condition Prefixes
COND_IF_USED_BY = re.compile(r'^\s*if\s+used\s+by\s+(?:an?\s+)?([a-zA-Z\s/\.\{\}]+?)(?:,\s*|\s+(?=(?:holder|you)\b))\s*(.*)$', re.IGNORECASE)
COND_IF_BLOCKING = re.compile(r'^\s*if\s+blocking,?\s*(.*)$', re.IGNORECASE)
COND_IF_IN_BATTLE = re.compile(r'^\s*if\s+(?:a\s+hero\s+is\s+in\s+battle|in\s+battle),?\s*(.*)$', re.IGNORECASE)


def protect_abbreviations(text: str) -> str:
    """Masks periods in known abbreviations so sentence splitters do not break them.

    Args:
        text: Raw ability string.

    Returns:
        String with masked abbreviations.
    """
    masked = re.sub(r'\bO\.T\.', '{{OT}}', text, flags=re.IGNORECASE)
    masked = re.sub(r'\bN\.T\.', '{{NT}}', masked, flags=re.IGNORECASE)
    masked = re.sub(r'\be\.g\.', '{{EG}}', masked, flags=re.IGNORECASE)
    masked = re.sub(r'\bi\.e\.', '{{IE}}', masked, flags=re.IGNORECASE)
    return masked


def restore_abbreviations(text: str) -> str:
    """Restores masked abbreviations back to their canonical forms.

    Args:
        text: String with masked tokens.

    Returns:
        String with original abbreviation forms.
    """
    restored = text.replace('{{OT}}', 'O.T.').replace('{{NT}}', 'N.T.')
    restored = restored.replace('{{EG}}', 'e.g.').replace('{{IE}}', 'i.e.')
    return restored


def extract_star_trigger(text: str) -> Tuple[str, bool]:
    """Checks for and extracts a STAR entry trigger prefix.

    Args:
        text: Raw ability text.

    Returns:
        Tuple of (cleaned_text, is_star_trigger).
    """
    match = STAR_PATTERN.match(text)
    if match:
        return match.group(1).strip(), True
    return text, False


def extract_modifiers_from_text(text: str) -> Tuple[str, List[Modifier]]:
    """Extracts protection, limit, and replacement modifiers from an ability text.

    Args:
        text: Raw ability text.

    Returns:
        Tuple of (cleaned_remaining_text, list_of_extracted_modifiers).
    """
    cleaned = text
    modifiers: List[Modifier] = []

    match = PROTECTION_REGEX.search(cleaned)
    if match:
        prot_str = match.group(1).lower()
        if "negat" in prot_str:
            modifiers.append(Modifier(modifier_type=ModifierType.CANNOT_BE_NEGATED, applies_to="this_side"))
        if "interrupt" in prot_str:
            modifiers.append(Modifier(modifier_type=ModifierType.CANNOT_BE_INTERRUPTED, applies_to="this_side"))
        if "prevent" in prot_str:
            modifiers.append(Modifier(modifier_type=ModifierType.CANNOT_BE_PREVENTED, applies_to="this_side"))
        cleaned = PROTECTION_REGEX.sub("", cleaned).strip()

    if re.search(r'\bregardless\b', cleaned, re.IGNORECASE):
        modifiers.append(Modifier(modifier_type=ModifierType.REGARDLESS, applies_to="this_side"))
        cleaned = re.sub(r'\bregardless\b', '', cleaned, flags=re.IGNORECASE).strip()

    limit_match = LIMIT_PATTERN.search(cleaned)
    if limit_match:
        count_str, per_str = limit_match.groups()
        count = 1 if count_str.lower() == "once" else (2 if count_str.lower() == "twice" else int(count_str))
        per = per_str.lower()
        if per in ("turn", "battle", "round", "game"):
            modifiers.append(Modifier(
                modifier_type=ModifierType.LIMIT,
                applies_to="this_ability",
                limit_params=LimitParams(count=count, per=per)
            ))
            cleaned = LIMIT_PATTERN.sub("", cleaned).strip()

    instead_match = INSTEAD_PATTERN.search(cleaned)
    if instead_match:
        trig, action = instead_match.groups()
        modifiers.append(Modifier(
            modifier_type=ModifierType.INSTEAD,
            applies_to="this_ability",
            replacement_params=ReplacementParams(
                trigger_event=trig.strip().lower(),
                replace_with_action=action.strip().lower()
            )
        ))
        cleaned = INSTEAD_PATTERN.sub("", cleaned).strip()

    cleaned = re.sub(r'[\s\.;,]+$', '', cleaned).strip()
    return cleaned, modifiers


def extract_condition_prefix(text: str) -> Tuple[str, Optional[ConditionExpression]]:
    """Extracts leading conditional phrasing like 'If used by a Hero,' or 'If blocking,'.

    Args:
        text: Ability text clause.

    Returns:
        Tuple of (remaining_action_text, Optional[ConditionExpression]).
    """
    m = COND_IF_USED_BY.match(text)
    if m:
        hero_type, rem = m.groups()
        clean_hero_type = restore_abbreviations(hero_type).strip().lower()
        cond = ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                scope=Zone.BATTLE,
                target_type=clean_hero_type
            ),
            operator=">=",
            value=1
        )
        return rem.strip(), cond

    m = COND_IF_BLOCKING.match(text)
    if m:
        rem = m.group(1)
        cond = ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(selection_mode=SelectionMode.AUTOMATIC_ALL, scope=Zone.BATTLE),
            operator="==",
            value="blocking"
        )
        return rem.strip(), cond

    m = COND_IF_IN_BATTLE.match(text)
    if m:
        rem = m.group(1)
        cond = ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(selection_mode=SelectionMode.AUTOMATIC_ALL, scope=Zone.BATTLE),
            operator=">=",
            value=1
        )
        return rem.strip(), cond

    return text, None


def parse_target_zone_suffix(text: str) -> Tuple[str, Zone, Literal["controller", "opponent", "both"]]:
    """Extracts trailing zone descriptions (e.g. 'from opponent's territory').

    Args:
        text: Target text chunk.

    Returns:
        Tuple of (clean_target_text, Zone, zone_owner).
    """
    m = ZONE_SUFFIX_PATTERN.search(text)
    if not m:
        return text.strip(), Zone.BATTLE, "controller"

    owner_str = (m.group(1) or "").lower().strip()
    zone_str = m.group(2).lower().strip()

    zone = Zone.BATTLE
    if "territory" in zone_str:
        zone = Zone.TERRITORY
    elif "hand" in zone_str:
        zone = Zone.HAND
    elif "deck" in zone_str:
        zone = Zone.DECK
    elif "discard" in zone_str:
        zone = Zone.DISCARD_PILE
    elif "set-aside" in zone_str:
        zone = Zone.SET_ASIDE
    elif "bondage" in zone_str:
        zone = Zone.LAND_OF_BONDAGE
    elif "play" in zone_str:
        zone = Zone.IN_PLAY

    owner: Literal["controller", "opponent", "both"] = "controller"
    if "each opponent" in owner_str or "opponent" in owner_str:
        owner = "opponent"

    clean_target = ZONE_SUFFIX_PATTERN.sub("", text).strip()
    return clean_target, zone, owner
