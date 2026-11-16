"""Target parsing and classification utilities for Redemption CCG abilities.

Handles REG v11.1.0 compliant multi-zone extraction, owner resolution,
plural-to-all semantics, and strict 4-way target attribute separation
(brigades, canonical target_type, identifiers, and card_titles).
"""

from __future__ import annotations
import re
from typing import Dict, List, Optional, Tuple, Literal

from models.enums.zone import Zone
from models.enums.selection_mode import SelectionMode
from models.enums.brigade import ALL_BRIGADES
from models.enums.action_verb import ActionVerb
from models.logic.target_selector import TargetSelector
from models.logic.protection_filter import ProtectionFilter
from models.logic.dynamic_value import DynamicValue

# Preposition-guarded multi-zone pattern.
# Note: 'reserve' is only matched when governed by a locative preposition (from/in/into/on/of/beneath)
# or followed by 'pile', and NEVER when followed by an object determiner/target word.
_ZONE_ATOM = (
    r"(?:artifact\s+pile|discard\s+pile|reserve\s+pile|draw\s+pile|card\s+pile|"
    r"set-aside\s+area|set\s+aside\s+area|set-aside|set\s+aside|"
    r"land\s+of\s+bondage|land\s+of\s+redemption|"
    r"field\s+of\s+battle|current\s+battle|this\s+battle|battle|"
    r"field\s+of\s+play|play|"
    r"territories|territory|hands|hand|decks|deck|reserves|"
    r"discard(?!\s+(?:a|an|the|your|their|all|one|two|three|x|any|good|evil|this|that|it|cards?|characters?|heroes?|enhancements?|artifacts?|sites?|fortresses?|lost\s+souls?)\b)|"
    r"reserve(?!\s+(?:a|an|the|your|their|all|one|two|three|x|any|good|evil|this|that|it|cards?|characters?|heroes?|enhancements?|artifacts?|sites?|fortresses?|lost\s+souls?)\b))"
)

MULTI_ZONE_SUFFIX_PATTERN = re.compile(
    rf"(?:\s+|^)\b(not\s+in|from|in|into|on|of|beneath)\s+"
    rf"(each\s+opponent's|opponent's|opponents'|opponent|your|own|holder's|their|owner's|"
    rf"one\s+player's|a\s+player's|each\s+player's|each|other|the|a|an)?\s*"
    rf"({_ZONE_ATOM}(?:\s*(?:,\s*|\s+or\s+|\s+and\s+)(?:in\s+|from\s+)?(?:a\s+|an\s+|the\s+|your\s+|opponent's\s+)?{_ZONE_ATOM})*)\b",
    re.IGNORECASE,
)
ZONE_SUFFIX_PATTERN = MULTI_ZONE_SUFFIX_PATTERN

# Unparsed compound clause guard: if a target string still contains an embedded action clause,
# multi-entity conjunction, non-exception parenthetical, or relative clause,
# deterministic single-target parsing must reject it so compound/AI parsers handle it.
UNPARSED_CLAUSE_GUARD = re.compile(
    r"(?:"
    r"\(\s*(?!except\b)|"
    r",\s*(?:of\s+you\b|or\b|and\b|discard\b|draw\b|take\b|place\b|put\b|reserve\b|topdeck\b|underdeck\b|banish\b|negate\b|interrupt\b|each\b|you\b)|"
    r"\b(?:"
    r"to\s+(?:discard|draw|take|underdeck|topdeck|negate|interrupt|withdraw|protect|prevent|restrict|"
    r"convert|shuffle|release|give|capture|banish|remove|add|play|search|exchange|activate|rescue|heal|band|present|force|toss|copy|attack|choose|territory)\b|"
    r"(?:and|or)\s+(?:you\s+may\s+|holder\s+may\s+|opponent\s+may\s+|each\s+player\s+must\s+|Hero\s+may\s+|character\s+may\s+)?(?:discard|draw|take|underdeck|topdeck|"
    r"negate|interrupt|withdraw|protect|prevent|restrict|convert|shuffle|release|give|capture|banish|"
    r"remove|add|play|search|exchange|activate|rescue|heal|band|present|bounce|return|reveal|look|cause|place|put|choose|paralyze|set\s+aside)\b|"
    r"(?:and|or)\s+(?:an?|one|two|three|both|all|any|other|each|up\s+to|the\s+top|the\s+last|his|her|your|opponent's|opponents'|their|holder's)\b|"
    r"one\s+or\s+both\b|"
    r"for\s+(?:each|\d+\s+turns?)\b|"
    r"\b\d+\s+or\s+(?:more|less)\b|"
    r"\b(?:strength|toughness)\s+\d+\b|"
    r"\bwith\s+\d+\b|"
    r"(?:who|that)\s+(?:fought|was|were|share|do|does|involves?|have|has|you)\b|"
    r"unless|if|while|when|whenever|instead"
    r")\b"
    r")",
    re.IGNORECASE,
)

# Canonical singular and plural target_type mappings
CANONICAL_TYPE_WORDS: List[Tuple[re.Pattern[str], str, bool, Optional[str]]] = [
    # (pattern, canonical_singular_type, is_plural, implied_alignment)
    (re.compile(r"\bevil\s+characters\b", re.I), "evil_character", True, "evil"),
    (re.compile(r"\bevil\s+character(?:\s+cards?)?\b", re.I), "evil_character", False, "evil"),
    (re.compile(r"\blost\s+souls\b", re.I), "lost_soul", True, "neutral"),
    (re.compile(r"\blost\s+soul(?:\s+cards?)?\b", re.I), "lost_soul", False, "neutral"),
    (re.compile(r"\bheroes\b", re.I), "hero", True, "good"),
    (re.compile(r"\bhero(?:\s+cards?)?\b", re.I), "hero", False, "good"),
    (re.compile(r"\bcharacters\b", re.I), "character", True, None),
    (re.compile(r"\bcharacter(?:\s+cards?)?\b", re.I), "character", False, None),
    (re.compile(r"\benhancements(?:\s+cards?)?\b|\benhancement\s+cards\b", re.I), "enhancement", True, None),
    (re.compile(r"\benhancement(?:\s+card)?\b", re.I), "enhancement", False, None),
    (re.compile(r"\bartifacts\b", re.I), "artifact", True, None),
    (re.compile(r"\bartifact(?:\s+cards?)?\b", re.I), "artifact", False, None),
    (re.compile(r"\bfortresses\b", re.I), "fortress", True, None),
    (re.compile(r"\bfortress(?:\s+cards?)?\b", re.I), "fortress", False, None),
    (re.compile(r"\bsites\b", re.I), "site", True, None),
    (re.compile(r"\bsite(?:\s+cards?)?\b", re.I), "site", False, None),
    (re.compile(r"\bcities\b", re.I), "city", True, None),
    (re.compile(r"\bcity\b", re.I), "city", False, None),
    (re.compile(r"\bcovenants\b", re.I), "covenant", True, "good"),
    (re.compile(r"\bcovenant\b", re.I), "covenant", False, "good"),
    (re.compile(r"\bcurses\b", re.I), "curse", True, "evil"),
    (re.compile(r"\bcurse\b", re.I), "curse", False, "evil"),
    (re.compile(r"\bdominants\b", re.I), "dominant", True, None),
    (re.compile(r"\bdominant(?:\s+cards?)?\b", re.I), "dominant", False, None),
    (re.compile(r"\bdemons\b", re.I), "demon", True, "evil"),
    (re.compile(r"\bdemon\b", re.I), "demon", False, "evil"),
    (re.compile(r"\bangels\b", re.I), "angel", True, "good"),
    (re.compile(r"\bangel\b", re.I), "angel", False, "good"),
    (re.compile(r"\bpriests\b", re.I), "priest", True, None),
    (re.compile(r"\bpriest\b", re.I), "priest", False, None),
    (re.compile(r"\bprophets\b", re.I), "prophet", True, None),
    (re.compile(r"\bprophet\b", re.I), "prophet", False, None),
    (re.compile(r"\bkings\b", re.I), "king", True, None),
    (re.compile(r"\bking\b", re.I), "king", False, None),
    (re.compile(r"\bqueens\b", re.I), "queen", True, None),
    (re.compile(r"\bqueen\b", re.I), "queen", False, None),
    (re.compile(r"\bjudges\b", re.I), "judge", True, None),
    (re.compile(r"\bjudge\b", re.I), "judge", False, None),
    (re.compile(r"\bwarriors\b", re.I), "warrior", True, None),
    (re.compile(r"\bwarrior\b", re.I), "warrior", False, None),
    (re.compile(r"\bmusicians\b", re.I), "musician", True, None),
    (re.compile(r"\bmusician\b", re.I), "musician", False, None),
    (re.compile(r"\bhumans\b", re.I), "human", True, None),
    (re.compile(r"\bhuman\b", re.I), "human", False, None),
    (re.compile(r"\banimals\b", re.I), "animal", True, None),
    (re.compile(r"\banimal\b", re.I), "animal", False, None),
    (re.compile(r"\bbeasts\b", re.I), "beast", True, None),
    (re.compile(r"\bbeast\b", re.I), "beast", False, None),
    (re.compile(r"\bgiants\b", re.I), "giant", True, None),
    (re.compile(r"\bgiant\b", re.I), "giant", False, None),
    (re.compile(r"\bcards\b", re.I), "card", True, None),
    (re.compile(r"\bcard\b", re.I), "card", False, None),
]

# Known ORDIR group/trait nouns that stand alone as character/enhancement targets
# (not specific card titles)
STANDALONE_IDENTIFIER_NOUNS: Dict[str, Tuple[str, bool, str]] = {
    "pharisees": ("character", True, "Pharisee"),
    "pharisee": ("character", False, "Pharisee"),
    "sadducees": ("character", True, "Sadducee"),
    "sadducee": ("character", False, "Sadducee"),
    "scribes": ("character", True, "Scribe"),
    "scribe": ("character", False, "Scribe"),
    "canaanites": ("character", True, "Canaanite"),
    "canaanite": ("character", False, "Canaanite"),
    "egyptians": ("character", True, "Egyptian"),
    "egyptian": ("character", False, "Egyptian"),
    "philistines": ("character", True, "Philistine"),
    "philistine": ("character", False, "Philistine"),
    "edomites": ("character", True, "Edomite"),
    "edomite": ("character", False, "Edomite"),
    "assyrians": ("character", True, "Assyrian"),
    "assyrian": ("character", False, "Assyrian"),
    "babylonians": ("character", True, "Babylonian"),
    "babylonian": ("character", False, "Babylonian"),
    "syrians": ("character", True, "Syrian"),
    "syrian": ("character", False, "Syrian"),
    "romans": ("character", True, "Roman"),
    "roman": ("character", False, "Roman"),
    "greeks": ("character", True, "Greek"),
    "greek": ("character", False, "Greek"),
    "israelites": ("character", True, "Israelite"),
    "israelite": ("character", False, "Israelite"),
    "martyrs": ("hero", True, "Martyr"),
    "martyr": ("hero", False, "Martyr"),
    "patriarchs": ("hero", True, "Patriarch"),
    "patriarch": ("hero", False, "Patriarch"),
    "heretics": ("evil_character", True, "Heretic"),
    "heretic": ("evil_character", False, "Heretic"),
    "magicians": ("character", True, "Magician"),
    "magician": ("character", False, "Magician"),
    "disciples": ("hero", True, "Disciple"),
    "disciple": ("hero", False, "Disciple"),
    "apostles": ("hero", True, "Apostle"),
    "apostle": ("hero", False, "Apostle"),
    "weapons": ("enhancement", True, "weapon class"),
    "weapon": ("enhancement", False, "weapon class"),
    "storehouse": ("fortress", False, "Storehouse"),
    "temple": ("artifact", False, "Temple"),
}

# Brigade patterns (sorted longest first so 'Pale Green' and 'Multi-Brigade' match before single words)
_BRIGADE_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bpale\s+green(?:\s+brigade)?\b", re.I), "Pale Green"),
    (re.compile(r"\bmulti-brigade\b|\bmulti\s+brigade\b", re.I), "Multi"),
] + [
    (re.compile(rf"\b{re.escape(b)}(?:\s+brigade)?\b", re.I), b)
    for b in sorted(ALL_BRIGADES - {"Pale Green"}, key=len, reverse=True)
]


def _map_zone_token(token: str) -> Optional[Zone]:
    """Maps a single zone phrase atom to its canonical Zone enum."""
    t = token.strip().lower()
    if "artifact pile" in t:
        return Zone.ARTIFACT_PILE
    if "discard" in t:
        return Zone.DISCARD_PILE
    if "deck" in t or "draw pile" in t or re.search(r"\bcard\s+pile\b", t):
        return Zone.DECK
    if "territory" in t or "territories" in t:
        return Zone.TERRITORY
    if "hand" in t:
        return Zone.HAND
    if "reserve" in t:
        return Zone.RESERVE_PILE
    if "set-aside" in t or "set aside" in t:
        return Zone.SET_ASIDE
    if "bondage" in t:
        return Zone.LAND_OF_BONDAGE
    if "redemption" in t:
        return Zone.LAND_OF_REDEMPTION
    if "battle" in t:
        return Zone.BATTLE
    if "play" in t:
        return Zone.IN_PLAY
    return None


def parse_target_zone_suffix(
    text: str,
) -> Tuple[str, List[Zone], Literal["controller", "opponent", "both", "either"], List[str]]:
    """Extracts trailing or embedded multi-zone descriptions (e.g. 'from deck or Reserve').

    Per REG v11.1.0, if no explicit zone is specified, targets default to [Zone.IN_PLAY],
    and unrestricted targets can belong to 'either' player (or 'both' if 'all').

    Args:
        text: Target text chunk.

    Returns:
        Tuple of (clean_target_text, list_of_Zones, zone_owner, extra_zone_identifiers).
    """
    extra_zone_ids: List[str] = []
    is_all = bool(re.search(r"\ball\b", text, re.IGNORECASE))
    default_owner: Literal["controller", "opponent", "both", "either"] = "both" if is_all else "either"

    m = MULTI_ZONE_SUFFIX_PATTERN.search(text)
    if not m:
        return text.strip(), [Zone.IN_PLAY], default_owner, extra_zone_ids

    prep = m.group(1).lower().strip()
    owner_str = (m.group(2) or "").lower().strip()
    zones_raw = m.group(3).strip()

    if prep.startswith("not in") and "battle" in zones_raw.lower():
        extra_zone_ids.append("not in battle")
        clean_target = MULTI_ZONE_SUFFIX_PATTERN.sub("", text, count=1).strip()
        owner = default_owner
        if "your" in owner_str or "own" in owner_str or "holder" in owner_str:
            owner = "controller"
        elif "opponent" in owner_str:
            owner = "opponent"
        return clean_target, [Zone.TERRITORY], owner, extra_zone_ids

    if "other" in owner_str and "territor" in zones_raw.lower():
        extra_zone_ids.append("other territories")

    # Split compound zone list on ',', 'or', 'and'
    raw_parts = re.split(r"\s*(?:,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+)\s*", zones_raw, flags=re.I)
    scopes: List[Zone] = []
    for part in raw_parts:
        z = _map_zone_token(part)
        if z and z not in scopes:
            scopes.append(z)

    if not scopes:
        scopes = [Zone.IN_PLAY]

    private_zones = {Zone.DECK, Zone.RESERVE_PILE, Zone.HAND, Zone.DISCARD_PILE}
    owner: Literal["controller", "opponent", "both", "either"] = default_owner
    if "opponent" in owner_str:
        owner = "opponent"
    elif owner_str in ("your", "own", "holder's"):
        owner = "controller"
    elif "each player" in owner_str or "both" in owner_str:
        owner = "both"
    elif any(z in private_zones for z in scopes):
        if owner_str in ("a", "an", "either", "any") or re.search(
            r"\b(?:from|in|into|of)\s+(?:a|an|any|either)\s+(?:deck|draw\s+pile|card\s+pile|reserve(?:\s+pile)?|discard(?:\s+pile)?|hand)\b",
            text,
            re.I,
        ):
            owner = "either"
        else:
            owner = "controller"

    clean_target = MULTI_ZONE_SUFFIX_PATTERN.sub("", text, count=1).strip()
    return clean_target, scopes, owner, extra_zone_ids


def parse_target_classification_with_gender(
    target_text: str,
) -> Tuple[Optional[str], Optional[str], List[str], List[str], List[str], bool, Optional[str]]:
    """Separates alignment, gender, brigades, canonical target_type, identifiers, and card_titles.

    Args:
        target_text: Raw or zone-stripped target text (e.g. 'any male Evil Character').

    Returns:
        Tuple of (target_type, alignment, brigades, identifiers, card_titles, is_plural, gender).
    """
    clean = target_text.strip()
    identifiers: List[str] = []
    brigades: List[str] = []
    card_titles: List[str] = []
    gender: Optional[str] = None

    # 1. Extract parenthetical exceptions or qualifiers: e.g. '(except a character)'
    for exc_m in re.finditer(r"\(\s*(except\s+[^\)]+)\s*\)", clean, re.I):
        identifiers.append(exc_m.group(1).strip())
    clean = re.sub(r"\(\s*except\s+[^\)]+\s*\)", "", clean, flags=re.I).strip()

    # Inline 'except ...' at end of clause
    inline_exc = re.search(r"\b(except\s+[a-zA-Z\s\.\-]+)$", clean, re.I)
    if inline_exc:
        identifiers.append(inline_exc.group(1).strip())
        clean = clean[:inline_exc.start()].strip()

    # Strip leading determiners/quantifiers
    clean = re.sub(
        r"^(?:up\s+to\s+(?:\d+|x|one|two|three|four)\s+|(?:an?|the|all|any|one|two|three|four|each|other)\s+)+",
        "",
        clean,
        flags=re.IGNORECASE,
    ).strip()

    # 2. Extract alignment ('good', 'evil', 'neutral')
    alignment: Optional[str] = None
    if re.search(r"\bevil\s+(?:and|or)\s+neutral\b", clean, re.I):
        alignment = "evil"
        identifiers.append("or neutral")
        clean = re.sub(r"\bevil\s+(?:and|or)\s+neutral\b", "", clean, flags=re.I).strip()
    elif re.search(r"\bgood\s+(?:and|or)\s+neutral\b", clean, re.I):
        alignment = "good"
        identifiers.append("or neutral")
        clean = re.sub(r"\bgood\s+(?:and|or)\s+neutral\b", "", clean, flags=re.I).strip()
    else:
        # Preserve 'Evil Character' while extracting standalone 'evil'
        has_evil = bool(re.search(r"\bevil\b", clean, re.I))
        has_good = bool(re.search(r"\bgood\b", clean, re.I))
        has_neutral = bool(re.search(r"\bneutral\b", clean, re.I))
        if has_evil and not has_good:
            alignment = "evil"
            clean = re.sub(r"\bevil\b(?!\s+characters?\b)", "", clean, flags=re.I).strip()
        elif has_good and not has_evil:
            alignment = "good"
            clean = re.sub(r"\bgood\b", "", clean, flags=re.I).strip()
        elif has_neutral:
            alignment = "neutral"
            clean = re.sub(r"\bneutral\b", "", clean, flags=re.I).strip()

    # 3. Extract brigades into target.brigades (never into identifiers)
    for b_pat, b_name in _BRIGADE_PATTERNS:
        if b_pat.search(clean):
            if b_name not in brigades:
                brigades.append(b_name)
            clean = b_pat.sub("", clean).strip()

    # Strip leftover 'or' between multiple extracted brigades (e.g. 'multi-brigade or orange')
    clean = re.sub(r"^(?:or|and)\s+", "", clean, flags=re.I).strip()

    # 4. Extract well-known qualifiers into identifiers (and map gender directly)
    if not re.search(r"\bopposite\s+gender\b", clean, re.I):
        if re.search(r"\bfemale\b", clean, re.I):
            gender = "female"
            clean = re.sub(r"\bfemale\b", "", clean, flags=re.I).strip()
        elif re.search(r"\bmale\b", clean, re.I):
            gender = "male"
            clean = re.sub(r"\bmale\b", "", clean, flags=re.I).strip()

    qualifier_patterns: List[Tuple[re.Pattern[str], str]] = [
        (re.compile(r"\bold\s+testament\b|\bo\.t\.(?=\s|$)", re.I), "O.T."),
        (re.compile(r"\bnew\s+testament\b|\bn\.t\.(?=\s|$)", re.I), "N.T."),
        (re.compile(r"\bnon-humans\b", re.I), "non-humans"),
        (re.compile(r"\bnon-human\b", re.I), "non-human"),
        (re.compile(r"(?<!non-)\bweapon(?:\s+class)?\b", re.I), "weapon class"),
        (re.compile(r"(?<!non-)\bwarrior(?:\s+|-)class\b", re.I), "warrior class"),
        (re.compile(r"\bterritory(?:\s+|-)class\b", re.I), "territory class"),
        (re.compile(r"\bsingle-brigade\b|\bsingle\s+color\b", re.I), "single-brigade"),
        (re.compile(r"\bmeek\b", re.I), "Meek"),
        (re.compile(r"\bunique\b", re.I), "unique"),
        (re.compile(r"\bgeneric\b", re.I), "generic"),
        (re.compile(r"\bactive\b", re.I), "active"),
        (re.compile(r"\bequipped\b", re.I), "equipped"),
        (re.compile(r"\bcaptured\b", re.I), "captured"),
        (re.compile(r"\boccupied\b", re.I), "occupied"),
        (re.compile(r"\bopposing\b", re.I), "opposing"),
        (re.compile(r"\bother\b", re.I), "other"),
        (re.compile(r"\b(?:the\s+)?special\s+abilit(?:y|ies)\s+(?:on|of)\b", re.I), "special abilities"),
        (re.compile(r"\bsearch\s+abilities(?:\s+on)?\b", re.I), "search abilities"),
        (re.compile(r"\bband(?:ing)?\s+abilities(?:\s+on)?\b", re.I), "band abilities"),
        (re.compile(r"\bimmune\s+abilit(?:y|ies)(?:\s+on)?\b", re.I), "immune abilities"),
        (re.compile(r"\bdraw\s+abilities(?:\s+on)?\b", re.I), "draw abilities"),
    ]
    for q_pat, q_label in qualifier_patterns:
        if q_pat.search(clean):
            if q_label not in identifiers:
                identifiers.append(q_label)
            clean = q_pat.sub("", clean).strip()

    # 5. Match primary canonical target_type (and detect plural)
    target_type: Optional[str] = None
    is_plural = False

    # Check compound target types first: e.g. 'Enhancements and other characters', 'Enhancement or Covenant'
    compound_type_match = re.match(
        r"^(enhancements?|characters?|heroes|artifacts?|fortress(?:es)?|sites?)\s+(?:and|or)\s+"
        r"(?:an?\s+|other\s+|good\s+|evil\s+)?(enhancements?|characters?|covenants?|curses?|sites?|set-aside(?:\s+area)?)$",
        clean,
        re.I,
    )
    if compound_type_match:
        first_part, second_part = compound_type_match.group(1), compound_type_match.group(2)
        for pat, c_type, plur, imp_align in CANONICAL_TYPE_WORDS:
            if pat.search(first_part):
                target_type = c_type
                is_plural = plur
                if alignment is None and imp_align:
                    alignment = imp_align
                break
        if "set-aside" not in second_part.lower():
            identifiers.append(f"or {second_part.lower()}")
        clean = ""
    else:
        for pat, c_type, plur, imp_align in CANONICAL_TYPE_WORDS:
            if pat.search(clean):
                target_type = c_type
                is_plural = plur
                if alignment is None and imp_align:
                    alignment = imp_align
                clean = pat.sub("", clean, count=1).strip()
                break

    # Clean up articles/prepositions around remaining words
    clean = re.sub(r"\b(?:currently|now)\b", "", clean, flags=re.I).strip()
    clean = re.sub(r"^(?:an?|the|of|on|in)\s+", "", clean, flags=re.I).strip()
    clean = re.sub(r"\s+", " ", clean).strip(" ,.;:")

    # 6. Classify remaining text into standalone ORDIR identifier vs. proper card_title
    if clean:
        clean_lower = clean.lower()
        if clean_lower in STANDALONE_IDENTIFIER_NOUNS:
            inferred_type, plur, ident_str = STANDALONE_IDENTIFIER_NOUNS[clean_lower]
            if target_type is None:
                target_type = inferred_type
                is_plural = plur
            if ident_str not in identifiers:
                identifiers.append(ident_str)
        elif target_type is not None:
            # Remaining modifier alongside an explicit target_type (e.g. 'Ruth' in 'Ruth Hero', 'Tabernacle' in 'Tabernacle Artifact')
            if clean not in identifiers:
                identifiers.append(clean)
        else:
            # No generic target_type noun present: check if it's an ability-type target (e.g. 'band abilities')
            if clean_lower in ("abilities", "special abilities", "special ability"):
                target_type = "card"
                if "special abilities" not in identifiers:
                    identifiers.append("special abilities")
            else:
                # Specific named card (e.g., 'Samuel', 'Miriam', 'Angry Mob', 'Potter's Field')
                card_titles.append(clean)

    if target_type is None and not card_titles and (brigades or alignment or identifiers or gender):
        target_type = "card"

    return target_type, alignment, brigades, identifiers, card_titles, is_plural, gender


def parse_target_classification(
    target_text: str,
) -> Tuple[Optional[str], Optional[str], List[str], List[str], List[str], bool]:
    """Backwards-compatible wrapper omitting the extracted gender field.

    Args:
        target_text: Raw or zone-stripped target text.

    Returns:
        Tuple of (target_type, alignment, brigades, identifiers, card_titles, is_plural).
    """
    target_type, alignment, brigades, identifiers, card_titles, is_plural, _ = (
        parse_target_classification_with_gender(target_text)
    )
    return target_type, alignment, brigades, identifiers, card_titles, is_plural


def build_target_selector(
    raw_target: str,
    cnt_token: Optional[str] = None,
    limit_val: Optional[int] = None,
    default_scope: Optional[List[Zone]] = None,
    default_owner: Optional[Literal["controller", "opponent", "both", "either"]] = None,
) -> TargetSelector:
    """Builds a validated TargetSelector from a raw target clause.

    Args:
        raw_target: Raw target text snippet (e.g. 'any Crimson Brigade Evil Character in play').
        cnt_token: Optional count string (e.g. '1', '2', 'all', 'any', 'x').
        limit_val: Optional limit integer if a limit clause was present.
        default_scope: Optional fallback scope list when no explicit zone is in raw_target.
        default_owner: Optional fallback zone_owner when no explicit owner is in raw_target.

    Returns:
        Structured TargetSelector instance.
    """
    text = raw_target.strip().rstrip(".")

    # 1. Self-reference check: 'this card', 'this Hero', 'this character', 'this Site', 'this Artifact'
    self_match = re.match(
        r"^this\s+(card|hero|evil\s+character|character|site|fortress|artifact|enhancement)\b$",
        text,
        re.IGNORECASE,
    )
    if self_match:
        kind = self_match.group(1).lower().replace(" ", "_")
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_SELF,
            zone_owner="controller",
            scope=default_scope or [Zone.IN_PLAY],
            target_type=kind,
            count=DynamicValue.from_int(1),
        )

    # 2. Chained target check: 'that Hero', 'that character', 'that card', 'it'
    chained_match = re.match(
        r"^(?:that\s+(card|hero|evil\s+character|character|site|fortress|artifact|enhancement)|it)\b$",
        text,
        re.IGNORECASE,
    )
    if chained_match:
        kind = (chained_match.group(1) or "card").lower().replace(" ", "_")
        return TargetSelector(
            selection_mode=SelectionMode.CHAINED_TARGET,
            zone_owner="either",
            scope=default_scope or [Zone.IN_PLAY],
            target_type=kind if chained_match.group(1) else None,
            ref_step=1,
        )

    # 3. Battle-wide target check: 'the battle', 'current battle', 'battle'
    if re.match(r"^(?:the\s+)?(?:current\s+)?battle$", text, re.IGNORECASE):
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner="both",
            scope=[Zone.BATTLE],
            target_type=None,
            count=None,
        )

    # 4. Top / bottom card of deck check
    top_bottom_match = re.match(
        r"^(?:the\s+)?(top|bottom)\s+(?:(\d+|two|three|four|x)\s+)?cards?(?:\s+of\s+(opponent's|your|own|a|the)?\s*(?:deck|draw\s+pile))?$",
        text,
        re.IGNORECASE,
    )
    if top_bottom_match:
        pos, num_str, owner_tok = top_bottom_match.groups()
        sel = SelectionMode.AUTOMATIC_NEXT if pos.lower() == "top" else SelectionMode.AUTOMATIC_LAST
        owner_val: Literal["controller", "opponent", "both", "either"] = "either"
        if owner_tok and "opponent" in owner_tok.lower():
            owner_val = "opponent"
        elif owner_tok and owner_tok.lower() in ("your", "own"):
            owner_val = "controller"
        cnt_val = DynamicValue.from_int(1)
        if num_str:
            n_low = num_str.lower()
            word_nums = {"two": 2, "three": 3, "four": 4}
            if n_low in word_nums:
                cnt_val = DynamicValue.from_int(word_nums[n_low])
            elif n_low == "x":
                cnt_val = DynamicValue.from_variable("X", limit=limit_val)
            elif n_low.isdigit():
                cnt_val = DynamicValue.from_int(int(n_low))
        return TargetSelector(
            selection_mode=sel,
            zone_owner=owner_val,
            scope=[Zone.DECK],
            target_type="card",
            count=cnt_val,
        )

    # 5. Extract zone suffix(es) and owner
    has_explicit_zone = bool(MULTI_ZONE_SUFFIX_PATTERN.search(text))
    clean_target, scopes, zone_owner, extra_zone_ids = parse_target_zone_suffix(text)
    if not has_explicit_zone and default_scope:
        scopes = list(default_scope)
    if not has_explicit_zone and default_owner and zone_owner == "either":
        zone_owner = default_owner

    # Check leading ownership modifiers in clean_target ('your ...', "opponent's ...", 'opposing ...')
    if re.search(r"^(?:your|own|holder's)\b", clean_target, re.I):
        zone_owner = "controller"
        clean_target = re.sub(r"^(?:your|own|holder's)\s+", "", clean_target, flags=re.I).strip()
    elif re.search(r"^(?:opponent's|opponents'|opposing)\b", clean_target, re.I):
        zone_owner = "opponent"
        clean_target = re.sub(r"^(?:opponent's|opponents')\s+", "", clean_target, flags=re.I).strip()
    elif re.search(r"\bincluding\s+yours\b", clean_target, re.I):
        zone_owner = "both"
        clean_target = re.sub(r"\bincluding\s+yours\b", "", clean_target, flags=re.I).strip()

    # Check special selection modes ('last ... played', 'random ...')
    is_last_played = bool(re.search(r"\blast\b.*?\bplayed\b", clean_target, re.I))
    if is_last_played:
        clean_target = re.sub(r"^(?:the\s+)?last\s+", "", clean_target, flags=re.I)
        clean_target = re.sub(r"\s+played(?:\s+(?:in\s+)?(?:this|current)\s+battle)?$", "", clean_target, flags=re.I).strip()
        if not has_explicit_zone:
            scopes = [Zone.BATTLE]

    is_random = bool(re.search(r"\brandom\b", clean_target, re.I))
    if is_random:
        clean_target = re.sub(r"\brandom\b", "", clean_target, flags=re.I).strip()

    # Check embedded 'up to X' or numeric counts inside clean_target
    embedded_up_to = re.match(r"^up\s+to\s+(\d+|x|one|two|three|four)\s+(.*)$", clean_target, re.I)
    if embedded_up_to:
        cnt_token = f"up to {embedded_up_to.group(1)}"
        clean_target = embedded_up_to.group(2).strip()

    target_type, alignment, brigades, extra_ids, card_titles, is_plural, gender = (
        parse_target_classification_with_gender(clean_target)
    )
    for zid in extra_zone_ids:
        if zid not in extra_ids:
            extra_ids.append(zid)

    # Determine selection_mode and count (preserving plural -> AUTOMATIC_ALL semantics)
    word_to_int = {"one": 1, "a": 1, "an": 1, "any": 1, "two": 2, "three": 3, "four": 4}
    c_clean = (cnt_token or "").lower().strip()
    is_up_to = False
    if c_clean.startswith("up to "):
        is_up_to = True
        c_clean = c_clean.replace("up to ", "").strip()

    has_explicit_count = bool(c_clean and c_clean not in ("", "all"))
    is_all = (
        c_clean == "all"
        or bool(re.search(r"\ball\b", raw_target, re.IGNORECASE))
        or (is_plural and not has_explicit_count)
    )

    if is_last_played:
        sel_mode = SelectionMode.AUTOMATIC_LAST
    elif is_random:
        sel_mode = SelectionMode.RANDOM
    elif is_all:
        sel_mode = SelectionMode.AUTOMATIC_ALL
        if zone_owner == "either":
            zone_owner = "both"
    else:
        sel_mode = SelectionMode.MANUAL_CONTROLLER

    count_obj: Optional[DynamicValue] = None
    if is_all:
        count_obj = None
    elif c_clean == "x":
        count_obj = DynamicValue.from_variable("X", limit=limit_val)
    elif c_clean in word_to_int:
        val = word_to_int[c_clean]
        count_obj = DynamicValue.up_to(val) if is_up_to else DynamicValue.from_int(val)
    elif c_clean.isdigit():
        val = int(c_clean)
        count_obj = DynamicValue.up_to(val) if is_up_to else DynamicValue.from_int(val)
    else:
        count_obj = DynamicValue.from_int(1)

    return TargetSelector(
        selection_mode=sel_mode,
        scope=scopes,
        zone_owner=zone_owner,
        target_type=target_type,
        brigades=brigades,
        alignment=alignment,
        gender=gender,
        identifiers=extra_ids,
        card_titles=card_titles,
        count=count_obj,
    )


_PROTECTION_ACTION_MAP: Dict[str, ActionVerb] = {
    r"\bdiscard\b": ActionVerb.DISCARD,
    r"\bcaptur(?:e|ed|ing)\b": ActionVerb.CAPTURE,
    r"\bconvert(?:ed|ing|s)?\b|\bconversion\b": ActionVerb.CONVERT,
    r"\bremov(?:e|al)\s+from\s+(?:the\s+)?game\b": ActionVerb.REMOVE_FROM_GAME,
    r"\bbanish(?:ed|ing)?\b": ActionVerb.BANISH,
    r"\bnegat(?:e|ed|ing|ion)\b": ActionVerb.NEGATE,
    r"\binterrupt(?:ed|ing)?\b": ActionVerb.INTERRUPT,
    r"\bband(?:ing)?\b": ActionVerb.BAND,
    r"\brescue\b": ActionVerb.RESCUE,
    r"\bdecrease\b": ActionVerb.DECREASE,
    r"\bpoison\b": ActionVerb.POISON,
    r"\bparalyz(?:e|ed|ing)\b": ActionVerb.PARALYZE,
    r"\bside\s+battle\b": ActionVerb.SIDE_BATTLE,
    r"\bwithdraw\b": ActionVerb.WITHDRAW,
}

_TIMING_QUALIFIER_PATTERN = re.compile(
    r"\b(?:the\s+first\s+(?:evil|good)?\s*(?:enhancement|card)?\s*played\s*(?:each|this)\s*(?:battle|turn)|"
    r"the\s+next\s+(?:evil|good)?\s*(?:enhancement|card)?\s*played\s*in\s*battle|"
    r"during\s+battle|each\s+battle|each\s+turn)\b",
    re.IGNORECASE,
)


def parse_protection_filter(from_str: str) -> ProtectionFilter:
    """Parses a protection clause into a structured ProtectionFilter model.

    Separates the protected actions, card sources, harm status, and qualifiers
    from the raw 'from ...' or 'immune to ...' string per Redemption REG v11.1.0.

    Args:
        from_str: The raw clause specifying what is blocked (e.g. 'evil cards',
            'discard and capture abilities', 'lone Heroes and opponents' Dominants',
            'special abilities on evil cards (except discard)', 'harm').

    Returns:
        Structured ProtectionFilter instance.
    """
    clean_str = from_str.strip()
    if not clean_str:
        return ProtectionFilter()

    # 1. Harm check per REG p. 106
    from_harm = bool(re.search(r"\b(?:harm|negative\s+effects?)\b", clean_str, re.IGNORECASE))

    # 2. Extract except clauses (e.g. '(except discard)', 'except capture')
    except_actions: List[ActionVerb] = []
    except_match = re.search(r"\bexcept\s+([^)]+)\)?", clean_str, re.IGNORECASE)
    if except_match:
        ex_text = except_match.group(1).lower()
        for pat, act in _PROTECTION_ACTION_MAP.items():
            if re.search(pat, ex_text):
                if act not in except_actions:
                    except_actions.append(act)

    # 3. Extract actions blocked
    non_except_text = re.sub(r"\bexcept\s+[^)]+\)?", "", clean_str, flags=re.IGNORECASE).lower()
    actions: List[ActionVerb] = []
    for pat, act in _PROTECTION_ACTION_MAP.items():
        if re.search(pat, non_except_text):
            if act not in actions and act not in except_actions:
                actions.append(act)

    # 4. Extract timing/ordering qualifiers
    qualifiers: List[str] = []
    for qm in _TIMING_QUALIFIER_PATTERN.finditer(clean_str):
        qualifiers.append(qm.group(0).strip())

    # 5. Extract card sources
    source_candidates = re.split(r"\s+\band\b\s+|\s*,\s*", clean_str)
    card_sources: List[TargetSelector] = []

    for cand in source_candidates:
        cand_clean = cand.strip()
        cand_clean = re.sub(r"\([^)]*\)", "", cand_clean).strip()
        cand_lower = cand_clean.lower()
        if cand_lower in ("harm", "rescue", "negative effect", "negative effects"):
            continue
        s_eval = re.sub(
            r"\b(?:special\s+abilities|special\s+ability|abilities|ability|effects?)\b",
            "",
            cand_clean,
            flags=re.IGNORECASE,
        )
        for pat in _PROTECTION_ACTION_MAP.keys():
            s_eval = re.sub(pat, "", s_eval, flags=re.IGNORECASE)
        s_eval = re.sub(r"\b(?:harm|negative|on|from|in|to)\b", "", s_eval, flags=re.IGNORECASE).strip()

        has_card_noun = bool(
            re.search(
                r"\b(?:cards?|characters?|heroes?|evil\s+characters?|enhancements?|dominants?|"
                r"demons?|artifacts?|sites?|fortresses?|lost\s+souls?|opponents?|opponent's|"
                r"good|evil|neutral|pale\s+green|crimson|black|brown|grey|gold|green|purple|red|blue|white|silver)\b",
                cand_lower,
            )
        )
        if has_card_noun and len(s_eval) > 1 and s_eval.lower() not in ("cards", "card", "all"):
            owner = "opponent" if re.search(r"\bopponents?'?\b", cand_lower) else "both"
            source_sel = build_target_selector(cand_clean, "all", default_scope=[Zone.IN_PLAY], default_owner=owner)
            if source_sel.selection_mode not in (SelectionMode.AUTOMATIC_SELF, SelectionMode.CHAINED_TARGET):
                source_sel.selection_mode = SelectionMode.AUTOMATIC_ALL
                source_sel.count = None
            clean_source_ids = []
            for sid in source_sel.identifiers:
                sid_low = sid.lower()
                if any(re.search(p, sid_low) for p in _PROTECTION_ACTION_MAP.keys()):
                    continue
                if sid_low in ("abilities", "ability", "special abilities", "special ability", "effects", "effect"):
                    continue
                clean_source_ids.append(sid)
            source_sel.identifiers = clean_source_ids
            card_sources.append(source_sel)

    return ProtectionFilter(
        from_harm=from_harm,
        actions=actions,
        except_actions=except_actions,
        card_sources=card_sources,
        qualifiers=qualifiers,
    )
