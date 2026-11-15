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
from models.logic.ability import Ability
from models.logic.modifier import Modifier, LimitParams, ReplacementParams
from models.logic.condition_expression import ConditionExpression
from models.logic.stat_filter import StatFilter
from models.logic.target_selector import TargetSelector

# Unconditional protection modifier pattern; excludes clauses qualified by conditions or sources
# so conditional "Cannot be negated/interrupted/prevented if/by/unless..." sentences stay intact.
PROTECTION_REGEX = re.compile(
    r'\b(?:(?:this(?:\s+(?:card|ability|enhancement|curse|covenant|fortress|site|artifact))?|ability)\s+)?'
    r'(?:can\s*\[?not\]?|cannot)\s+be\s+'
    r'((?:negated|interrupted|prevented)(?:\s*(?:,|or|and)\s*(?:negated|interrupted|prevented))*)\b'
    r'(?!\s+(?:if|while|unless|except|by|when|during)\b)\s*(?:\.|$)',
    re.IGNORECASE,
)

# Standalone conditional protection sentence pattern (must be matched after O.T./N.T. abbreviation masking).
CONDITIONAL_PROTECTION_SENTENCE_RE = re.compile(
    r'(?:^|(?<=[.;])\s*)'
    r'((?:(?:this(?:\s+(?:card|ability|enhancement|curse|covenant|fortress|site|artifact))?|ability)\s+)?'
    r'(?:can\s*\[?not\]?|cannot)\s+be\s+'
    r'((?:negated|interrupted|prevented)(?:\s*(?:,|or|and)\s*(?:negated|interrupted|prevented))*)\s+'
    r'((?:if|while|unless|except|by|when|during)\b[^.;]*?))'
    r'(?=\s*(?:[.;]|$))',
    re.IGNORECASE,
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
    r'^\s*(?:STAR\s*:|\(\s*Star\s*\))\s*(.*)$',
    re.IGNORECASE
)

try:
    from utils.target_parser import (
        ZONE_SUFFIX_PATTERN,
        parse_target_zone_suffix,
        parse_target_classification,
        build_target_selector,
    )
except ImportError:
    from scripts.utils.target_parser import (
        ZONE_SUFFIX_PATTERN,
        parse_target_zone_suffix,
        parse_target_classification,
        build_target_selector,
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
        clean_hero_type = restore_abbreviations(hero_type).strip()
        sel = build_target_selector(clean_hero_type, default_scope=[Zone.BATTLE])
        sel.selection_mode = SelectionMode.AUTOMATIC_ALL
        cond = ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=sel,
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


_WORD_TO_INT: Dict[str, int] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

# Proper card titles that contain trait/subtype nouns (e.g. 'King', 'Angel', 'Idols', 'in')
# and must stay in card_titles instead of being decomposed by generic target parsers.
_PROPER_PROTECTION_CARD_TITLES: Dict[str, Tuple[str, Optional[str], Optional[str]]] = {
    "abaddon": ("Abaddon", "evil_character", "evil"),
    "altar of incense": ("Altar of Incense", "artifact", None),
    "angel at jerusalem": ("Angel at Jerusalem", "hero", "good"),
    "aquila": ("Aquila", "hero", "good"),
    "assyria site": ("Assyria", "site", None),
    "babylon": ("Babylon", "site", None),
    "cain": ("Cain", "evil_character", "evil"),
    "captain of the host": ("Captain of the Host", "hero", "good"),
    "coliseum": ("Coliseum", "site", None),
    "daniel": ("Daniel", "hero", "good"),
    "david": ("David", "hero", "good"),
    "david's harp": ("David's Harp", "artifact", "good"),
    "deborah": ("Deborah", "hero", "good"),
    "denarius": ("Denarius", "artifact", None),
    "egypt site": ("Egypt", "site", None),
    "elisha": ("Elisha", "hero", "good"),
    "haman": ("Haman", "evil_character", "evil"),
    "heavenly temple": ("Heavenly Temple", "fortress", None),
    "herodias": ("Herodias", "evil_character", "evil"),
    "hosea": ("Hosea", "hero", "good"),
    "household idols": ("Household Idols", "artifact", None),
    "iddo": ("Iddo", "hero", "good"),
    "isaiah": ("Isaiah", "hero", "good"),
    "jacob": ("Jacob", "hero", "good"),
    "jeremiah": ("Jeremiah", "hero", "good"),
    "jezebel": ("Jezebel", "evil_character", "evil"),
    "joab": ("Joab", "hero", "good"),
    "joel": ("Joel", "hero", "good"),
    "john": ("John", "hero", "good"),
    "john the baptist": ("John the Baptist", "hero", "good"),
    "john the forerunner": ("John the Forerunner", "hero", "good"),
    "jonah": ("Jonah", "hero", "good"),
    "josiah": ("Josiah", "hero", "good"),
    "judas iscariot": ("Judas Iscariot", "evil_character", "evil"),
    "king amaziah": ("King Amaziah", "hero", "good"),
    "king jehu": ("King Jehu", "hero", "good"),
    "king saul": ("King Saul", "character", None),
    "lazarus": ("Lazarus", "hero", "good"),
    "lion's den": ("Lion's Den", "fortress", None),
    "mary, holy virgin": ("Mary, Holy Virgin", "hero", "good"),
    "medium in endor": ("Medium in Endor", "evil_character", "evil"),
    "micah": ("Micah", "hero", "good"),
    "michael": ("Michael", "hero", "good"),
    "moses": ("Moses", "hero", "good"),
    "nebuchadnezzar": ("Nebuchadnezzar", "evil_character", "evil"),
    "paul": ("Paul", "hero", "good"),
    "phinehas, son of eleazar": ("Phinehas, son of Eleazar", "hero", "good"),
    "priscilla": ("Priscilla", "hero", "good"),
    "red dragon": ("Red Dragon", "evil_character", "evil"),
    "ruth": ("Ruth", "hero", "good"),
    "samaria site": ("Samaria", "site", None),
    "silas": ("Silas", "hero", "good"),
    "the false prophet": ("The False Prophet", "evil_character", "evil"),
    "the garden tomb": ("The Garden Tomb", "site", None),
    "the golden altar": ("The Golden Altar", "artifact", "good"),
    "the harlot": ("The Harlot", "evil_character", "evil"),
    "the holy spirit": ("The Holy Spirit", "hero", "good"),
    "the rabsaris": ("The Rabsaris", "evil_character", "evil"),
    "the serpent": ("The Serpent", "evil_character", "evil"),
    "uriah": ("Uriah", "hero", "good"),
    "violent men": ("Violent Men", "evil_character", "evil"),
}

# ORDIR traits and multi-word descriptors that must resolve to identifiers rather than card_titles.
_PROTECTION_DESCRIPTOR_MAP: Dict[str, Dict[str, object]] = {
    "emperor": {"target_type": "character", "identifiers": ["Emperor"]},
    "thief": {"target_type": "character", "identifiers": ["Thief"]},
    "herod": {"target_type": "character", "identifiers": ["Herod"]},
    "deacon": {"target_type": "hero", "alignment": "good", "identifiers": ["Deacon"]},
    "king of judah": {"target_type": "character", "identifiers": ["King of Judah"]},
    "king of israel": {"target_type": "character", "identifiers": ["King of Israel"]},
    "israelite king": {"target_type": "character", "identifiers": ["Israelite", "King"]},
    "syrian king": {"target_type": "character", "identifiers": ["Syrian", "King"]},
    "assyrian king": {"target_type": "character", "identifiers": ["Assyrian", "King"]},
    "cloud hero": {"target_type": "hero", "alignment": "good", "identifiers": ["Cloud"]},
    "wilderness hero": {"target_type": "hero", "alignment": "good", "identifiers": ["wilderness"]},
    "corinth hero": {"target_type": "hero", "alignment": "good", "identifiers": ["Corinth"]},
    "taunting character": {"target_type": "character", "identifiers": ["taunting"]},
    "dual icon character": {"target_type": "character", "identifiers": ["dual icon"]},
    "placed orange card": {"target_type": "card", "brigades": ["Orange"], "identifiers": ["placed"]},
    "multi-brigade card": {"target_type": "card", "brigades": ["Multi"]},
    "hero (except warrior class)": {
        "target_type": "hero", "alignment": "good", "identifiers": ["except warrior class"],
    },
    "evil card of */x or less": {
        "target_type": "card",
        "alignment": "evil",
        "stat_filters": [StatFilter(stat="toughness", operator="<=", variable="X")],
    },
    "character with 'false' in the title": {
        "target_type": "character", "identifiers": ["'False' in the title"],
    },
    "hero with a judges reference": {
        "target_type": "hero", "alignment": "good", "references": ["Judges"],
    },
    "another evil greek": {
        "target_type": "evil_character", "alignment": "evil", "identifiers": ["Greek", "another"],
    },
    "magician, priest or prophet": {
        "target_type": "character", "identifiers": ["Magician", "Priest", "Prophet"],
    },
    "pharisee or sadducee": {
        "target_type": "evil_character", "alignment": "evil", "identifiers": ["Pharisee", "Sadducee"],
    },
    "unique pharisee or sadducee": {
        "target_type": "evil_character",
        "alignment": "evil",
        "is_generic": False,
        "identifiers": ["Pharisee", "Sadducee"],
    },
    "pharaoh or a herod": {
        "target_type": "evil_character", "alignment": "evil", "identifiers": ["Pharaoh", "Herod"],
    },
    "pharaoh or herod": {
        "target_type": "evil_character", "alignment": "evil", "identifiers": ["Pharaoh", "Herod"],
    },
    "hero in noah's ark": {
        "target_type": "hero", "alignment": "good", "identifiers": ["in Noah's Ark"],
    },
}


def _strip_leading_article(text: str) -> str:
    """Removes a leading indefinite or definite article and collapses internal spaces."""
    collapsed = re.sub(r'\s+', ' ', text).strip()
    return re.sub(r'^(?:an?|the)\s+', '', collapsed, flags=re.IGNORECASE).strip()


def _parse_protection_number(token: str) -> int:
    """Converts a numeric digit or English count word into an integer."""
    low = token.strip().lower()
    return _WORD_TO_INT[low] if low in _WORD_TO_INT else int(low)


def _build_protection_entity_selector(
    raw_phrase: str,
    default_scope: List[Zone],
    default_owner: Literal["controller", "opponent", "both", "either"],
) -> TargetSelector:
    """Builds a canonical TargetSelector for an actor, source, or board entity phrase.

    Args:
        raw_phrase: Noun phrase naming cards, traits, or card titles.
        default_scope: Fallback zones when the phrase omits an explicit zone.
        default_owner: Fallback zone_owner when the phrase omits ownership.

    Returns:
        Normalized TargetSelector instance compliant with schema and audit invariants.
    """
    collapsed = re.sub(r'\s+', ' ', raw_phrase).strip()
    no_art_low = _strip_leading_article(collapsed).lower()

    if no_art_low in _PROTECTION_DESCRIPTOR_MAP:
        spec = _PROTECTION_DESCRIPTOR_MAP[no_art_low]
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner=default_owner,
            scope=list(default_scope),
            **spec,  # type: ignore[arg-type]
        )

    if no_art_low in _PROPER_PROTECTION_CARD_TITLES:
        title, t_type, align = _PROPER_PROTECTION_CARD_TITLES[no_art_low]
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner=default_owner,
            scope=list(default_scope),
            target_type=t_type,
            alignment=align,
            card_titles=[title],
        )

    if collapsed.lower() in _PROPER_PROTECTION_CARD_TITLES:
        title, t_type, align = _PROPER_PROTECTION_CARD_TITLES[collapsed.lower()]
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner=default_owner,
            scope=list(default_scope),
            target_type=t_type,
            alignment=align,
            card_titles=[title],
        )

    # Check disjunction of named cards (e.g. 'Priscilla or Aquila', 'Babylon or The Harlot').
    if ' or ' in collapsed.lower() and not re.search(r'\b(?:with|except|of)\b', collapsed, re.IGNORECASE):
        parts = [p.strip() for p in re.split(r'\s+or\s+', collapsed, flags=re.IGNORECASE) if p.strip()]
        if parts and all((_strip_leading_article(p).lower() in _PROPER_PROTECTION_CARD_TITLES or p.lower() in _PROPER_PROTECTION_CARD_TITLES) for p in parts):
            titles: List[str] = []
            t_types: set[str] = set()
            aligns: set[str] = set()
            for p in parts:
                key = p.lower() if p.lower() in _PROPER_PROTECTION_CARD_TITLES else _strip_leading_article(p).lower()
                c_title, c_tt, c_al = _PROPER_PROTECTION_CARD_TITLES[key]
                titles.append(c_title)
                if c_tt:
                    t_types.add(c_tt)
                if c_al:
                    aligns.add(c_al)
            unified_tt = next(iter(t_types)) if len(t_types) == 1 else "card"
            unified_al = next(iter(aligns)) if len(aligns) == 1 else None
            return TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner=default_owner,
                scope=list(default_scope),
                target_type=unified_tt,
                alignment=unified_al,
                card_titles=titles,
            )

    sel = build_target_selector(collapsed, default_scope=default_scope, default_owner=default_owner)
    sel.selection_mode = SelectionMode.AUTOMATIC_ALL
    sel.count = None
    return sel


def parse_protection_condition_clause(cond_clause: str) -> List[ConditionExpression]:
    """Parses the condition/source tail of a conditional 'Cannot be ...' clause.

    Args:
        cond_clause: Subclause beginning with 'if', 'while', 'unless', 'except', 'by',
            'when', or 'during'.

    Returns:
        Non-empty list of ConditionExpression nodes representing the gate.
    """
    clean = re.sub(r'\s+', ' ', restore_abbreviations(cond_clause)).strip(" .;")
    low = clean.lower()

    # 1. Compound 'by <source> if <cond>' (e.g. 'by a good card if the Egypt site is in play').
    m_by_if = re.match(r'^by\s+(.+?)\s+(if|while|unless|when|during)\s+(.+)$', clean, re.IGNORECASE)
    if m_by_if:
        src_part, conj, cond_tail = m_by_if.groups()
        return (
            parse_protection_condition_clause(f"by {src_part}")
            + parse_protection_condition_clause(f"{conj} {cond_tail}")
        )

    # 2. Compound 'if used by <actor> and more than one <rest>'.
    m_used_and = re.match(
        r'^if\s+used\s+by\s+(.+?)\s+and\s+(more\s+than\s+(?:\d+|one|two|three)\s+.+)$',
        clean,
        re.IGNORECASE,
    )
    if m_used_and:
        actor_part, count_part = m_used_and.groups()
        return (
            parse_protection_condition_clause(f"if used by {actor_part}")
            + parse_protection_condition_clause(f"if {count_part}")
        )

    # 3. Direct source exclusion: 'by <source>'.
    if low.startswith("by "):
        src_str = clean[3:].strip()
        sel = _build_protection_entity_selector(src_str, default_scope=[Zone.IN_PLAY], default_owner="either")
        return [ConditionExpression(condition_type=ConditionType.ZONE_CHECK, selector=sel, operator="==")]

    # 4. Actor / opponent / target usage gating: 'if used by <actor>' / 'if played on/against <actor>'.
    m_actor = re.match(
        r'^if\s+(?:used\s+by|played\s+on|played\s+against|used\s+against)\s+(.+)$',
        clean,
        re.IGNORECASE,
    )
    if m_actor:
        actor_str = m_actor.group(1).strip()
        owner: Literal["controller", "opponent", "both", "either"] = (
            "opponent" if re.search(r'\bagainst\b', low) else "controller"
        )
        sel = _build_protection_entity_selector(actor_str, default_scope=[Zone.BATTLE], default_owner=owner)
        return [ConditionExpression(condition_type=ConditionType.ZONE_CHECK, selector=sel, operator="==")]

    # 5. Quantitative & advantage checks.
    if low == "if opponent has more cards in hand than you":
        return [ConditionExpression(
            condition_type=ConditionType.HAND_ADVANTAGE,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="opponent",
                scope=[Zone.HAND],
                target_type="card",
            ),
            operator=">",
            value=0,
        )]

    m_opp_lt = re.match(r'^if\s+opponent\s+has\s+less\s+than\s+(\d+|ten)\s+cards\s+in\s+(deck|hand)$', low)
    if m_opp_lt:
        cnt_val = _parse_protection_number(m_opp_lt.group(1))
        zone_val = Zone.DECK if m_opp_lt.group(2) == "deck" else Zone.HAND
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="opponent",
                scope=[zone_val],
                target_type="card",
            ),
            operator="<",
            value=cnt_val,
        )]

    m_opp_gt_one = re.match(r'^if\s+opponent\s+has\s+more\s+than\s+(\d+|one|two|three)\s+(.+)$', clean, re.IGNORECASE)
    if m_opp_gt_one:
        cnt_val = _parse_protection_number(m_opp_gt_one.group(1))
        tgt_sel = _build_protection_entity_selector(
            m_opp_gt_one.group(2), default_scope=[Zone.IN_PLAY], default_owner="opponent"
        )
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=tgt_sel,
            operator=">",
            value=cnt_val,
        )]

    m_more_brig = re.match(r'^if\s+more\s+than\s+(\d+|one|two|three)\s+(good|evil)\s+brigades\s+are\s+in\s+battle$', low)
    if m_more_brig:
        cnt_val = _parse_protection_number(m_more_brig.group(1))
        align_val = m_more_brig.group(2)
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="both",
                scope=[Zone.BATTLE],
                target_type="hero" if align_val == "good" else "evil_character",
                alignment=align_val,
            ),
            operator=">",
            value=cnt_val,
        )]

    m_more_ent = re.match(
        r'^if\s+more\s+than\s+(\d+|one|two|three)\s+(.+?)\s+(?:is\s+in\s+battle|are\s+in\s+battle|blocked\s+this\s+battle)$',
        clean,
        re.IGNORECASE,
    )
    if m_more_ent:
        cnt_val = _parse_protection_number(m_more_ent.group(1))
        tgt_sel = _build_protection_entity_selector(
            m_more_ent.group(2), default_scope=[Zone.BATTLE], default_owner="both"
        )
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=tgt_sel,
            operator=">",
            value=cnt_val,
        )]

    m_opp_cnt = re.match(r'^if\s+opposed\s+by\s+(\d+|two|three)\s+or\s+more\s+(.+)$', clean, re.IGNORECASE)
    if m_opp_cnt:
        cnt_val = _parse_protection_number(m_opp_cnt.group(1))
        tgt_sel = _build_protection_entity_selector(
            m_opp_cnt.group(2), default_scope=[Zone.BATTLE], default_owner="opponent"
        )
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=tgt_sel,
            operator=">=",
            value=cnt_val,
        )]

    m_ctrl_cnt = re.match(r'^if\s+you\s+control\s+(\d+|two|three)\s+or\s+more\s+(.+)$', clean, re.IGNORECASE)
    if m_ctrl_cnt:
        cnt_val = _parse_protection_number(m_ctrl_cnt.group(1))
        tgt_sel = _build_protection_entity_selector(
            m_ctrl_cnt.group(2), default_scope=[Zone.IN_PLAY], default_owner="controller"
        )
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=tgt_sel,
            operator=">=",
            value=cnt_val,
        )]

    m_x_ge = re.match(r'^if\s+X\s+is\s+(\d+)\s+or\s+greater$', clean, re.IGNORECASE)
    if m_x_ge:
        cnt_val = int(m_x_ge.group(1))
        return [ConditionExpression(
            condition_type=ConditionType.COUNT_COMPARISON,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="both",
                scope=[Zone.BATTLE],
                target_type="card",
            ),
            operator=">=",
            value=cnt_val,
        )]

    # 6. Negated presence checks: 'unless <entity> is in play / in battle / activated'.
    m_unless = re.match(r'^unless\s+(.+?)\s+is\s+(in\s+play|in\s+battle|activated)$', clean, re.IGNORECASE)
    if m_unless:
        ent_str, zone_str = m_unless.groups()
        scope_val = [Zone.BATTLE] if "battle" in zone_str.lower() else [Zone.IN_PLAY]
        sel = _build_protection_entity_selector(ent_str, default_scope=scope_val, default_owner="both")
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=sel,
            operator="==",
            value=0,
        )]

    # 7. Controller ownership checks: 'if you control/have / holder has <entity> [in play]'.
    m_ctrl = re.match(
        r'^if\s+(?:you\s+control|you\s+have|holder\s+has)\s+(.+?)(?:\s+in\s+play)?$',
        clean,
        re.IGNORECASE,
    )
    if m_ctrl:
        ent_str = m_ctrl.group(1).strip()
        sel = _build_protection_entity_selector(ent_str, default_scope=[Zone.IN_PLAY], default_owner="controller")
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=sel,
            operator=">=",
            value=1,
        )]

    # 8. Opponent battle checks: 'if opposed by / blocking <entity>'.
    m_opp_by = re.match(r'^if\s+(?:opposed\s+by|blocking)\s+(.+)$', clean, re.IGNORECASE)
    if m_opp_by:
        sel = _build_protection_entity_selector(
            m_opp_by.group(1), default_scope=[Zone.BATTLE], default_owner="opponent"
        )
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=sel,
            operator=">=",
            value=1,
        )]

    # 9. Special battle/state clauses that need exact selector/fact preservation.
    if low == "if the only hero in battle is samuel or a judge with no special ability":
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="both",
                scope=[Zone.BATTLE],
                target_type="hero",
                alignment="good",
                identifiers=["Judge", "with no special ability"],
                card_titles=["Samuel"],
            ),
            operator=">=",
            value=1,
        )]

    if low == "if the only cards in territory are lost souls":
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="controller",
                scope=[Zone.TERRITORY],
                target_type="lost_soul",
            ),
            operator=">=",
            value=1,
        )]

    if low == "if a male and female hero are set aside by this ability":
        return [
            ConditionExpression(
                condition_type=ConditionType.ZONE_CHECK,
                selector=TargetSelector(
                    selection_mode=SelectionMode.AUTOMATIC_ALL,
                    zone_owner="controller",
                    scope=[Zone.SET_ASIDE],
                    target_type="hero",
                    alignment="good",
                    gender="male",
                ),
                operator=">=",
                value=1,
            ),
            ConditionExpression(
                condition_type=ConditionType.ZONE_CHECK,
                selector=TargetSelector(
                    selection_mode=SelectionMode.AUTOMATIC_ALL,
                    zone_owner="controller",
                    scope=[Zone.SET_ASIDE],
                    target_type="hero",
                    alignment="good",
                    gender="female",
                ),
                operator=">=",
                value=1,
            ),
        ]

    if low == "if that human is multi-brigade":
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="both",
                scope=[Zone.BATTLE],
                target_type="character",
                is_human=True,
                brigades=["Multi"],
            ),
            operator="==",
        )]

    if low == "if it is a multi-brigade or dual icon card":
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_SELF,
                zone_owner="controller",
                scope=[Zone.BATTLE],
                target_type="card",
                brigades=["Multi"],
                identifiers=["dual icon"],
            ),
            operator="==",
        )]

    if re.match(r'^if\s+opponent\s+(?:has\s+)?used\s+a\s+(?:draw\s+or\s+)?search\s+ability\s+this\s+turn$', low):
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                zone_owner="opponent",
                scope=[Zone.IN_PLAY],
                target_type="card",
                identifiers=["used search ability this turn"],
            ),
            operator=">=",
            value=1,
        )]

    if low in ("if played in battle", "during the battle phase"):
        extra = ["battle phase"] if "phase" in low else []
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_SELF,
                zone_owner="controller",
                scope=[Zone.BATTLE],
                target_type="card",
                identifiers=extra,
            ),
            operator="==",
        )]

    if low == "if equipped":
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_SELF,
                zone_owner="controller",
                scope=[Zone.IN_PLAY],
                target_type="card",
                identifiers=["equipped"],
            ),
            operator="==",
        )]

    # 10. General presence check: 'if <entity> is/are in play / in battle / active / in ... discard pile'.
    m_zone_state = re.match(
        r'^if\s+(.+?)\s+(?:is|are)\s+'
        r'(in\s+play|in\s+battle|active|in\s+your\s+discard\s+pile|in\s+opponent\'s\s+discard\s+pile)$',
        clean,
        re.IGNORECASE,
    )
    if m_zone_state:
        subj_str, state_str = m_zone_state.groups()
        state_low = state_str.lower()
        scope_val: List[Zone] = [Zone.IN_PLAY]
        owner_val: Literal["controller", "opponent", "both", "either"] = "both"
        if "battle" in state_low:
            scope_val = [Zone.BATTLE]
        elif "your discard" in state_low:
            scope_val = [Zone.DISCARD_PILE]
            owner_val = "controller"
        elif "opponent's discard" in state_low:
            scope_val = [Zone.DISCARD_PILE]
            owner_val = "opponent"
        sel = _build_protection_entity_selector(subj_str, default_scope=scope_val, default_owner=owner_val)
        return [ConditionExpression(
            condition_type=ConditionType.ZONE_CHECK,
            selector=sel,
            operator=">=",
            value=1,
        )]

    # 11. Fallback condition preserving text as zone_check identifier so no condition is dropped.
    fallback_body = re.sub(r'^(?:if|while|unless|when|during|except)\s+', '', clean, flags=re.IGNORECASE).strip()
    return [ConditionExpression(
        condition_type=ConditionType.ZONE_CHECK,
        selector=TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner="both",
            scope=[Zone.IN_PLAY],
            target_type="card",
            identifiers=[fallback_body or clean],
        ),
        operator="==",
    )]


def build_conditional_protection_ability(
    prot_phrase: str,
    cond_phrase: str,
    ab_index: int = 2,
    is_star: bool = False,
) -> Ability:
    """Constructs a static gated Ability representing a conditional protection clause.

    Args:
        prot_phrase: Protection verb group (e.g. 'negated', 'interrupted or prevented').
        cond_phrase: Condition/actor tail (e.g. 'if used by a prophet', 'by an evil card').
        ab_index: 1-based ability index used in the deterministic ability_id.
        is_star: Whether this clause belongs to a STAR ability side.

    Returns:
        Validated static Ability with gated ConditionExpressions and empty effects.
    """
    prot_low = prot_phrase.lower()
    mod_types: List[ModifierType] = []
    if "negat" in prot_low:
        mod_types.append(ModifierType.CANNOT_BE_NEGATED)
    if "interrupt" in prot_low:
        mod_types.append(ModifierType.CANNOT_BE_INTERRUPTED)
    if "prevent" in prot_low:
        mod_types.append(ModifierType.CANNOT_BE_PREVENTED)

    conditions = parse_protection_condition_clause(cond_phrase)
    suffix = "_and_".join(m.value for m in mod_types)
    return Ability(
        ability_id=f"{'star_' if is_star else ''}ab_{ab_index}_{suffix}",
        is_star=is_star,
        activation_mode=ActivationMode.STATIC,
        is_optional=False,
        is_negatable=True,
        is_interruptible=True,
        is_preventable=True,
        trigger_event="star_phase" if is_star else None,
        conditions=conditions,
        costs=[],
        effects=[],
        modifiers=[Modifier(modifier_type=m, applies_to="this_side") for m in mod_types],
    )


def extract_conditional_protection_abilities(
    text: str,
    start_idx: int = 2,
    is_star: bool = False,
) -> Tuple[str, List[Ability]]:
    """Extracts conditional 'Cannot be ...' sentences into dedicated static Abilities.

    Masks O.T./N.T. abbreviations before sentence matching so periods inside testaments
    do not truncate 'by an O.T. Hero.' clauses.

    Args:
        text: Raw or partially cleaned card ability text.
        start_idx: Starting index for generated static protection ability IDs.
        is_star: Whether extracted abilities come from a STAR ability.

    Returns:
        Tuple of (remaining_text_with_abbreviations_restored, extracted_static_abilities).
    """
    masked = protect_abbreviations(text)
    extracted: List[Ability] = []
    matches = list(CONDITIONAL_PROTECTION_SENTENCE_RE.finditer(masked))
    for offset, match in enumerate(matches):
        prot_phrase = match.group(2)
        cond_phrase = match.group(3)
        extracted.append(
            build_conditional_protection_ability(
                prot_phrase=prot_phrase,
                cond_phrase=cond_phrase,
                ab_index=start_idx + offset,
                is_star=is_star,
            )
        )

    cleaned = CONDITIONAL_PROTECTION_SENTENCE_RE.sub("", masked)
    cleaned = re.sub(r'[.;]\s*[.;]+', '.', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(" .;")
    return restore_abbreviations(cleaned), extracted




