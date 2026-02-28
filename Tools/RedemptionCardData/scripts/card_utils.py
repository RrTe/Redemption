import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import re
import unicodedata
from mappings.set_alias import SET_ALIAS
from models.enums.print_suffixes import PRINT_SUFFIX_KEYWORDS
from models.enums.brigade import ALL_BRIGADES
from config import LOG_VALIDATION_KEYS

# zentrale Regex-Pattern
BRACKET_PATTERN = re.compile(r"\s*\[[^\]]+\]")
PAREN_PATTERN = re.compile(r"\([^)]+\)")
LOC_COLOR_PATTERN = re.compile(r"\(LoC [^)]+/[^\)]+\)")
MULTISPACE_PATTERN = re.compile(r"\s{2,}")

# zentrale Hilfsfunktionen
def remove_all_brackets(text: str) -> str:
    """Entfernt alle [ ... ]-Zusätze."""
    return BRACKET_PATTERN.sub("", text).strip()

def collapse_spaces(text: str) -> str:
    """Reduziert Mehrfach-Whitespaces auf einen."""
    return MULTISPACE_PATTERN.sub(" ", text).strip()

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return (
        text.replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"')
            .replace("„", '"')
            .replace("–", "-")
            .replace("—", "-")
            .replace("…", "...")
            .replace(",", "")
            .replace("'", "")
            .strip()
    )

def clean_card_name(name):
    return name.strip()

def strip_print_suffix(name):
    name = str(name).strip()
    name = remove_all_brackets(name)
    name = LOC_COLOR_PATTERN.sub("", name).strip()
    matches = PAREN_PATTERN.findall(name)

    for match in matches:
        content = match[1:-1].strip()
        if (
            content in PRINT_SUFFIX_KEYWORDS
            or content in SET_ALIAS
            or content in SET_ALIAS.values()
            or any(content == alias for alias_list in SET_ALIAS.values()
                   if isinstance(alias_list, list) for alias in alias_list)
            or content in ALL_BRIGADES
        ):
            name = name.replace(match, "").strip()
            continue

        parts = re.split(r"[,\s]+", content)
        for part in parts:
            if (
                part in PRINT_SUFFIX_KEYWORDS
                or part in SET_ALIAS
                or part in SET_ALIAS.values()
                or any(part == alias for alias_list in SET_ALIAS.values()
                       if isinstance(alias_list, list) for alias in alias_list)
                or part in ALL_BRIGADES
            ):
                name = name.replace(match, "").strip()
                break

    return collapse_spaces(name)

def extract_set_variants(raw_set):
    raw_set = str(raw_set).strip()
    if raw_set in SET_ALIAS:
        return [raw_set]
    parts = re.split(r"[\/,\s]+", raw_set)
    return [p for p in parts if p]

def _strip_surrounding_quotes(s: str) -> str:
    if not s:
        return s
    s = s.strip()
    QUOTES = ['"', "“", "”", "„"]
    if s and s[0] in QUOTES:
        s = s[1:]
    if s and s[-1] in QUOTES:
        s = s[:-1]
    return s.strip()

def normalize_card_name_for_match(name: str) -> str:
    if not name:
        return ""
    n = normalize(str(name))
    n = _strip_surrounding_quotes(n)
    if n.lower().startswith("the "):
        n = n[4:]
    return collapse_spaces(n)

# Hilfsfunktionen für safe_keys
alias_tokens = set(SET_ALIAS.keys())
for v in SET_ALIAS.values():
    if isinstance(v, list):
        alias_tokens.update(v)
    else:
        alias_tokens.add(v)

def strip_only_set_brackets(name: str) -> str:
    def repl(m):
        content = m.group(1).strip()
        if content in alias_tokens:
            return ""  # entfernen (Set-Code)
        else:
            return f"[{content}]"  # erhalten (Namens-Zusatz)
    return re.sub(r"\[([^\]]+)\]", repl, name).strip()

def safe_keys(name, set_code):
    """
    Baut sichere Match-Schlüssel für (Name, Set).
    - Primär: exakte Variante mit allen Zusätzen.
    - Fallback: Variante ohne optionale Zusätze.
    - Lost Soul Sonderbehandlung:
        * Bibelstelle + Spitzname/Symbol zusammen
        * Nur Bibelstelle (mit und ohne Klammern)
        * Nur Spitzname/Symbol
        * Kombinationen (mit und ohne Klammern)
        * Basisname ohne Zusätze
    """
    name_raw = str(name).strip()
    set_raw = normalize(str(set_code))
    alias = SET_ALIAS.get(set_raw, set_raw)

    # Primär: Name wie geliefert, nur Set-Brackets entfernen
    name_primary = strip_only_set_brackets(name_raw)
    # Fallback: alle Zusätze entfernen
    name_fallback = remove_all_brackets(name_raw)

    # Normalisierung für Vergleich
    name_primary = normalize_card_name_for_match(name_primary)
    name_fallback = normalize_card_name_for_match(name_fallback)

    # Keys mit Set-Alias erzeugen
    def build_keys(n):
        if isinstance(alias, list):
            return [(n, a) for a in alias]
        else:
            return [(n, alias)]

    keys = []
    keys.extend(build_keys(name_primary))
    if name_fallback != name_primary:
        keys.extend(build_keys(name_fallback))

    # Lost Soul Sonderbehandlung
    if name_primary.lower().startswith("lost soul"):
        # Bibelstelle extrahieren
        bible_match = re.search(r"\[([A-Za-z]+\s*\d+:\d+)", name_raw)
        # Spitzname/Symbol extrahieren
        nickname_match = (
            re.search(r"\"([^\"]+)\"", name_raw)
            or re.search(r"[“\"]([^”\"]+)[”\"]", name_raw)
        )

        # Basisname ohne Zusätze
        base = "Lost Soul"

        # 1. Bibelstelle (mit und ohne Klammern)
        if bible_match:
            ref = bible_match.group(1).strip()

            bible_bracket = f"{base} [{ref}]"
            bible_plain = f"{base} {ref}"

            keys.extend(build_keys(normalize_card_name_for_match(bible_bracket)))
            keys.extend(build_keys(normalize_card_name_for_match(bible_plain)))

        # 2. Spitzname
        if nickname_match:
            nick = nickname_match.group(1).strip()

            nick_only = f'{base} "{nick}"'
            keys.extend(build_keys(normalize_card_name_for_match(nick_only)))

        # 3. Kombinationen (auch wenn ORDIR nur eines enthält!)
        if bible_match and nickname_match:
            ref = bible_match.group(1).strip()
            nick = nickname_match.group(1).strip()

            combo_bracket = f'{base} "{nick}" [{ref}]'
            combo_plain = f'{base} "{nick}" {ref}'

            keys.extend(build_keys(normalize_card_name_for_match(combo_bracket)))
            keys.extend(build_keys(normalize_card_name_for_match(combo_plain)))

    if LOG_VALIDATION_KEYS:
        print(f"🔑 safe_keys: input=({repr(name)}, {repr(set_code)}) → "
              f"primary={repr(name_primary)}, fallback={repr(name_fallback)}, "
              f"set_raw={repr(set_raw)}, alias={alias}, keys={keys}")

    return keys

