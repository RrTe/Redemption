"""Centralized Redemption REG v11.0.0 Vocabulary & Legacy Equivalence Matrix.

Maps legacy, slang, or obsolete terms to canonical REG enums and defines
syntactic patterns for player restrictions and action prohibitions.
"""

from typing import Dict, Optional, Set
import re

# Canonical REG Action mappings for legacy terms
REG_LEGACY_SYNONYMS: Dict[str, str] = {
    "repent": "convert",
    "fall": "convert",
    "repel": "withdraw",
    "ignore": "withdraw",
    "retreat": "withdraw",
    "return to territory": "withdraw",
    "return to hand": "bounce",
    "take prisoner": "capture",
    "restore abilities": "heal",
    "band with": "band",
    "join the battle": "band",
    "remove from the game": "banish",
    "remove from game": "banish",
    "do this twice": "repeat",
    "put on bottom of deck": "underdeck",
    "put on top of deck": "topdeck",
    "discard as it is played": "toss",
    "force to block": "taunt",
    "force to enter battle": "taunt",
    "renders harmless": "negate",
    "render harmless": "negate",
}

# Regex patterns identifying player restrictions / prohibitions (ActionVerb: RESTRICT)
RESTRICTION_PATTERNS = [
    re.compile(r"\b(?:player|no\s+player|opponent|you)\s+(?:may\s+not|cannot|can\s+not)\s+(?!be\b)(\w+)", re.I),
    re.compile(r"\b(?:may\s+not|cannot|can\s+not)\s+(?:draw|play|search|rescue|block|activate)\b", re.I),
    re.compile(r"\bno\s+(\w+)\s+(?:card\s+)?may\s+be\s+played\b", re.I),
    re.compile(r"\bskip\s+(?:the\s+)?(\w+)\s+phase\b", re.I),
]

# Regex patterns identifying battle entry prohibitions (ActionVerb: WITHDRAW per REG)
BATTLE_ENTRY_PROHIBITIONS = [
    re.compile(r"\bcannot\s+enter\s+battle\b", re.I),
    re.compile(r"\bmay\s+not\s+be\s+blocked\s+by\b", re.I),
    re.compile(r"\bmay\s+not\s+enter\s+battle\b", re.I),
    re.compile(r"\brepels?\b", re.I),
]

# Regex patterns identifying passive card protection modifiers
PROTECTION_MODIFIERS = [
    re.compile(r"\bcannot\s+be\s+(discarded|captured|negated|interrupted|prevented)\b", re.I),
    re.compile(r"\bprotected\s+from\s+(\w+)\b", re.I),
    re.compile(r"\bimmune\s+to\s+(\w+)\b", re.I),
]

# Trigger clause patterns where actions are conditions rather than card effects
TRIGGER_PATTERNS = [
    re.compile(r"\b(?:each\s+time|when|whenever|if)\s+(?:an?\s+)?(?:opponent|player|hero)\s+(\w+)s?\b", re.I),
    re.compile(r"\bafter\s+(?:an?\s+)?(?:opponent|player|hero)\s+(\w+)s?\b", re.I),
    re.compile(r"\b(?:cards?|enhancements?|characters?)\s+(?:that\s+)?(?:(?:an?|your|their)\s+)?(?:opponents?|players?|heroes?|you)\s+(\w+)s?\b", re.I),
]


def is_action_prohibited(raw_text: str, action: str) -> bool:
    """Checks if an action verb appears in a negated, prohibited, protected, or immune context."""
    raw_lower = raw_text.lower()
    prohibition_re = re.compile(
        rf"\b(?:may\s+not|cannot|can\s+not|prevent(?:ed)?\s+from|protect(?:ed)?\s+from|immune\s+to)\s+(?:be\s+|being\s+)?{action}\b",
        re.I
    )
    if prohibition_re.search(raw_lower):
        return True

    # Check for relational protection/immunity clauses: 'protect [targets] from [action]'
    if re.search(rf"\bprotect(?:ed)?\b.*?\bfrom\s+(?:being\s+)?{action}\b", raw_lower):
        return True
    if re.search(rf"\bimmune\b.*?\bto\s+(?:being\s+)?{action}\b", raw_lower):
        return True

    if f"cannot be {action}" in raw_lower or f"may not be {action}" in raw_lower:
        return True

    for pattern in RESTRICTION_PATTERNS:
        for match in pattern.finditer(raw_lower):
            matched_verb = match.group(1)
            if matched_verb and (matched_verb.startswith(action) or action.startswith(matched_verb)):
                return True

    return False


def is_action_in_trigger(raw_text: str, action: str) -> bool:
    """Checks if an action verb is part of an event trigger rather than an effect."""
    raw_lower = raw_text.lower()
    for pattern in TRIGGER_PATTERNS:
        for match in pattern.finditer(raw_lower):
            matched_word = match.group(1)
            if matched_word.startswith(action) or action.startswith(matched_word):
                return True
    return False


def get_canonical_action(term: str) -> Optional[str]:
    """Returns canonical modern REG action verb for legacy phrases."""
    term_lower = term.strip().lower()
    return REG_LEGACY_SYNONYMS.get(term_lower)
