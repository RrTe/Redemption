"""Compositional normalizer and decomposer for TargetSelector fields.

Separates compound target strings into orthogonal TargetSelector buckets:
target_type (canonical CardType only), alignment, brigades, testament ('OT'/'NT'),
references (biblical books and chapter ranges), identifiers (singular ORDIR
subtypes/roles/locations/traits), and card_titles (specific named cards).
"""

from __future__ import annotations
import re
from typing import Any, Dict, List, Optional, Set, Tuple

CANONICAL_BRIGADE_MAP: Dict[str, str] = {
    "white": "White", "gold": "Gold", "red": "Red", "blue": "Blue",
    "green": "Green", "teal": "Teal", "silver": "Silver", "purple": "Purple",
    "clay": "Clay", "multi": "Multi", "multi-brigade": "Multi",
    "multi brigade": "Multi", "brown": "Brown", "gray": "Gray", "grey": "Gray",
    "orange": "Orange", "black": "Black", "crimson": "Crimson",
    "pale green": "Pale Green", "pale_green": "Pale Green", "yellow": "Yellow",
}

UNAMBIGUOUS_CARD_TITLES: Dict[str, str] = {
    "absalom's soldiers": "Absalom's Soldiers",
    "absalom's soldier": "Absalom's Soldiers",
    "gideon's 300": "Gideon's 300",
    "red dragon": "Red Dragon",
    "samuel": "Samuel", "david": "David", "david's harp": "David's Harp",
    "chariots of fire": "Chariots of Fire", "miriam": "Miriam",
    "peter": "Peter", "john": "John", "paul": "Paul", "moses": "Moses",
    "aaron": "Aaron", "elijah": "Elijah", "elisha": "Elisha",
    "solomon": "Solomon", "solomon's temple": "Solomon's Temple",
    "abraham": "Abraham", "isaac": "Isaac", "jacob": "Jacob", "lot": "Lot",
    "jairus' daughter": "Jairus' Daughter", "men of judah": "Men of Judah",
    "coat of mail": "Coat of Mail", "tartaros": "Tartaros",
    "potter's field": "Potter's Field", "haman's plot": "Haman's Plot",
    "wall of protection": "Wall of Protection", "lion's den": "Lion's Den",
    "phinehas, the useless": "Phinehas, the Useless", "confusion": "Confusion",
}

CANONICAL_CARD_TYPES: Set[str] = {
    "card", "character", "hero", "evil_character", "enhancement",
    "artifact", "site", "fortress", "city", "dominant",
    "lost_soul", "covenant", "curse",
}

PLURAL_CARD_TYPE_MAP: Dict[str, Tuple[str, Optional[str]]] = {
    "cards": ("card", None),
    "characters": ("character", None),
    "heroes": ("hero", "good"),
    "evil characters": ("evil_character", "evil"),
    "evil_characters": ("evil_character", "evil"),
    "enhancements": ("enhancement", None),
    "good enhancements": ("enhancement", "good"),
    "evil enhancements": ("enhancement", "evil"),
    "artifacts": ("artifact", None),
    "sites": ("site", None),
    "fortresses": ("fortress", None),
    "dominants": ("dominant", None),
    "lost souls": ("lost_soul", None),
    "lost_souls": ("lost_soul", None),
    "covenants": ("covenant", "good"),
    "curses": ("curse", "evil"),
    "cities": ("city", None),
}

SINGULAR_CARD_TYPE_ALIASES: Dict[str, Tuple[str, Optional[str], Optional[str]]] = {
    "card": ("card", None, None),
    "character": ("character", None, None),
    "hero": ("hero", "good", None),
    "evil character": ("evil_character", "evil", None),
    "evil_character": ("evil_character", "evil", None),
    "enhancement": ("enhancement", None, None),
    "good enhancement": ("enhancement", "good", None),
    "evil enhancement": ("enhancement", "evil", None),
    "ge": ("enhancement", "good", None),
    "ee": ("enhancement", "evil", None),
    "artifact": ("artifact", None, None),
    "site": ("site", None, None),
    "fortress": ("fortress", None, None),
    "dominant": ("dominant", None, None),
    "lost soul": ("lost_soul", None, None),
    "lost_soul": ("lost_soul", None, None),
    "lost sould": ("lost_soul", None, None),
    "covenant": ("covenant", "good", None),
    "curse": ("curse", "evil", None),
    "city": ("city", None, None),
    "hero token": ("hero", "good", "Token"),
    "evil character token": ("evil_character", "evil", "Token"),
    "lost soul token": ("lost_soul", None, "Token"),
}

SUBTYPE_MAP: Dict[str, Tuple[str, str, bool, Optional[str]]] = {
    "angel": ("Angel", "character", False, "good"),
    "angels": ("Angel", "character", True, "good"),
    "demon": ("Demon", "evil_character", False, "evil"),
    "demons": ("Demon", "evil_character", True, "evil"),
    "priest": ("Priest", "character", False, None),
    "priests": ("Priest", "character", True, None),
    "high priest": ("High Priest", "character", False, None),
    "high priests": ("High Priest", "character", True, None),
    "chief priest": ("Chief Priest", "character", False, None),
    "chief priests": ("Chief Priest", "character", True, None),
    "prophet": ("Prophet", "character", False, None),
    "prophets": ("Prophet", "character", True, None),
    "king": ("King", "character", False, None),
    "kings": ("King", "character", True, None),
    "queen": ("Queen", "character", False, None),
    "queens": ("Queen", "character", True, None),
    "judge": ("Judge", "character", False, None),
    "judges": ("Judge", "character", True, None),
    "musician": ("Musician", "character", False, None),
    "musicians": ("Musician", "character", True, None),
    "animal": ("Animal", "character", False, None),
    "animals": ("Animal", "character", True, None),
    "beast": ("Beast", "character", False, None),
    "beasts": ("Beast", "character", True, None),
    "giant": ("Giant", "character", False, None),
    "giants": ("Giant", "character", True, None),
    "egyptian": ("Egyptian", "character", False, None),
    "egyptians": ("Egyptian", "character", True, None),
    "soldier": ("Soldier", "character", False, None),
    "soldiers": ("Soldier", "character", True, None),
    "assyrian": ("Assyrian", "character", False, None),
    "assyrians": ("Assyrian", "character", True, None),
    "babylonian": ("Babylonian", "character", False, None),
    "babylonians": ("Babylonian", "character", True, None),
    "philistine": ("Philistine", "character", False, None),
    "philistines": ("Philistine", "character", True, None),
    "canaanite": ("Canaanite", "character", False, None),
    "canaanites": ("Canaanite", "character", True, None),
    "syrian": ("Syrian", "character", False, None),
    "syrians": ("Syrian", "character", True, None),
    "roman": ("Roman", "character", False, None),
    "romans": ("Roman", "character", True, None),
    "greek": ("Greek", "character", False, None),
    "greeks": ("Greek", "character", True, None),
    "persian": ("Persian", "character", False, None),
    "persians": ("Persian", "character", True, None),
    "mede": ("Mede", "character", False, None),
    "medes": ("Mede", "character", True, None),
    "midianite": ("Midianite", "character", False, None),
    "midianites": ("Midianite", "character", True, None),
    "amalekite": ("Amalekite", "character", False, None),
    "amalekites": ("Amalekite", "character", True, None),
    "moabite": ("Moabite", "character", False, None),
    "moabites": ("Moabite", "character", True, None),
    "edomite": ("Edomite", "character", False, None),
    "edomites": ("Edomite", "character", True, None),
    "israelite": ("Israelite", "character", False, None),
    "israelites": ("Israelite", "character", True, None),
    "hebrew": ("Hebrew", "character", False, None),
    "hebrews": ("Hebrew", "character", True, None),
    "levite": ("Levite", "character", False, None),
    "levites": ("Levite", "character", True, None),
    "samaritan": ("Samaritan", "character", False, None),
    "samaritans": ("Samaritan", "character", True, None),
    "chaldean": ("Chaldean", "character", False, None),
    "chaldeans": ("Chaldean", "character", True, None),
    "patriarch": ("Patriarch", "hero", False, "good"),
    "patriarchs": ("Patriarch", "hero", True, "good"),
    "martyr": ("Martyr", "hero", False, "good"),
    "martyrs": ("Martyr", "hero", True, "good"),
    "disciple": ("Disciple", "character", False, None),
    "disciples": ("Disciple", "character", True, None),
    "apostle": ("Apostle", "hero", False, "good"),
    "apostles": ("Apostle", "hero", True, "good"),
    "pharisee": ("Pharisee", "character", False, None),
    "pharisees": ("Pharisee", "character", True, None),
    "sadducee": ("Sadducee", "character", False, None),
    "sadducees": ("Sadducee", "character", True, None),
    "scribe": ("Scribe", "character", False, None),
    "scribes": ("Scribe", "character", True, None),
    "heretic": ("Heretic", "evil_character", False, "evil"),
    "heretics": ("Heretic", "evil_character", True, "evil"),
    "magician": ("Magician", "character", False, None),
    "magicians": ("Magician", "character", True, None),
    "soothsayer": ("Soothsayer", "character", False, None),
    "soothsayers": ("Soothsayer", "character", True, None),
    "royal": ("Royal", "character", False, None),
    "royals": ("Royal", "character", True, None),
    "royalty": ("Royalty", "character", False, None),
    "missionary": ("Missionary", "hero", False, "good"),
    "missionaries": ("Missionary", "hero", True, "good"),
    "flood survivor": ("Flood Survivor", "character", False, None),
    "flood survivors": ("Flood Survivor", "character", True, None),
    "son of jacob": ("Son of Jacob", "character", False, None),
    "sons of jacob": ("Son of Jacob", "character", True, None),
    "child of jacob": ("Child of Jacob", "character", False, None),
    "children of jacob": ("Child of Jacob", "character", True, None),
    "idol": ("Idol", "artifact", False, None),
    "idols": ("Idol", "artifact", True, None),
}

OFFICIAL_ORDIR_COMPOSITES: Dict[str, Tuple[List[str], str, bool]] = {
    "tabernacle priest": (["Tabernacle Priest"], "character", False),
    "tabernacle priests": (["Tabernacle Priest"], "character", True),
    "tabernacle artifact": (["Tabernacle Artifact"], "artifact", False),
    "tabernacle artifacts": (["Tabernacle Artifact"], "artifact", True),
    "temple priest": (["Temple Priest"], "character", False),
    "temple priests": (["Temple Priest"], "character", True),
    "temple artifact": (["Temple Artifact"], "artifact", False),
    "temple artifacts": (["Temple Artifact"], "artifact", True),
    "solomon's temple priest": (["Solomon's Temple Priest"], "character", False),
    "solomon's temple priests": (["Solomon's Temple Priest"], "character", True),
    "zerubbabel's temple priest": (["Zerubbabel's Temple Priest"], "character", False),
    "zerubbabel's temple artifact": (["Zerubbabel's Temple Artifact"], "artifact", False),
    "zerubbabel's temple high priest": (["Zerubbabel's Temple Priest", "High Priest"], "character", False),
    "herod's temple artifact": (["Herod's Temple Artifact"], "artifact", False),
    "herod's temple site": (["Herod's Temple"], "site", False),
    "heavenly temple artifact": (["Heavenly Temple Artifact"], "artifact", False),
    "priestly artifact": (["Priestly Artifact"], "artifact", False),
    "priestly artifacts": (["Priestly Artifact"], "artifact", True),
    "canaanite site": (["Canaanite Site"], "site", False),
    "canaanite sites": (["Canaanite Site"], "site", True),
    "egyptian site": (["Egyptian Site"], "site", False),
    "egyptian sites": (["Egyptian Site"], "site", True),
    "babylonian site": (["Babylonian Site"], "site", False),
    "babylonian sites": (["Babylonian Site"], "site", True),
    "house of eleazar priest": (["House of Eleazar", "Priest"], "character", False),
    "gospel angel": (["Gospel", "Angel"], "character", False),
    "gospel fortress": (["Gospel"], "fortress", False),
    "gospel hero": (["Gospel"], "hero", False),
    "corinth hero": (["Corinth"], "hero", False),
    "ephesus hero": (["Ephesus"], "hero", False),
}

CANONICAL_BOOKS: Dict[str, str] = {
    "genesis": "Genesis", "exodus": "Exodus", "leviticus": "Leviticus",
    "numbers": "Numbers", "deuteronomy": "Deuteronomy", "joshua": "Joshua",
    "judges": "Judges", "ruth": "Ruth", "1 samuel": "I Samuel", "i samuel": "I Samuel",
    "2 samuel": "II Samuel", "ii samuel": "II Samuel", "1 kings": "I Kings",
    "i kings": "I Kings", "2 kings": "II Kings", "ii kings": "II Kings",
    "1 chronicles": "I Chronicles", "i chronicles": "I Chronicles",
    "2 chronicles": "II Chronicles", "ii chronicles": "II Chronicles",
    "ezra": "Ezra", "nehemiah": "Nehemiah", "esther": "Esther", "job": "Job",
    "psalm": "Psalms", "psalms": "Psalms", "proverbs": "Proverbs",
    "ecclesiastes": "Ecclesiastes", "isaiah": "Isaiah", "jeremiah": "Jeremiah",
    "lamentations": "Lamentations", "ezekiel": "Ezekiel", "daniel": "Daniel",
    "hosea": "Hosea", "joel": "Joel", "amos": "Amos", "obadiah": "Obadiah",
    "jonah": "Jonah", "micah": "Micah", "nahum": "Nahum", "habakkuk": "Habakkuk",
    "zephaniah": "Zephaniah", "haggai": "Haggai", "zechariah": "Zechariah",
    "malachi": "Malachi", "matthew": "Matthew", "mark": "Mark", "luke": "Luke",
    "john": "John", "acts": "Acts", "romans": "Romans",
    "1 corinthians": "I Corinthians", "i corinthians": "I Corinthians",
    "2 corinthians": "II Corinthians", "ii corinthians": "II Corinthians",
    "galatians": "Galatians", "ephesians": "Ephesians", "philippians": "Philippians",
    "colossians": "Colossians", "1 thessalonians": "I Thessalonians",
    "i thessalonians": "I Thessalonians", "2 thessalonians": "II Thessalonians",
    "ii thessalonians": "II Thessalonians", "1 timothy": "I Timothy",
    "i timothy": "I Timothy", "2 timothy": "II Timothy", "ii timothy": "II Timothy",
    "titus": "Titus", "philemon": "Philemon", "hebrews": "Hebrews",
    "james": "James", "1 peter": "I Peter", "i peter": "I Peter",
    "2 peter": "II Peter", "ii peter": "II Peter", "1 john": "I John",
    "i john": "I John", "2 john": "II John", "ii john": "II John",
    "3 john": "III John", "iii john": "III John", "jude": "Jude",
    "revelation": "Revelation",
}

NON_PERSON_BOOKS: Set[str] = {
    "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "judges",
    "1 samuel", "i samuel", "2 samuel", "ii samuel", "1 kings", "i kings",
    "2 kings", "ii kings", "1 chronicles", "i chronicles", "2 chronicles",
    "ii chronicles", "psalm", "psalms", "proverbs", "ecclesiastes",
    "lamentations", "acts", "romans", "1 corinthians", "i corinthians",
    "2 corinthians", "ii corinthians", "galatians", "ephesians", "philippians",
    "colossians", "1 thessalonians", "i thessalonians", "2 thessalonians",
    "ii thessalonians", "1 timothy", "i timothy", "2 timothy", "ii timothy",
    "hebrews", "1 peter", "i peter", "2 peter", "ii peter", "1 john", "i john",
    "2 john", "ii john", "3 john", "iii john", "revelation",
}

_BOOK_KEYS_SORTED = sorted(CANONICAL_BOOKS.keys(), key=len, reverse=True)
_BOOK_PATTERN_STR = "|".join(re.escape(k) for k in _BOOK_KEYS_SORTED)
BOOK_CITATION_RE = re.compile(
    rf"^(?:with\s+(?:a|an)\s+)?(?:reference\s+from\s+)?({_BOOK_PATTERN_STR})"
    rf"(?:\s+(\d+(?:\s*[:\-–]\s*\d+(?:\s*[-–]\s*\d+)?)?(?:\s+through\s+(?:{_BOOK_PATTERN_STR})\s+\d+)?))?"
    rf"(?:\s+reference)?$",
    re.IGNORECASE,
)

GENDER_MAP: Dict[str, str] = {
    "male": "male",
    "female": "female",
}

GENERIC_MAP: Dict[str, bool] = {
    "generic": True,
    "unique": False,
}

HUMAN_MAP: Dict[str, Tuple[bool, bool, str]] = {
    "human": (True, False, "character"),
    "humans": (True, True, "character"),
    "non-human": (False, False, "character"),
    "non-humans": (False, True, "character"),
}

CLASS_MAP: Dict[str, Tuple[str, Optional[str], bool]] = {
    "warrior": ("Warrior", "character", False),
    "warriors": ("Warrior", "character", True),
    "warrior class": ("Warrior", None, False),
    "warrior-class": ("Warrior", None, False),
    "weapon": ("Weapon", "enhancement", False),
    "weapons": ("Weapon", "enhancement", True),
    "weapon class": ("Weapon", None, False),
    "weapon-class": ("Weapon", None, False),
    "depicting a weapon": ("Weapon", "enhancement", False),
    "depicting weapons": ("Weapon", "enhancement", True),
    "illustration depicting a weapon": ("Weapon", "enhancement", False),
    "territory class": ("Territory", None, False),
    "territory-class": ("Territory", None, False),
}

QUALIFIER_TRAITS: Dict[str, str] = {
    "meek": "Meek",
    "lone": "lone",
    "single-brigade": "single-brigade",
    "gospel": "Gospel",
    "nativity": "Nativity", "cloud": "Cloud", "wilderness": "wilderness",
    "tabernacle": "Tabernacle", "temple": "Temple",
}


def normalize_book_citation(text: str) -> Optional[List[str]]:
    """Parses a single or compound biblical book/chapter citation into canonical reference strings.

    Args:
        text: Raw identifier string (e.g. 'Genesis 12-24', 'reference from 1 Chronicles', 'Exodus or Leviticus').

    Returns:
        List of canonical book/chapter reference strings, or None if not a pure book citation.
    """
    clean = re.sub(r"^(?:with\s+(?:a|an)\s+)?(?:reference\s+from\s+)?", "", text.strip(), flags=re.I)
    clean = re.sub(r"\s+reference$", "", clean, flags=re.I).strip()
    parts = re.split(r"\s+(?:or|and)\s+", clean, flags=re.I)
    out: List[str] = []
    for p in parts:
        m = BOOK_CITATION_RE.match(p.strip())
        if not m:
            return None
        book_raw, chap = m.group(1).lower(), m.group(2)
        canon_book = CANONICAL_BOOKS[book_raw]
        if chap:
            chap_norm = re.sub(r"\s+through\s+[a-z]+\s+", "-", chap.strip(), flags=re.I)
            out.append(f"{canon_book} {chap_norm}")
        else:
            out.append(canon_book)
    return out if out else None


_PROTECTED_IDENT_PREFIXES = (
    "except ", "used by ", "involve", "depict", "connected with", "access to ",
    "special abilities", "special ability", "band abilit", "search abilit",
    "protect abilit", "immune abilit", "draw abilit", "capture abilit",
    "convert abilit", "discard abilit", "played ", "drawn ", "fought ",
    "blocking ", "guarding ", "about to ", "first played", "in ", "on ",
    "at ", "from ", "not in ", "other ", "opposite ", "selected brigade",
    "matching brigade", "different brigade", "non-warrior", "non-weapon",
    "holding weapon", "lamb icon", "skull icon", "bible icon",
    "rescue attempt", "make a rescue", "enter battle",
)


def try_decompose_phrase(
    phrase: str,
    is_from_titles: bool = False,
) -> Optional[Dict[str, Any]]:
    """Attempts all-or-nothing grammatical decomposition of a target phrase.

    Args:
        phrase: Candidate string from identifiers, brigades, or card_titles.
        is_from_titles: True if the phrase originated from card_titles.

    Returns:
        Dict of extracted components if decomposable, or None to keep original string.
    """
    raw = phrase.strip()
    if not raw:
        return None
    low = raw.lower()

    if low in UNAMBIGUOUS_CARD_TITLES:
        return {"card_titles": [UNAMBIGUOUS_CARD_TITLES[low]]}

    if low not in CLASS_MAP and any(low.startswith(p) for p in _PROTECTED_IDENT_PREFIXES):
        if low == "special ability":
            return {"identifiers": ["special abilities"]}
        return None

    # Person-named book alone in card_titles stays a card title (e.g. 'Daniel', 'Ruth', 'Job')
    if is_from_titles and low in CANONICAL_BOOKS and low not in NON_PERSON_BOOKS:
        return None

    # Check if card_titles has '<Testament> <ProperName>' (e.g. 'O.T. Joseph', 'N.T. Saul')
    testament_prefix_m = re.match(
        r"^(o\.?t\.?|n\.?t\.?|old\s+testament|new\s+testament)\s+(.+)$",
        raw,
        flags=re.I,
    )

    res: Dict[str, Any] = {
        "testament": None,
        "gender": None,
        "is_generic": None,
        "is_human": None,
        "classes": [],
        "references": [],
        "brigades": [],
        "alignment": None,
        "target_type": None,
        "identifiers": [],
        "card_titles": [],
        "is_plural": False,
    }

    # Handle conjunction of two valid atomic concepts in identifiers (e.g. 'Pharisees and Sadducees', 'Disciple or Revelation angel')
    if not is_from_titles and re.search(r"\s+(?:and|or)\s+", raw, flags=re.I):
        book_refs = normalize_book_citation(raw)
        if book_refs:
            res["references"] = book_refs
            return res
        # Check '<Book1> or <Book2> <Rest>' (e.g. 'Genesis or Exodus Fortress')
        m_comp_book = re.match(
            rf"^({_BOOK_PATTERN_STR})\s+(?:or|and)\s+({_BOOK_PATTERN_STR})\s+(.+)$",
            raw,
            flags=re.I,
        )
        if m_comp_book:
            b1 = CANONICAL_BOOKS[m_comp_book.group(1).lower()]
            b2 = CANONICAL_BOOKS[m_comp_book.group(2).lower()]
            sub_res = try_decompose_phrase(m_comp_book.group(3), is_from_titles=False)
            if sub_res is not None:
                sub_res["references"] = [b1, b2] + sub_res.get("references", [])
                return sub_res

        conj_parts = [p.strip() for p in re.split(r"\s+(?:and|or)\s+", raw, flags=re.I) if p.strip()]
        if len(conj_parts) == 2:
            p1 = try_decompose_phrase(conj_parts[0], is_from_titles=False)
            p2 = try_decompose_phrase(conj_parts[1], is_from_titles=False)
            if p1 is not None and p2 is not None:
                g1, g2 = p1.get("gender"), p2.get("gender")
                if g1 and g2 and g1 != g2:
                    return None
                ig1, ig2 = p1.get("is_generic"), p2.get("is_generic")
                if ig1 is not None and ig2 is not None and ig1 != ig2:
                    return None
                ih1, ih2 = p1.get("is_human"), p2.get("is_human")
                if ih1 is not None and ih2 is not None and ih1 != ih2:
                    return None
                for k in ("references", "brigades", "classes", "identifiers", "card_titles"):
                    for item in p1.get(k, []) + p2.get(k, []):
                        if item not in res[k]:
                            res[k].append(item)
                res["gender"] = g1 or g2
                res["is_generic"] = ig1 if ig1 is not None else ig2
                res["is_human"] = ih1 if ih1 is not None else ih2
                res["testament"] = p1.get("testament") or p2.get("testament")
                res["alignment"] = p1.get("alignment") or p2.get("alignment")
                t1, t2 = p1.get("target_type"), p2.get("target_type")
                if t1 and t2 and t1 != t2:
                    if {t1, t2} <= {"hero", "evil_character", "character"}:
                        res["target_type"] = "character"
                    else:
                        res["target_type"] = "card"
                else:
                    res["target_type"] = t1 or t2
                res["is_plural"] = bool(p1.get("is_plural") or p2.get("is_plural"))
                return res

    rem = raw
    if re.match(r"^all\s+", rem, flags=re.I):
        res["is_plural"] = True
    rem = re.sub(r"^(?:selected|any|all|or|and|a|an)\s+", "", rem, flags=re.I).strip()

    steps = 0
    while rem:
        steps += 1
        if steps > 10:
            return None
        rem_low = rem.lower()

        # 1. Exact remainder match in OFFICIAL_ORDIR_COMPOSITES
        if rem_low in OFFICIAL_ORDIR_COMPOSITES:
            c_idents, c_type, c_plur = OFFICIAL_ORDIR_COMPOSITES[rem_low]
            res["identifiers"].extend(c_idents)
            res["target_type"] = res["target_type"] or c_type
            res["is_plural"] = res["is_plural"] or c_plur
            rem = ""
            break

        # 2. Pure book citation for entire remainder
        book_refs = normalize_book_citation(rem)
        if book_refs and (not is_from_titles or rem_low in NON_PERSON_BOOKS or steps > 1):
            res["references"].extend(book_refs)
            rem = ""
            break

        # 3. Leading testament token
        m_test = re.match(r"^(o\.?t\.?(?:\s+reference)?|n\.?t\.?(?:\s+reference)?|old\s+testament(?:\s+reference)?|new\s+testament(?:\s+reference)?)(?:\s+|$)(.*)$", rem, flags=re.I)
        if m_test:
            t_tok = m_test.group(1).lower()
            res["testament"] = "OT" if ("o" in t_tok or "old" in t_tok) else "NT"
            rem = m_test.group(2).strip()
            continue

        # 4. Leading multi-word CardType or Subtype or Brigade or Class or Trait
        matched_multi = False
        for dict_obj, kind in (
            (PLURAL_CARD_TYPE_MAP, "plural_type"),
            (SINGULAR_CARD_TYPE_ALIASES, "singular_type"),
            (HUMAN_MAP, "is_human"),
            (CLASS_MAP, "class"),
            (SUBTYPE_MAP, "subtype"),
            (CANONICAL_BRIGADE_MAP, "brigade"),
            (GENDER_MAP, "gender"),
            (GENERIC_MAP, "is_generic"),
            (QUALIFIER_TRAITS, "trait"),
        ):
            for k in sorted(dict_obj.keys(), key=len, reverse=True):
                if re.match(rf"^{re.escape(k)}(?:\s+|$)", rem_low):
                    val = dict_obj[k]
                    if kind == "plural_type":
                        res["target_type"] = val[0]
                        res["alignment"] = res["alignment"] or val[1]
                        res["is_plural"] = True
                    elif kind == "singular_type":
                        res["target_type"] = val[0]
                        res["alignment"] = res["alignment"] or val[1]
                        if val[2]:
                            res["identifiers"].append(val[2])
                    elif kind == "is_human":
                        res["is_human"] = val[0]
                        res["is_plural"] = res["is_plural"] or val[1]
                        res["target_type"] = res["target_type"] or val[2]
                    elif kind == "class":
                        if val[0] not in res["classes"]:
                            res["classes"].append(val[0])
                        if val[1]:
                            res["target_type"] = res["target_type"] or val[1]
                        res["is_plural"] = res["is_plural"] or val[2]
                    elif kind == "subtype":
                        res["identifiers"].append(val[0])
                        res["target_type"] = res["target_type"] or val[1]
                        res["is_plural"] = res["is_plural"] or val[2]
                        res["alignment"] = res["alignment"] or val[3]
                    elif kind == "brigade":
                        res["brigades"].append(val)
                    elif kind == "gender":
                        res["gender"] = val
                    elif kind == "is_generic":
                        res["is_generic"] = val
                    elif kind == "trait":
                        res["identifiers"].append(val)
                    rem = rem[len(k):].strip()
                    matched_multi = True
                    break
            if matched_multi:
                break
        if matched_multi:
            continue

        # 5. Leading alignment token
        m_align = re.match(r"^(good|evil|neutral)(?:\s+|$)(.*)$", rem, flags=re.I)
        if m_align:
            res["alignment"] = m_align.group(1).lower()
            rem = m_align.group(2).strip()
            continue

        # 6. Leading biblical book + optional chapter before remaining type/subtype tokens
        m_book = re.match(
            rf"^({_BOOK_PATTERN_STR})(?:\s+(\d+(?:\s*[:\-–]\s*\d+)?))?\s+(.+)$",
            rem,
            flags=re.I,
        )
        if m_book:
            canon_b = CANONICAL_BOOKS[m_book.group(1).lower()]
            chap_b = m_book.group(2)
            res["references"].append(f"{canon_b} {chap_b}" if chap_b else canon_b)
            rem = m_book.group(3).strip()
            continue

        # Could not consume remainder: check '<Testament> <CardTitle>' fallback
        if is_from_titles and testament_prefix_m:
            t_tok = testament_prefix_m.group(1).lower()
            return {
                "testament": "OT" if ("o" in t_tok or "old" in t_tok) else "NT",
                "gender": None,
                "is_generic": None,
                "is_human": None,
                "classes": [],
                "references": [],
                "brigades": [],
                "alignment": None,
                "target_type": None,
                "identifiers": [],
                "card_titles": [testament_prefix_m.group(2).strip()],
                "is_plural": False,
            }
        return None

    return res

