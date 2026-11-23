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
from models.logic.target_selector import TargetSelector, TargetSelectorBranch
from models.logic.protection_filter import ProtectionFilter
from models.logic.dynamic_value import DynamicValue
try:
    from utils.target_phase5a_helper import promote_phase5a_fields
    from utils.target_phase5b_helper import promote_phase5b_fields
except ImportError:
    from scripts.utils.target_phase5a_helper import promote_phase5a_fields
    from scripts.utils.target_phase5b_helper import promote_phase5b_fields


def _build_selector_with_phase5a(**kwargs: object) -> TargetSelector:
    """Applies Phase 5a and 5b field promotions to selector kwargs before validation."""
    payload = dict(kwargs)
    promote_phase5a_fields(payload)
    promote_phase5b_fields(payload)
    return TargetSelector(**payload)

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
    r"(?:and|or)\s+(?:you\s+may\s+|holder\s+may\s+|opponent\s+may\s+)?reserve\s+(?:a|an|the|this|that|these|those|one|two|three|up\s+to|x|all|any|your|his|her|their)\b|"
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
    "temple": ("city", False, "Temple"),
    "temples": ("city", True, "Temple"),
    "temple artifact": ("artifact", False, "Temple Artifact"),
    "temple artifacts": ("artifact", True, "Temple Artifact"),
    "temple priest": ("character", False, "Temple Priest"),
    "temple priests": ("character", True, "Temple Priest"),
    "tabernacle artifact": ("artifact", False, "Tabernacle Artifact"),
    "tabernacle artifacts": ("artifact", True, "Tabernacle Artifact"),
    "tabernacle priest": ("character", False, "Tabernacle Priest"),
    "tabernacle priests": ("character", True, "Tabernacle Priest"),
    "antediluvians": ("character", True, "Antediluvian"),
    "antediluvian": ("character", False, "Antediluvian"),
    "flood survivors": ("character", True, "Flood Survivor"),
    "flood survivor": ("character", False, "Flood Survivor"),
    "deacons": ("character", True, "Deacon"),
    "deacon": ("character", False, "Deacon"),
    "kings of israel": ("character", True, "King of Israel"),
    "king of israel": ("character", False, "King of Israel"),
    "roman emperors": ("evil_character", True, "Roman Emperor"),
    "roman emperor": ("evil_character", False, "Roman Emperor"),
    "false prophets": ("evil_character", True, "False Prophet"),
    "false prophet": ("evil_character", False, "False Prophet"),
    "idols": ("artifact", True, "Idol"),
    "idol": ("artifact", False, "Idol"),
    "rest": ("card", True, "rest"),
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
    if re.search(r"\b(?:evil|good)\s+(?:and|or)\s+neutral\b", clean, re.I):
        clean = re.sub(r"\b(?:evil|good)\s+(?:and|or)\s+neutral\b", "", clean, flags=re.I).strip()
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
        if re.search(r"\bfemales?\b", clean, re.I):
            gender = "female"
            clean = re.sub(r"\bfemales?\b", "", clean, flags=re.I).strip()
        elif re.search(r"\bmales?\b", clean, re.I):
            gender = "male"
            clean = re.sub(r"\bmales?\b", "", clean, flags=re.I).strip()

    target_type: Optional[str] = None
    is_plural = False

    # ORDIR 7.1.0 canonical title/concept phrase normalization (preserves 'musician'/'music' untouched)
    ordir_patterns: List[Tuple[re.Pattern[str], str, Optional[str], Optional[str]]] = [
        (re.compile(r"\b(?:with\s+)?herod(?:'s\s+name)?\s+in\s+the\s+title\b", re.I), "Herod in the Title", None, None),
        (re.compile(r"\b(?:with\s+)?gideon(?:'s\s+name)?\s+in\s+the\s+title\b", re.I), "Gideon in the Title", None, None),
        (re.compile(r"\b(?:with\s+)?paul(?:'s\s+name)?\s+in\s+the\s+title\b", re.I), "Paul in the Title", None, None),
        (
            re.compile(r"\bdepicting\s+(?:an?\s+)?(?:idol|evil\s+altar|false\s+religious\s+practice)\b", re.I),
            "Idol",
            None,
            None,
        ),
        (re.compile(r"\bevil\s+prophets?\b", re.I), "False Prophet", "evil_character", "evil"),
        (re.compile(r"\bsolomon'?s\s+temple\s+priests?\b", re.I), "Solomon's Temple Priest", "character", None),
        (re.compile(r"\bzerubbabel'?s\s+temple\s+priests?\b", re.I), "Zerubbabel's Temple Priest", "character", None),
        (re.compile(r"\bzerubbabel'?s\s+temple\s+artifacts?\b", re.I), "Zerubbabel's Temple Artifact", "artifact", None),
        (re.compile(r"\bherod'?s\s+temple\s+artifacts?\b", re.I), "Herod's Temple Artifact", "artifact", None),
        (re.compile(r"\bheavenly\s+temple\s+artifacts?\b", re.I), "Heavenly Temple Artifact", "artifact", None),
        (re.compile(r"\btabernacle\s+artifacts?\b", re.I), "Tabernacle Artifact", "artifact", None),
        (re.compile(r"\btabernacle\s+priests?\b", re.I), "Tabernacle Priest", "character", None),
        (re.compile(r"\btemple\s+artifacts?\b", re.I), "Temple Artifact", "artifact", None),
        (re.compile(r"\btemple\s+priests?\b", re.I), "Temple Priest", "character", None),
    ]
    for o_pat, o_label, o_type, o_align in ordir_patterns:
        if o_pat.search(clean):
            if o_label not in identifiers:
                identifiers.append(o_label)
            if o_type and target_type is None:
                target_type = o_type
            if o_align and alignment is None:
                alignment = o_align
            clean = o_pat.sub("", clean).strip()

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
        (re.compile(r"\bgospel\b", re.I), "Gospel"),
        (re.compile(r"\bcloud\b", re.I), "Cloud"),
        (re.compile(r"(?<!non-)\broyalty\b|(?<!non-)\broyal\b", re.I), "Royalty"),
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

    # 5. Match primary canonical target_type (and detect plural) if not already resolved above
    for pat, c_type, plur, imp_align in CANONICAL_TYPE_WORDS:
        if pat.search(clean):
            if target_type is None:
                target_type = c_type
                is_plural = is_plural or plur
            if alignment is None and imp_align:
                alignment = imp_align
            clean = pat.sub("", clean, count=1).strip()
            break

    # Clean up articles/prepositions and stray conjunctions around remaining words
    clean = re.sub(r"\b(?:currently|now)\b", "", clean, flags=re.I).strip()
    clean = re.sub(r"^(?:an?|the|of|on|in)\s+", "", clean, flags=re.I).strip()
    clean = re.sub(r"^(?:or|and)\s+|\s+(?:or|and)$", "", clean, flags=re.I).strip()
    if clean.lower() in ("or", "and"):
        clean = ""
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
        elif re.search(r"\b(?:special\s+)?abilit(?:y|ies)\b", clean_lower):
            if target_type is None:
                target_type = "card"
            norm_ident = (
                "special abilities"
                if clean_lower in ("abilities", "special abilities", "special ability")
                else clean
            )
            if norm_ident not in identifiers:
                identifiers.append(norm_ident)
        elif target_type is not None:
            # Remaining modifier alongside an explicit target_type (e.g. 'Ruth' in 'Ruth Hero', 'Tabernacle' in 'Tabernacle Artifact')
            if clean not in identifiers:
                identifiers.append(clean)
        else:
            # Split unambiguous multi-title lists ('Abiram or Korah', 'Abner, Michal or Doeg')
            title_parts = [
                tp.strip(" ,")
                for tp in re.split(r"\s*,\s*(?:or\s+)?|\s+or\s+", clean)
                if tp.strip(" ,")
            ]
            if len(title_parts) > 1:
                card_titles.extend(title_parts)
            else:
                card_titles.append(clean)

    # Canonicalize known title spacing typos from older card text prints
    card_titles = ["Dragon Raid" if t.lower() == "dragonraid" else t for t in card_titles]

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


def _resolve_count_and_mode(
    raw_target: str,
    cnt_token: Optional[str],
    limit_val: Optional[int],
    zone_owner: Literal["controller", "opponent", "both", "either"],
    is_plural: bool,
    is_last_played: bool = False,
    is_random: bool = False,
) -> Tuple[SelectionMode, Optional[DynamicValue], Literal["controller", "opponent", "both", "either"]]:
    """Computes selection_mode, count, and effective zone_owner for a target selector.

    Args:
        raw_target: Unmodified target clause string.
        cnt_token: Optional extracted count token (e.g. '1', 'all', 'x', 'up to 2').
        limit_val: Optional maximum limit value for dynamic X counts.
        zone_owner: Initial ownership value extracted from zone suffixes.
        is_plural: Whether the parsed target noun(s) are plural.
        is_last_played: Whether the selector targets the last played card.
        is_random: Whether the selector picks randomly.

    Returns:
        Tuple of (SelectionMode, optional DynamicValue count, normalized zone_owner).
    """
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

    return sel_mode, count_obj, zone_owner


def _split_top_level_disjunction(text: str) -> Tuple[List[str], List[str]]:
    """Splits a target phrase on top-level conjunctions outside parentheses and quotes.

    Args:
        text: Target body string without zone suffixes.

    Returns:
        Tuple of (list of split segments, list of lowercase delimiter tokens used).
    """
    segments: List[str] = []
    delims: List[str] = []
    depth = 0
    in_quote: Optional[str] = None
    buf: List[str] = []
    i = 0
    n = len(text)
    sep_pat = re.compile(r"^(?:\s*,\s*(?:and/or|or|and)\s+|\s+(?:and/or|or|and)\s+|\s*,\s+)", re.IGNORECASE)

    while i < n:
        ch = text[i]
        if in_quote:
            buf.append(ch)
            if ch == in_quote:
                in_quote = None
            i += 1
            continue
        if ch in ("'", '"') and (ch == '"' or i == 0 or text[i - 1].isspace()):
            in_quote = ch
            buf.append(ch)
            i += 1
            continue
        if ch == "(":
            depth += 1
            buf.append(ch)
            i += 1
            continue
        if ch == ")" and depth > 0:
            depth -= 1
            buf.append(ch)
            i += 1
            continue
        if depth == 0:
            m = sep_pat.match(text[i:])
            if m:
                seg = "".join(buf).strip()
                if seg:
                    segments.append(seg)
                    delims.append(m.group(0).strip(" ,").lower() or ",")
                    buf = []
                    i += len(m.group(0))
                    continue
        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        segments.append(tail)
    return segments, delims


def _classify_branch_part(
    part_text: str,
) -> Tuple[Optional[str], Optional[str], List[str], List[str], List[str], List[str], List[str], bool, Optional[str]]:
    """Parses one segment of a disjunctive target into classification components.

    Args:
        part_text: Single disjunctive clause fragment (e.g. 'occupied Site', 'warrior').

    Returns:
        Tuple of (target_type, alignment, brigades, classes, references, identifiers, card_titles, is_plural, gender).
    """
    clean_part = re.sub(
        r"^(?:to\s+)?(?:(?:a|an|any|the|all|each|one|other)\s+)+",
        "",
        part_text.strip(),
        flags=re.I,
    ).strip()

    references: List[str] = []
    ref_m = re.search(r"\bwith\s+a\s+reference\s+(?:from|in|to)\s+(.+)$", clean_part, re.I)
    if ref_m:
        references.append(ref_m.group(1).strip())
        clean_part = clean_part[:ref_m.start()].strip()

    # Extract standalone Roman-numeral Bible book names (e.g. 'II Samuel or I Chronicles Hero')
    book_m = re.search(r"\b((?:I|II|III|1|2|3)\s+(?:Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John))\b", clean_part, re.I)
    if book_m and book_m.group(1).strip() not in references:
        references.append(book_m.group(1).strip())
        clean_part = (clean_part[:book_m.start()] + " " + clean_part[book_m.end():]).strip()

    # Handle bare class nouns without 'class' suffix (e.g. 'good warrior or weapon', 'Curses or weapons')
    classes: List[str] = []
    if re.search(r"\bweapons?\b", clean_part, re.I) and not re.search(r"\bweapon(?:\s+|-)class\b", clean_part, re.I):
        is_pl = bool(re.search(r"\bweapons\b", clean_part, re.I))
        stripped = re.sub(r"\bweapons?\b", "", clean_part, flags=re.I).strip()
        tt, al, br, idents, titles, _, gen = parse_target_classification_with_gender(stripped)
        classes.append("Weapon")
        resolved_tt = "enhancement" if tt in (None, "card") else tt
        return resolved_tt, al, br, classes, references, idents, titles, is_pl, gen

    if re.search(r"\bwarriors?\b", clean_part, re.I) and not re.search(r"\bwarrior(?:\s+|-)class\b", clean_part, re.I):
        is_pl = bool(re.search(r"\bwarriors\b", clean_part, re.I))
        stripped = re.sub(r"\bwarriors?\b", "", clean_part, flags=re.I).strip()
        tt, al, br, idents, titles, _, gen = parse_target_classification_with_gender(stripped)
        classes.append("Warrior")
        fallback_tt = "hero" if al == "good" else ("evil_character" if al == "evil" else "character")
        resolved_tt = fallback_tt if tt in (None, "card") else tt
        return resolved_tt, al, br, classes, references, idents, titles, is_pl, gen

    tt, al, br, idents, titles, is_pl, gen = parse_target_classification_with_gender(clean_part)
    if tt == "giant":
        tt = "character"
        if "Giant" not in idents:
            idents = [*idents, "Giant"]
    # Normalize lowercase standalone role identifiers produced alongside or without types
    role_case_map = {
        "beast": "Beast",
        "thief": "Thief",
        "deacon": "Deacon",
        "giant": "Giant",
        "priest": "Priest",
        "prophet": "Prophet",
        "king": "King",
        "demon": "Demon",
        "offering": "Offering",
        "feast": "Feast",
    }
    norm_idents: List[str] = []
    for ident in idents:
        low = ident.lower()
        if low in ("warrior class", "warrior"):
            if "Warrior" not in classes:
                classes.append("Warrior")
        elif low in ("weapon class", "weapon"):
            if "Weapon" not in classes:
                classes.append("Weapon")
        elif low == "territory class":
            if "Territory" not in classes:
                classes.append("Territory")
        else:
            mapped = role_case_map.get(low, ident)
            if mapped not in norm_idents:
                norm_idents.append(mapped)

    return tt, al, br, classes, references, norm_idents, titles, is_pl, gen


def _pop_testament_and_human(idents: List[str]) -> Tuple[List[str], Optional[str], Optional[bool]]:
    """Extracts canonical testament and is_human flags out of an identifier list.

    Args:
        idents: List of identifier strings on a branch or selector.

    Returns:
        Tuple of (remaining_identifiers, optional_testament, optional_is_human).
    """
    remaining: List[str] = []
    testament: Optional[str] = None
    is_human: Optional[bool] = None
    for ident in idents:
        low = ident.strip().lower()
        if low in ("o.t.", "ot", "old testament"):
            testament = "OT"
        elif low in ("n.t.", "nt", "new testament"):
            testament = "NT"
        elif low == "human":
            is_human = True
        elif low in ("non-human", "non-humans"):
            is_human = False
        else:
            remaining.append(ident)
    return remaining, testament, is_human


_ABILITY_VERB_TOKEN = (
    r"heal|resurrect|band|toss|draw|discard|search|look|reveal|capture|convert|"
    r"banish|shuffle|withdraw|release|reserve|protect|prevent|negate|interrupt|"
    r"immune|ignore|exchange|transfer"
)


def _try_build_disjunctive_selector(
    clean_target: str,
    raw_target: str,
    scopes: List[Zone],
    zone_owner: Literal["controller", "opponent", "both", "either"],
    extra_zone_ids: List[str],
    cnt_token: Optional[str],
    limit_val: Optional[int],
    is_last_played: bool,
    is_random: bool,
) -> Optional[TargetSelector]:
    """Detects disjunctive target phrases ('A or B', 'evil or neutral') and builds any_of.

    Args:
        clean_target: Zone- and ownership-stripped target text.
        raw_target: Original target text for plural/all detection.
        scopes: Extracted zone scope list.
        zone_owner: Extracted zone owner.
        extra_zone_ids: Additional zone qualifiers.
        cnt_token: Optional extracted count token.
        limit_val: Optional limit value.
        is_last_played: Whether the selector uses last-played mode.
        is_random: Whether the selector uses random mode.

    Returns:
        Populated TargetSelector (using any_of or collapsed canonical type/card_titles)
        when clean_target is a handled disjunction, otherwise None.
    """
    body = clean_target.strip()

    # Check if an ability prefix wraps a disjunction, e.g. 'search abilities on characters and Enhancements'
    ability_prefix: Optional[str] = None
    ab_pref_m = re.match(
        r"^(?:all\s+)?((?:search|band(?:ing)?|draw|immune|special)\s+abilit(?:y|ies))\s+(?:on|of)\s+(.+)$",
        body,
        re.IGNORECASE,
    )
    if ab_pref_m:
        ability_prefix = ab_pref_m.group(1).strip().lower()
        if ability_prefix in ("abilities", "special ability"):
            ability_prefix = "special abilities"
        body = ab_pref_m.group(2).strip()

    # Extract trailing parenthetical exception that applies outside the split
    trailing_exc: Optional[str] = None
    tr_exc_m = re.search(r"\(\s*(except\s+[^)]+)\s*\)\s*$", body, re.IGNORECASE)
    if tr_exc_m:
        cand_exc = tr_exc_m.group(1).strip()
        prefix_before = body[:tr_exc_m.start()].strip()
        # Only pull out if prefix_before still contains a top-level conjunction
        segs_check, _ = _split_top_level_disjunction(prefix_before)
        if len(segs_check) >= 2:
            trailing_exc = cand_exc
            body = prefix_before

    segments, delims = _split_top_level_disjunction(body)
    if len(segments) < 2:
        return None

    # Do not split comparison thresholds ('toughness X or greater') or conditional clauses ('... or if played ...')
    if any(re.match(r"^(?:greater|less|more|fewer|if|unless|when|while)\b", s, re.I) for s in segments):
        return None

    # Propagate trailing 'abilities' across bare action-verb disjunctions (e.g. 'heal and resurrect abilities')
    if re.match(rf"^(?:{_ABILITY_VERB_TOKEN})\s+abilit(?:y|ies)$", segments[-1], re.I) and all(
        re.match(rf"^(?:{_ABILITY_VERB_TOKEN})$", s, re.I) for s in segments[:-1]
    ):
        segments = [f"{s} abilities" for s in segments[:-1]] + [segments[-1]]

    parsed_parts = [_classify_branch_part(seg) for seg in segments]

    # Guard against splitting multi-word proper card titles containing 'and' (e.g. 'Pitch and Gopher Wood')
    if any(d == "and" for d in delims):
        has_untyped_title_part = any(
            tt is None or (tt == "card" and not al and not br and not cl and not refs and not idents and titles)
            for tt, al, br, cl, refs, idents, titles, _, _ in parsed_parts
        )
        # Allow 'characters (except ...) and N.T. Enhancements', verb abilities, or 'Judas and Sadducees'
        all_recognized = all(
            (tt is not None and not (tt == "card" and not al and not br and not cl and not refs and not idents and titles))
            or bool(refs)
            or bool(titles and len(segments[idx].split()) <= 2 and idx == 0)
            for idx, (tt, al, br, cl, refs, idents, titles, _, _) in enumerate(parsed_parts)
        )
        if has_untyped_title_part and not all_recognized:
            return None

    # Propagate trailing noun from right-most branch to left-hand adjective-only branches
    # (e.g. 'evil or neutral card', 'O.T. green or white Enhancement', 'II Samuel or I Chronicles Hero')
    last_tt, last_al, _, _, _, _, _, last_pl, _ = parsed_parts[-1]
    adj_left_indices: List[int] = []
    for idx in range(len(parsed_parts) - 1):
        tt, al, br, cl, refs, idents, titles, _, _ = parsed_parts[idx]
        if tt in (None, "card") and not titles and (al or br or cl or refs or idents):
            raw_seg = segments[idx].lower()
            if not re.search(r"\bcards?\b", raw_seg):
                adj_left_indices.append(idx)

    if adj_left_indices and (last_tt == "card" or (last_tt and not re.search(r"\bcards?\b", segments[-1], re.I))):
        type_word_m = re.search(
            r"\b(cards?|enhancements?|characters?|heroes|hero|artifacts?|fortress(?:es)?|sites?|dominants?|curses?|covenants?)\b",
            segments[-1],
            re.I,
        )
        if type_word_m:
            shared_testament = [t for t in ("O.T.", "N.T.") if t in parsed_parts[0][5] and t not in parsed_parts[-1][5]]
            for idx in adj_left_indices:
                parsed_parts[idx] = _classify_branch_part(f"{segments[idx]} {type_word_m.group(1)}")
            if shared_testament:
                last_idents = parsed_parts[-1][5] + shared_testament
                p_last = parsed_parts[-1]
                parsed_parts[-1] = (p_last[0], p_last[1], p_last[2], p_last[3], p_last[4], last_idents, p_last[6], p_last[7], p_last[8])

    # Propagate leading shared qualifiers left->right onto bare secondary branches:
    # - 'O.T. red warriors and weapons' -> weapons shares O.T. & Red
    # - 'warrior class II Samuel or I Chronicles Hero' -> right branch shares Warrior class
    p0 = parsed_parts[0]
    p_end = parsed_parts[-1]
    if p0[2] and not p_end[2] and re.search(r"\b(?:weapons?|enhancements?)\b", segments[-1], re.I):
        p_end_idents = list(p_end[5]) + [t for t in ("O.T.", "N.T.") if t in p0[5] and t not in p_end[5]]
        parsed_parts[-1] = (p_end[0], p_end[1], list(p0[2]), p_end[3], p_end[4], p_end_idents, p_end[6], p_end[7], p_end[8])
    if p0[3] and p0[4] and p_end[4] and not p_end[3]:
        parsed_parts[-1] = (p_end[0], p_end[1], p_end[2], list(p0[3]), p_end[4], p_end[5], p_end[6], p_end[7], p_end[8])

    # Propagate explicit non-implicit alignment left->right for bare character/enhancement/curse/covenant types
    first_tt, first_al, *_ = parsed_parts[0]
    first_seg_explicit_align = bool(re.search(r"\b(?:good|evil|neutral)\b", segments[0], re.I)) and not re.search(
        r"\b(?:hero|heroes|evil\s+characters?)\b", segments[0], re.I
    )
    if first_seg_explicit_align and first_al in ("good", "evil"):
        for idx in range(1, len(parsed_parts)):
            tt, al, br, cl, refs, idents, titles, is_pl, gen = parsed_parts[idx]
            if al is None and tt in ("enhancement", "character", "curse", "covenant"):
                parsed_parts[idx] = (tt, first_al, br, cl, refs, idents, titles, is_pl, gen)

    # Propagate right-hand shared character alignment/type (e.g. 'giant or warrior class evil character')
    if parsed_parts[-1][0] in ("evil_character", "hero"):
        r_tt, r_al = parsed_parts[-1][0], parsed_parts[-1][1]
        for idx in range(len(parsed_parts) - 1):
            tt, al, br, cl, refs, idents, titles, is_pl, gen = parsed_parts[idx]
            if (
                tt in (None, "character")
                and al is None
                and not re.search(
                    r"\b(?:good|evil|neutral|character|hero|site|fortress|artifact|enhancement|curse|covenant)\b",
                    segments[idx],
                    re.I,
                )
            ):
                parsed_parts[idx] = (r_tt, r_al, br, cl, refs, idents, titles, is_pl, gen)

    # Handle shared trailing type after title disjunction (e.g. 'DragonRaid or New Jerusalem site')
    p_last = parsed_parts[-1]
    if (
        p_last[0] in ("site", "fortress", "hero", "evil_character", "artifact", "enhancement")
        and not p_last[2]
        and not p_last[3]
        and not p_last[4]
        and not p_last[6]
        and len(p_last[5]) == 1
        and all(bool(p[6]) and not p[5] for p in parsed_parts[:-1])
    ):
        cand_title = p_last[5][0]
        if cand_title.lower() not in STANDALONE_IDENTIFIER_NOUNS and cand_title.lower() not in (
            "occupied",
            "active",
            "generic",
            "unique",
            "single-brigade",
        ):
            parsed_parts[-1] = (p_last[0], p_last[1], p_last[2], p_last[3], p_last[4], [], [cand_title], p_last[7], p_last[8])
            for idx in range(len(parsed_parts) - 1):
                p_prev = parsed_parts[idx]
                if p_prev[0] is None:
                    parsed_parts[idx] = (p_last[0], p_prev[1], p_prev[2], p_prev[3], p_prev[4], p_prev[5], p_prev[6], p_prev[7], p_prev[8])

    # Collapse special cases: pure brigade OR, pure card_titles OR, and plain 'Fortress or Site' -> 'city'
    unique_types = {p[0] for p in parsed_parts}
    unique_aligns = {p[1] for p in parsed_parts}
    unique_classes = {tuple(p[3]) for p in parsed_parts}
    unique_refs = {tuple(p[4]) for p in parsed_parts}
    unique_idents = {tuple(p[5]) for p in parsed_parts}
    unique_genders = {p[8] for p in parsed_parts}
    all_titles_flat = [t for p in parsed_parts for t in p[6]]

    any_plural = any(p[7] for p in parsed_parts) and (
        len(delims) >= 1 and all(p[7] for p in parsed_parts)
    )

    sel_mode, count_obj, eff_owner = _resolve_count_and_mode(
        raw_target, cnt_token, limit_val, zone_owner, any_plural, is_last_played, is_random
    )

    # Attach ability_prefix & scoped trailing_exc cleanly
    parent_idents = list(extra_zone_ids)
    branch_idents_extra: Dict[int, List[str]] = {i: [] for i in range(len(parsed_parts))}
    if trailing_exc:
        exc_low = trailing_exc.lower()
        matched_branch: Optional[int] = None
        if "this ability" not in exc_low and "this special ability" not in exc_low and "this card" not in exc_low:
            for idx, (tt, *_) in enumerate(parsed_parts):
                if tt == "enhancement" and "enhancement" in exc_low and unique_types != {"enhancement"}:
                    matched_branch = idx
                    break
        if matched_branch is not None:
            branch_idents_extra[matched_branch].append(trailing_exc)
        else:
            parent_idents.append(trailing_exc)

    # 1) Pure brigade OR on same card type (e.g. 'O.T. green or white Enhancement')
    if (
        len(unique_types) == 1
        and len(unique_aligns) == 1
        and len(unique_classes) == 1
        and len(unique_refs) == 1
        and len(unique_idents) == 1
        and len(unique_genders) == 1
        and not all_titles_flat
        and all(p[2] for p in parsed_parts)
    ):
        merged_brigades: List[str] = []
        for p in parsed_parts:
            for b in p[2]:
                if b not in merged_brigades:
                    merged_brigades.append(b)
        b_idents = list(next(iter(unique_idents)))
        if ability_prefix and ability_prefix not in b_idents:
            b_idents.append(ability_prefix)
        for zid in parent_idents:
            if zid not in b_idents:
                b_idents.append(zid)
        b_idents, b_testament, b_human = _pop_testament_and_human(b_idents)
        return _build_selector_with_phase5a(
            selection_mode=sel_mode,
            scope=scopes,
            zone_owner=eff_owner,
            target_type=next(iter(unique_types)),
            brigades=merged_brigades,
            alignment=next(iter(unique_aligns)),
            gender=next(iter(unique_genders)),
            is_human=b_human,
            classes=list(next(iter(unique_classes))),
            testament=b_testament,
            references=list(next(iter(unique_refs))),
            identifiers=b_idents,
            count=count_obj,
        )

    # 2) Pure multi-title OR sharing optional base target_type (e.g. 'DragonRaid or New Jerusalem site')
    if (
        all(bool(p[6]) and not p[2] and not p[3] and not p[4] and not p[5] for p in parsed_parts)
        and len(unique_aligns) == 1
    ):
        shared_tt = last_tt if len(unique_types - {None}) <= 1 else None
        if shared_tt is not None or unique_types == {None}:
            return _build_selector_with_phase5a(
                selection_mode=sel_mode,
                scope=scopes,
                zone_owner=eff_owner,
                target_type=shared_tt,
                alignment=next(iter(unique_aligns)),
                identifiers=parent_idents,
                card_titles=all_titles_flat,
                count=count_obj,
            )

    # 3) Unrestricted 'Fortress or Site' / 'Site or Fortress' -> canonical 'city'
    if (
        unique_types == {"fortress", "site"}
        and len(parsed_parts) == 2
        and unique_aligns == {None}
        and unique_classes == {()}
        and unique_refs == {()}
        and unique_idents == {()}
        and not any(p[2] for p in parsed_parts)
        and not all_titles_flat
        and not ability_prefix
    ):
        return _build_selector_with_phase5a(
            selection_mode=sel_mode,
            scope=scopes,
            zone_owner=eff_owner,
            target_type="city",
            identifiers=parent_idents,
            count=count_obj,
        )

    # General multi-branch TargetSelector with any_of
    branches: List[Dict[str, object]] = []
    for idx, (tt, al, br, cl, refs, idents, titles, _, gen) in enumerate(parsed_parts):
        b_idents = list(idents)
        if ability_prefix and ability_prefix not in b_idents:
            b_idents.append(ability_prefix)
        for ex in branch_idents_extra[idx]:
            if ex not in b_idents:
                b_idents.append(ex)
        b_idents, b_testament, b_human = _pop_testament_and_human(b_idents)
        # Drop redundant 'card' target_type when titles identify exact printed card names
        b_tt = None if (tt == "card" and titles and not b_idents and not br and not cl) else tt
        branch_kwargs: Dict[str, object] = {}
        if b_tt is not None:
            branch_kwargs["target_type"] = b_tt
        if al is not None:
            branch_kwargs["alignment"] = al
        if br:
            branch_kwargs["brigades"] = br
        if gen is not None:
            branch_kwargs["gender"] = gen
        if b_human is not None:
            branch_kwargs["is_human"] = b_human
        if cl:
            branch_kwargs["classes"] = cl
        if b_testament is not None:
            branch_kwargs["testament"] = b_testament
        if refs:
            branch_kwargs["references"] = refs
        if b_idents:
            branch_kwargs["identifiers"] = b_idents
        if titles:
            branch_kwargs["card_titles"] = titles
        promote_phase5a_fields(branch_kwargs, is_branch=True)
        promote_phase5b_fields(branch_kwargs)
        branches.append(branch_kwargs)

    if len(branches) < 2:
        return None

    parent_tt = next(iter(unique_types)) if len(unique_types) == 1 else None
    parent_align = next(iter(unique_aligns)) if len(unique_aligns) == 1 else None
    return _build_selector_with_phase5a(
        selection_mode=sel_mode,
        scope=scopes,
        zone_owner=eff_owner,
        target_type=parent_tt,
        alignment=parent_align,
        identifiers=parent_idents,
        any_of=branches,
        count=count_obj,
    )


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

    # 4b. Bare zone target check: e.g. 'draw pile', 'discard pile', 'your draw pile'
    bare_zone_match = re.match(
        r"^(?:(your|own|holder's|opponent's|opponents'|their|a|the)\s+)?(draw\s+pile|deck|decks|discard\s+pile|reserve\s+pile|reserves|reserve)$",
        text,
        re.IGNORECASE,
    )
    if bare_zone_match:
        z_owner_tok, z_name_tok = bare_zone_match.groups()
        z_mapped = _map_zone_token(z_name_tok) or Zone.DECK
        z_owner: Literal["controller", "opponent", "both", "either"] = "either"
        if z_owner_tok:
            ol = z_owner_tok.lower()
            if ol in ("your", "own", "holder's"):
                z_owner = "controller"
            elif "opponent" in ol:
                z_owner = "opponent"
        return TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner=z_owner,
            scope=[z_mapped],
            target_type="card",
        )

    # 4c. Zone-plus-Storehouse OR check (e.g. "from opponent's deck or Storehouse")
    storehouse_or_m = re.match(
        r"^(.*?)\s+(?:from|in)\s+((?:each\s+opponent's|opponent's|opponents'|your|own|holder's|one\s+player's|a\s+player's|each\s+player's|a|an|the)\s+)?(draw\s+pile|deck|discard\s+pile|hand|reserve(?:\s+pile)?)\s*(?:,\s*)?or\s+storehouse$",
        text,
        re.IGNORECASE,
    )
    if storehouse_or_m:
        body_part, sh_owner_raw, sh_zone_raw = storehouse_or_m.groups()
        primary_zone = _map_zone_token(sh_zone_raw) or Zone.DECK
        sh_owner: Literal["controller", "opponent", "both", "either"] = "either"
        if sh_owner_raw:
            ol = sh_owner_raw.lower()
            if "opponent" in ol:
                sh_owner = "opponent"
            elif any(k in ol for k in ("your", "own", "holder")):
                sh_owner = "controller"
            elif "each player" in ol or "both" in ol:
                sh_owner = "both"
        else:
            sh_owner = default_owner or "controller"
        base_sel = build_target_selector(
            body_part.strip(),
            cnt_token=cnt_token,
            limit_val=limit_val,
            default_scope=[primary_zone],
            default_owner=sh_owner,
        )
        b1_idents = list(base_sel.identifiers)
        b2_idents = b1_idents + (["in Storehouse"] if "in Storehouse" not in b1_idents else [])
        br_shared: Dict[str, object] = {}
        if base_sel.target_type is not None:
            br_shared["target_type"] = base_sel.target_type
        if base_sel.alignment is not None:
            br_shared["alignment"] = base_sel.alignment
        if base_sel.brigades:
            br_shared["brigades"] = list(base_sel.brigades)
        if base_sel.gender is not None:
            br_shared["gender"] = base_sel.gender
        if base_sel.classes:
            br_shared["classes"] = list(base_sel.classes)
        if base_sel.references:
            br_shared["references"] = list(base_sel.references)
        b1_dict: Dict[str, object] = {"scope": [primary_zone], "identifiers": b1_idents, **br_shared}
        b2_dict: Dict[str, object] = {"scope": [Zone.TERRITORY], "identifiers": b2_idents, **br_shared}
        promote_phase5b_fields(b1_dict)
        promote_phase5b_fields(b2_dict)
        return _build_selector_with_phase5a(
            selection_mode=base_sel.selection_mode,
            scope=[primary_zone, Zone.TERRITORY],
            zone_owner=base_sel.zone_owner,
            target_type=base_sel.target_type,
            alignment=base_sel.alignment,
            any_of=[b1_dict, b2_dict],
            count=base_sel.count,
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

    disjunctive = _try_build_disjunctive_selector(
        clean_target=clean_target,
        raw_target=raw_target,
        scopes=scopes,
        zone_owner=zone_owner,
        extra_zone_ids=extra_zone_ids,
        cnt_token=cnt_token,
        limit_val=limit_val,
        is_last_played=is_last_played,
        is_random=is_random,
    )
    if disjunctive is not None:
        return disjunctive

    target_type, alignment, brigades, extra_ids, card_titles, is_plural, gender = (
        parse_target_classification_with_gender(clean_target)
    )
    for zid in extra_zone_ids:
        if zid not in extra_ids:
            extra_ids.append(zid)

    sel_mode, count_obj, zone_owner = _resolve_count_and_mode(
        raw_target, cnt_token, limit_val, zone_owner, is_plural, is_last_played, is_random
    )

    return _build_selector_with_phase5a(
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
    r"\bremov(?:e|al)\s+from\s+(?:the\s+)?game\b": ActionVerb.BANISH,
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
