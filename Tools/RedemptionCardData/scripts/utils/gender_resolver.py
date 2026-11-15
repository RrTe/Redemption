"""Central 4-tier gender resolver for Redemption character card sides.

Implements ORDIR 7.0.0 gender determination across four structured stages:
1. ORDIR Lists: Closed dual-gender ('both') and genderless ('genderless') sets.
2. Title & Role Keywords: Gendered titles, roles, and creature/group descriptors.
3. Bible Lexicon & Pronouns: Biblical proper names and Reference/pronoun heuristics.
4. Overrides: Explicit exceptions and ORDIR errata from data/mappings/gender_overrides.json.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, FrozenSet, Optional, Set, Tuple

from models.enums.gender import CHARACTER_SIDE_TYPES, GenderType
try:
    from scripts.utils.card_helpers import get_side_field
except ImportError:
    from utils.card_helpers import get_side_field

DEFAULT_OVERRIDES_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "data"
    / "mappings"
    / "gender_overrides.json"
)

# Tier 1: Official ORDIR 7.0.0 Dual-Gender and Genderless closed lists.
ORDIR_DUAL_GENDER_NAMES: FrozenSet[str] = frozenset(
    {
        "amram & jochebed",
        "moses' parents",
    }
)

ORDIR_GENDERLESS_NAMES: FrozenSet[str] = frozenset(
    {
        "boaz' reapers",
        "bride of christ",
        "children",
        "citizens of sychar",
        "every tribe",
        "faithful witness",
        "great multitude",
        "justice seekers",
        "fifth seal, justice seekers",
        "fifth seal (justice seekers)",
        "priests of christ",
        "prophets of gibeath",
        "angry mob",
        "bear",
        "beasts of the earth",
        "complainers",
        "corrupt people",
        "devouring birds",
        "doubt",
        "fire foxes",
        "frog demons",
        "idolaters",
        "impostors",
        "jackals",
        "lions",
        "lions in the den",
        "madness",
        "outsiders",
        "plagued congregation",
        "terror",
        "sixth seal, terror",
        "sixth seal (terror)",
        "the frog demons",
        "the jeering youths",
        "wandering israelites",
        "wayward sheep",
        "wicked community",
        "wicked people",
        "wild animals",
        "wild dogs",
        "children [rr2]",
    }
)

# Tier 2: Title / Role keywords.
FEMALE_KEYWORD_RE = re.compile(
    r"\b("
    r"female|woman|women|noblewoman|noblewomen|queen|queens|widow|widows|"
    r"mother|mothers|sister|sisters|daughter|daughters|wife|wives|"
    r"princess|princesses|damsel|damsels|girl|girls|prophetess|prophetesses|"
    r"harlot|harlots|whore|prostitute|prostitutes|maiden|maidens|maid|maids|"
    r"maidservant|maidservants|handmaid|handmaids|concubine|concubines|bride|"
    r"midwife|midwives|shepherdess|deaconess|matriarch|empress|"
    r"sorceress|witch|lady|virgin|virgins|heroine|goddess|heifer"
    r")\b",
    re.IGNORECASE,
)

MALE_KEYWORD_RE = re.compile(
    r"\b("
    r"male|man|men|boy|boys|lad|king|kings|priest|priests|prince|princes|son|sons|"
    r"father|fathers|brother|brothers|husband|pharaoh|emperor|caesar|herod|pilate|"
    r"governor|governors|captain|captains|centurion|commander|commanders|general|"
    r"soldier|soldiers|warrior|warriors|archer|archers|knight|spearman|spearmen|"
    r"guardsman|swordsman|horseman|horsemen|charioteer|charioteers|"
    r"duke|lord|master|rabbi|apostle|disciple|disciples|elder|elders|deacon|bishop|patriarch|"
    r"shepherd|shepherds|fisherman|fishermen|carpenter|blacksmith|hunter|farmer|"
    r"vinedresser|magician|magicians|astrologer|astrologers|wiseman|wise men|wisemen|"
    r"sorcerer|necromancer|pharisee|pharisees|sadducee|sadducees|scribe|scribes|"
    r"levite|levites|zealot|nicolaitans|uncle|nephew|grandfather|grandson|"
    r"cupbearer|armorbearer|armor bearer|waiter|baker|butler|eunuch|eunuchs|foreman|foremen|"
    r"prophet|prophets|seer|judge|judges|preacher|evangelist|martyr|heretic|giant|giants|"
    r"demon|demons|devil|satan|lucifer|dragon|beelzebub|apollyon|abaddon|legion|"
    r"thief|robber|murderer|prisoner|jailor|jailer|guard|guards|watchman|watchmen|"
    r"keeper|tax collector|publican|executioner|slayer|destroyer|destroyers|taskmaster|"
    r"avenger|warden|silversmith|ruler|rulers|politician|politicians|officer|officers|"
    r"ambassador|henchman|henchmen|herdsman|herdsmen|philosopher|philosophers|scholar|scholars|"
    r"leader|leaders|teacher|teachers|sailor|sailors|mariner|mariners|worker|workers|"
    r"servant|servants|slave|slaves|helper|kinsman|redeemer|treasurer|paladin|watcher|"
    r"mentor|traveler|tanner|builder|mediums|officiators|spoilers|satraps|prefects|presidents|"
    r"angel|angels|angelic|seraph|cherub|cherubim|archangel|spy|spies|leper|"
    r"lion|lions|beast|beasts|leviathan|behemoth|serpent|serpents|viper|ox|ram|tenders|"
    r"army|forces|camp|garrison|invaders|raiders|captors|officials|delegates|conspirators|"
    r"transgressors|enchanter|wizard|wizards|spirit|spirits|spawn|creature|sheep|moths|locust|"
    r"harbingers|herodian|herodians|chaldeans|moabites|canaanites|egyptians|philistines|"
    r"assyrians|babylonians|syrians|greeks|jews|ninevites|bereans|magi|tartan|rabshakeh|"
    r"rab-saris|outcasts|afflicted|depraved|visitors|friends|hosts|chiefs|throwers|carriers|"
    r"givers|worshipper|overseer|defender|interceder|swift|victorious being|admiral|graven|"
    r"conquer|war|famine|death|samaritan|foreigners|aliens|enemies|adversaries|oppressors|"
    r"mockers|scoffers|persecutors|slanderers|accusers|false witnesses|betrayers|"
    r"follower|guardian|breaker|breakers|keepers|seeker|survivor|kinsmen|messengers|"
    r"merchants|marauders|mercenaries|conquerors|reinforcements|laborers|inhabitants|"
    r"israelites|edomites|gibeonites|squads|scapegoat|animals|swine|withered plant|"
    r"bringer|curious arts|nobleman|people|self|god of this world"
    r")\b",
    re.IGNORECASE,
)

# Tier 3: Biblical proper names lexicon.
FEMALE_BIBLICAL_NAMES: FrozenSet[str] = frozenset(
    {
        "abigail", "abihail", "abishag", "abitail", "achsah", "adah", "ahinoam", "anna",
        "apphia", "asnath", "asenath", "athaliah", "basemath", "bashemath", "bathsheba",
        "bernice", "bilhah", "chloe", "claudia", "damaris", "deborah", "delilah", "dinah",
        "dorcas", "drusilla", "elisabeth", "elizabeth", "ephrath", "esther",
        "eunice", "euodia", "eve", "gomer", "hadassah", "hagar", "hannah", "hephzibah",
        "herodias", "huldah", "iscah", "jael", "jehosheba", "jehoshabeath", "jemima",
        "jezebel", "joanna", "jochebed", "judith", "karen", "keren", "keren-happuch",
        "keturah", "keziah", "leah", "lois", "lo-ruhamah", "lydia", "maacah", "maachah",
        "mahalath", "martha", "mary", "merab", "michal", "milcah", "miriam", "naamah",
        "naomi", "noadiah", "orpha", "orpah", "peninnah", "persis", "phoebe", "prisca",
        "priscilla", "puah", "rachel", "rahab", "rebekah", "rebecca", "rhoda", "rizpah",
        "ruth", "salome", "sapphira", "sarah", "sarai", "shelomith", "shimeath",
        "shiphrah", "shulamite", "susanna", "syntyche", "tabitha", "tahpenes", "tamar",
        "taphath", "tirzah", "tryphaena", "tryphosa", "vashti", "zeresh", "zeruah",
        "zeruiah", "zibiah", "zillah", "zilpah", "zipporah", "helah", "naarah", "azubah",
        "cozbi", "hoglah", "mahlah",
    }
)

MALE_BIBLICAL_NAMES: FrozenSet[str] = frozenset(
    {
        "aaron", "abed-nego", "abednego", "abel", "abiezer", "abihu", "abihud",
        "abimelech", "abiram", "abishai", "abner", "abraham", "abram", "absalom",
        "achaicus", "achan", "achim", "adam", "adino", "adonijah", "agabus", "agur",
        "ahab", "ahaz", "ahaziah", "ahimaaz", "ahimelech", "ahimelek", "ahithophel",
        "ahuzzath", "alexander", "amasai", "amminadab", "amos", "amram", "ananias",
        "andrew", "antiochus", "apollos", "aquila", "archelaus", "archippus", "arioch",
        "aristarchus", "arpachshad", "asa", "asahel", "asaph", "ashpenaz", "azor",
        "balaam", "barabbas", "barak", "barnabas", "bartholomew", "bartimaeus",
        "belshazzar", "benaiah", "bezaleel", "bezalel", "bildad", "boaz", "cain",
        "caleb", "canaan", "chenaniah", "clement", "cornelius", "cyrus", "daniel",
        "darius", "dathan", "david", "demas", "demetrius", "diotrephes", "dodai",
        "doeg", "eber", "eglon", "ehud", "eldad", "eleazar", "elhanan", "eli",
        "eliakim", "eliezer", "elijah", "elimelech", "eliphaz", "elisha", "elishama",
        "eliud", "enoch", "enosh", "epaphras", "epaphroditus", "er", "esau", "ethan",
        "ezekiel", "ezra", "festus", "fortunatus", "gabriel", "gad", "gaius",
        "gamaliel", "gideon", "goliath", "habakkuk", "hadad", "ham", "haman",
        "hananiah", "heldai", "helez", "heman", "hermogenes", "hezekiah", "hezron",
        "hiram", "hosea", "hur", "hushai", "ira", "isaac", "isaiah", "ishbibenob",
        "ishmaiah", "ishmael", "issachar", "ithamar", "ittai", "jaazaniah", "jacob",
        "jadon", "jairus", "james", "japheth", "jared", "jashobeam", "jason",
        "jehoiada", "jehoshaphat", "jehu", "jeiel", "jeremiah", "jeroboam", "jesse",
        "jesus", "jethro", "joab", "joash", "job", "joel", "john", "jonah",
        "jonathan", "joram", "joseph", "joshua", "josiah", "jotham", "judah",
        "judas", "jude", "justus", "kenan", "korah", "laban", "lahmi", "lamech",
        "lazarus", "levi", "lot", "luke", "mahalalel", "maharai", "malachi",
        "malchus", "manasseh", "mark", "matthan", "matthew", "matthias", "medad",
        "melchizedek", "mephibosheth", "meshach", "methuselah", "michael", "moab",
        "mordecai", "moses", "naaman", "nabal", "naharai", "nahor", "nahshon",
        "nebuchadnezzar", "nebushasban", "nebushazban", "nehemiah",
        "nergal-sar-ezer", "nergalsharezer", "nicodemus", "noah", "obed",
        "obed-edom", "oholiab", "onesimus", "onesiphorus", "othniel", "patrick",
        "paul", "peleg", "perez", "peter", "philemon", "philetus", "philip",
        "phygellus", "ram", "reu", "reuben", "samson", "samuel", "saph", "salmon",
        "saul", "secundus", "serug", "seth", "shadrach", "shamgar", "shamhuth",
        "shammah", "shaphat", "shealtiel", "sheba", "shechem", "shelah", "shem",
        "shemaiah", "shimei", "sibbecai", "sibbechai", "silas", "simeon", "simon",
        "sisera", "stephanus", "stephen", "terah", "thaddaeus", "thomas", "timothy",
        "titus", "tubal-cain", "uriah", "uzzah", "zaccheus", "zadok", "zalmon",
        "zebul", "zechariah", "zelek", "zelophehad", "zephaniah", "zerah",
        "zerubbabel", "zophar",
    }
)

# Reference verse cues for non-obvious scriptural passages.
FEMALE_REFERENCE_PREFIXES: Tuple[str, ...] = (
    "revelation 17:",
    "revelation 12:1",
    "proverbs 31:",
    "luke 1:38",
    "luke 1:42",
    "luke 1:46",
    "hosea 4:16",
    "ruth 1:",
    "esther 2:",
    "esther 4:",
    "esther 5:",
    "esther 7:",
)

MALE_REFERENCE_PREFIXES: Tuple[str, ...] = (
    "job 40:",
    "job 41",
    "jonah 1:17",
    "revelation 6:2",
    "revelation 6:4",
    "revelation 6:5",
    "revelation 6:8",
    "i samuel 17:",
    "ii samuel 23:",
    "i chronicles 11:",
    "i chronicles 27:",
)

_FEMALE_PRONOUN_RE = re.compile(r"\b(?:she|her|hers|herself)\b", re.IGNORECASE)
_MALE_PRONOUN_RE = re.compile(r"\b(?:he|him|his|himself)\b", re.IGNORECASE)
_POSSESSIVE_PREFIX_RE = re.compile(r"\b[A-Za-z][A-Za-z\-]*['’]s?\b")
_SET_BRACKET_SUFFIX_RE = re.compile(r"(?:\s*(?:\([^\)]*\)|\[[^\]]*\]))+\s*$")


def _normalize_apostrophes(text: str) -> str:
    """Normalizes typographic apostrophes to ASCII single quotes."""
    return text.replace("’", "'").replace("‘", "'")


def _extract_base_name(card_name: str) -> str:
    """Strips trailing set/printing annotations to recover the base card name.

    Args:
        card_name: Full printed card or side name (e.g. 'Ruth, the Devoted (RoA)').

    Returns:
        Normalized card name with trailing set/bracket tags removed.
    """
    norm = _normalize_apostrophes(card_name.strip())
    base = re.sub(r"\s*\[[^\]]+\]\s*", " ", norm)
    base = re.sub(r"\s*\([^\)]+\)\s*", " ", base)
    return re.sub(r"\s+", " ", base).strip()


def _strip_trailing_tags(card_name: str) -> str:
    """Removes only trailing set tags while preserving inner subtitles like '(Terror)'."""
    norm = _normalize_apostrophes(card_name.strip())
    return _SET_BRACKET_SUFFIX_RE.sub("", norm).strip()


def _clean_identifier(identifier: str) -> str:
    """Removes dynamic X-clauses and bracketed ability notes from card Identifier."""
    cleaned = re.sub(r"\[[^\]]*\]", " ", identifier)
    cleaned = re.sub(r"\bX\s*=.*$", "", cleaned, flags=re.IGNORECASE)
    return _normalize_apostrophes(cleaned).strip()


@lru_cache(maxsize=4)
def load_gender_overrides(path: Path = DEFAULT_OVERRIDES_PATH) -> Dict[str, Dict[str, str]]:
    """Loads gender overrides from JSON if available.

    Args:
        path: Path to the overrides JSON configuration file.

    Returns:
        Dictionary containing 'by_card_id', 'by_set_and_name', and 'by_base_name' maps.
    """
    if not path.exists():
        return {"by_card_id": {}, "by_set_and_name": {}, "by_base_name": {}}
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return {
        "by_card_id": {str(k): str(v) for k, v in (raw.get("by_card_id") or {}).items()},
        "by_set_and_name": {
            _normalize_apostrophes(str(k)).lower(): str(v)
            for k, v in (raw.get("by_set_and_name") or {}).items()
        },
        "by_base_name": {
            _normalize_apostrophes(str(k)).lower(): str(v)
            for k, v in (raw.get("by_base_name") or {}).items()
        },
    }


def _lookup_override(
    card_id: str,
    card_set: str,
    base_name: str,
    full_name: str,
    overrides: Dict[str, Any],
) -> Optional[GenderType]:
    """Looks up explicit Tier 4 override entries in precedence order.

    Args:
        card_id: Card Id string.
        card_set: Card Set string.
        base_name: Stripped card base name.
        full_name: Raw side name.
        overrides: Loaded override mapping dictionary.

    Returns:
        Overridden GenderType if matched, otherwise None.
    """
    by_id = overrides.get("by_card_id") or {}
    if card_id and card_id in by_id:
        return by_id[card_id]  # type: ignore[return-value]

    by_set_name = overrides.get("by_set_and_name") or {}
    set_key = f"{card_set}::{base_name}".lower()
    if card_set and set_key in by_set_name:
        return by_set_name[set_key]  # type: ignore[return-value]

    by_base = overrides.get("by_base_name") or {}
    full_low = _normalize_apostrophes(full_name).strip().lower()
    base_low = base_name.lower()
    if full_low in by_base:
        return by_base[full_low]  # type: ignore[return-value]
    if base_low in by_base:
        return by_base[base_low]  # type: ignore[return-value]
    return None


def _resolve_by_reference_and_pronouns(
    reference: str,
    special_ability: str,
    identifier: str,
) -> Optional[GenderType]:
    """Resolves gender using Scripture Reference heuristics and non-player pronouns.

    Args:
        reference: Card Scripture reference string (e.g. 'Revelation 17:5').
        special_ability: Card side SpecialAbility text.
        identifier: Cleaned card Identifier string.

    Returns:
        'female' or 'male' if heuristic matches, otherwise None.
    """
    ref_low = reference.strip().lower()
    if any(ref_low.startswith(prefix) for prefix in FEMALE_REFERENCE_PREFIXES):
        return "female"
    if any(ref_low.startswith(prefix) for prefix in MALE_REFERENCE_PREFIXES):
        return "male"

    # Strip player/opponent-directed possessive phrases before scanning for pronouns
    # so "opponent discards his hand" does not misclassify female characters.
    sanitized_text = re.sub(
        r"\b(?:opponent(?:'s)?|holder(?:'s)?|owner(?:'s)?|player(?:'s)?|rescuer(?:'s)?)\b[^.;,]*",
        "",
        f"{special_ability} {identifier}",
        flags=re.IGNORECASE,
    )
    sanitized_text = re.sub(r"\bhis/her\b|\bhis\s+or\s+her\b", "", sanitized_text, flags=re.IGNORECASE)

    has_female = bool(_FEMALE_PRONOUN_RE.search(sanitized_text))
    has_male = bool(_MALE_PRONOUN_RE.search(sanitized_text))
    if has_female and not has_male:
        return "female"
    if has_male and not has_female:
        return "male"
    return None


def resolve_gender_with_source(
    card: Dict[str, Any],
    side_name: str = "top",
    overrides: Optional[Dict[str, Any]] = None,
) -> Tuple[GenderType, str]:
    """Resolves a character card side's gender and returns which tier matched.

    Applies explicit overrides (Tier 4 exceptions/errata) first when present,
    followed by Tier 1 (ORDIR Dual-Gender and Genderless lists), Tier 2
    (title/role keywords), Tier 3 (Biblical proper name lexicon and Reference/
    pronoun heuristics), and a conservative ORDIR male default.

    Args:
        card: Full card dictionary from extended card database or raw import.
        side_name: Target side key in CardSides ('top', 'bottom', etc.).
        overrides: Optional custom overrides dictionary for testing.

    Returns:
        Tuple of (resolved_gender, tier_source_label).
    """
    raw_name = get_side_field(card, side_name, "Name") or card.get("Name") or ""
    identifier = str(card.get("Identifier") or "")
    reference = str(card.get("Reference") or "")
    special_ability = str(get_side_field(card, side_name, "SpecialAbility") or "")
    ordir_tags = get_side_field(card, side_name, "ORDIR") or card.get("ORDIR") or []

    card_id = str(card.get("Id") or "").strip()
    card_set = str(card.get("Set") or "").strip()
    base_name = _extract_base_name(raw_name)
    base_low = base_name.lower()
    raw_norm = _normalize_apostrophes(raw_name)
    raw_no_set = _strip_trailing_tags(raw_name).lower()
    cleaned_id = _clean_identifier(identifier)

    # Tier 4 (Explicit exception / errata overrides win when declared).
    active_overrides = overrides if overrides is not None else load_gender_overrides()
    override_hit = _lookup_override(card_id, card_set, base_name, raw_name, active_overrides)
    if override_hit is not None:
        return override_hit, "tier4_override"

    # Tier 1: ORDIR closed Dual-Gender ('both') & Genderless ('genderless') lists.
    if base_low in ORDIR_DUAL_GENDER_NAMES or raw_no_set in ORDIR_DUAL_GENDER_NAMES:
        return "both", "tier1_ordir_both"

    is_the_bear_errata = base_low == "the bear"
    if not is_the_bear_errata:
        if (
            base_low in ORDIR_GENDERLESS_NAMES
            or raw_no_set in ORDIR_GENDERLESS_NAMES
            or re.search(r"\bgenderless\b", cleaned_id, re.IGNORECASE)
        ):
            return "genderless", "tier1_ordir_genderless"

    # Strip possessive prefixes (e.g., "Pharaoh's", "King's") before keyword matching
    # so "King's Daughter" and "Pharaoh's Daughter" classify cleanly as female.
    kw_text = _POSSESSIVE_PREFIX_RE.sub("", f"{raw_norm} {cleaned_id}")
    name_no_poss = _POSSESSIVE_PREFIX_RE.sub("", base_name.lower())
    name_tokens: Set[str] = set(re.findall(r"[a-z'-]+", name_no_poss))

    # Tier 2 (Female titles/roles) & Tier 3 (Female biblical proper names).
    # Checked before generic male role tags (e.g., Prophet/Judge on Deborah, Huldah, Anna).
    if FEMALE_KEYWORD_RE.search(kw_text):
        return "female", "tier2_keyword_female"
    if name_tokens & FEMALE_BIBLICAL_NAMES:
        return "female", "tier3_lexicon_female"

    # Tier 2 (Male titles/roles) & Tier 3 (Male biblical proper names).
    if MALE_KEYWORD_RE.search(kw_text):
        return "male", "tier2_keyword_male"
    if name_tokens & MALE_BIBLICAL_NAMES:
        return "male", "tier3_lexicon_male"

    # Tier 3: Reference & Pronoun heuristic fallback.
    heuristic_hit = _resolve_by_reference_and_pronouns(reference, special_ability, cleaned_id)
    if heuristic_hit is not None:
        return heuristic_hit, "tier3_pronoun_reference"

    # ORDIR defines Genderless and Both as closed lists; remaining unmatched entities default to male.
    return "male", "tier4_default"


def resolve_gender(
    card: Dict[str, Any],
    side_name: str = "top",
    overrides: Optional[Dict[str, Any]] = None,
) -> GenderType:
    """Resolves the canonical gender string for a character card side.

    Args:
        card: Full card dictionary from extended card database or raw import.
        side_name: Target side key in CardSides ('top', 'bottom', etc.).
        overrides: Optional custom overrides dictionary for unit testing.

    Returns:
        One of 'male', 'female', 'both', or 'genderless'.
    """
    gender, _ = resolve_gender_with_source(card, side_name=side_name, overrides=overrides)
    return gender


def _dedupe_shared_fields(sides: Dict[str, Any]) -> Dict[str, Any]:
    """Promotes fields identical across all real sides into a 'shared' dictionary.

    Args:
        sides: Normalized side mapping after per-side enrichment.

    Returns:
        Compact CardSides dictionary with identical fields factored into 'shared'.
    """
    real_sides = {k: v for k, v in sides.items() if k != "shared" and isinstance(v, dict)}
    if len(real_sides) < 2:
        return sides

    all_keys = set().union(*(set(s.keys()) for s in real_sides.values()))
    shared: Dict[str, Any] = {}
    for field in all_keys:
        values = [s.get(field) for s in real_sides.values()]
        if all(v == values[0] and v is not None and v != [] and v != {} for v in values):
            shared[field] = values[0]

    if not shared:
        return real_sides

    result: Dict[str, Any] = {"shared": shared}
    for key, side in real_sides.items():
        remainder = {k: v for k, v in side.items() if k not in shared}
        if remainder:
            result[key] = remainder
    return result


def apply_gender_to_card_sides(
    card: Dict[str, Any],
    overrides: Optional[Dict[str, Any]] = None,
) -> bool:
    """Enriches all character sides in a card's CardSides with resolved Gender.

    Expands any existing 'shared' fields temporarily so dual-sided cards (such as
    Hero/Fortress or Hero/Hero) receive 'Gender' strictly on character sides and
    re-factors shared attributes deterministically.

    Args:
        card: Full card dictionary to update in place.
        overrides: Optional custom overrides dictionary for testing.

    Returns:
        True if at least one character side was updated or set, False otherwise.
    """
    sides = card.get("CardSides")
    if not isinstance(sides, dict) or not sides:
        return False

    shared = sides.get("shared") if isinstance(sides.get("shared"), dict) else {}
    real_keys = [k for k, v in sides.items() if k != "shared" and isinstance(v, dict)]
    if not real_keys:
        return False

    expanded: Dict[str, Dict[str, Any]] = {}
    changed = False
    has_character_side = False

    for sk in real_keys:
        merged = {**shared, **sides[sk]}
        # Strip stale shared/local Gender before re-evaluating side type
        merged.pop("Gender", None)
        expanded[sk] = merged

    original_card_sides = card["CardSides"]
    card["CardSides"] = expanded
    try:
        for sk in real_keys:
            side_type = expanded[sk].get("Type")
            if side_type in CHARACTER_SIDE_TYPES:
                has_character_side = True
                resolved = resolve_gender(card, sk, overrides=overrides)
                prev_val = get_side_field({"CardSides": original_card_sides}, sk, "Gender")
                if prev_val != resolved:
                    changed = True
                expanded[sk]["Gender"] = resolved
    finally:
        if has_character_side:
            card["CardSides"] = _dedupe_shared_fields(expanded)
        else:
            card["CardSides"] = original_card_sides

    return changed
