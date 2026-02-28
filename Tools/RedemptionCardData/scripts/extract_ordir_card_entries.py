import sys
import io
from pathlib import Path
import re
import unicodedata
import json
from collections import defaultdict

# === UTF-8 Ausgabe aktivieren ===
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
CATEGORY_FILE = Path("../mappings/ordir_card_entries.py")
REFERENCE_FILE = Path("../mappings/ordir_reference_entries.py")
CARDDATA_MAPPING_FILE = Path("../mappings/ordir_carddata_mapping.py")
EXTENDED_CARDS = Path("../data/cards_extended.json")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

from mappings.ordir_categories import ORDIR_CATEGORIES
from mappings.set_alias import SET_ALIAS
from mappings.ordir_name_errata import ORDIR_NAME_EXCEPTIONS
from models.enums.print_suffixes import PRINT_SUFFIX_KEYWORDS
from models.enums.brigade import ALL_BRIGADES

category_set = set(ORDIR_CATEGORIES)

# === HELPERS ===
def normalize(text):
    text = unicodedata.normalize("NFKD", text)
    return (
        text.replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"')
            .replace("–", "-")
            .replace("—", "-")
            .replace("…", "...")
            .strip()
    )

def safe_keys(name, set_code):
    name_str = normalize(str(name))
    set_raw = normalize(str(set_code))
    alias = SET_ALIAS.get(set_raw, set_raw)
    if isinstance(alias, list):
        return [(name_str, a) for a in alias]
    else:
        return [(name_str, alias)]

def extract_set_variants(raw_set):
    raw_set = str(raw_set).strip()

    # Schritt 1: Wenn der gesamte String ein Alias ist, direkt zurückgeben
    if raw_set in SET_ALIAS:
        return [raw_set]

    # Schritt 2: Falls nicht, zerlege vorsichtig
    parts = re.split(r"[\/,\s]+", raw_set)
    return [p for p in parts if p]

def clean_card_name(name):
    return name.strip()

def strip_print_suffix(name):
    name = str(name).strip()

    # Entferne eckige Klammern
    name = re.sub(r"\s*\[[^\]]+\]", "", name)

    # Entferne Brigade-Klammern wie (LoC Black/Pale Green)
    name = re.sub(r"\(LoC [^)]+/[^\)]+\)", "", name).strip()

    # Finde alle runden Klammern im Namen
    matches = re.findall(r"\([^)]+\)", name)

    for match in matches:
        content = match[1:-1].strip()

        # Schritt 1: Vollständige Prüfung
        if (
            content in PRINT_SUFFIX_KEYWORDS
            or content in SET_ALIAS
            or content in SET_ALIAS.values()
            or any(content == alias for alias_list in SET_ALIAS.values() if isinstance(alias_list, list) for alias in alias_list)
            or content in ALL_BRIGADES
        ):
            name = name.replace(match, "").strip()
            continue

        # Schritt 2: Zerlege in Teile und prüfe einzeln
        parts = re.split(r"[,\s]+", content)
        for part in parts:
            if (
                part in PRINT_SUFFIX_KEYWORDS
                or part in SET_ALIAS
                or part in SET_ALIAS.values()
                or any(part == alias for alias_list in SET_ALIAS.values() if isinstance(alias_list, list) for alias in alias_list)
                or part in ALL_BRIGADES
            ):
                name = name.replace(match, "").strip()
                break

    # Bereinige doppelte Leerzeichen
    name = re.sub(r"\s{2,}", " ", name)

    return name.strip()

def is_marker(line):
    line = normalize(line.lower())
    return "the following redemption" in line and (
        " are " in line or " is " in line or " from " in line or
        "refer to" in line or "depict" in line or "relate to" in line or
        "represent" in line
    )

def is_reference_marker(line):
    line = normalize(line.lower())
    return any(x in line for x in ["refer to", "relate to"])

def is_bullet(line):
    return bool(re.match(r"^[•·\u2022]", line.strip()))

def extract_cards_from_block(block_lines):
    results = []
    current_line = ""
    for line in block_lines:
        if is_bullet(line):
            if current_line:
                results.extend(parse_card_line(current_line))
            current_line = line
        else:
            current_line += " " + line
    if current_line:
        results.extend(parse_card_line(current_line))
    print("\n🔍 extract_cards_from_block: Ergebnisse")
    for r in results:
        print(f"  → {r}")

    return results

def parse_card_line(line):
    results = []

    # Entferne Bullet-Zeichen und Brigade-Präfixe wie (Good):
    line = re.sub(r"^[•·\u2022]\s*\([^)]+\):\s*", "", line).strip()
    line = re.sub(r"^[•·\u2022]\s*", "", line).strip()

    # Ersetze "and" und Kommas zwischen Karten durch Trenner
    line = re.sub(r"\)\s+and\s+", ")|", line)
    line = re.sub(r"\),\s+", ")|", line)

    # Splitte in einzelne Karten
    parts = line.split("|")

    for part in parts:
        part = part.strip()

        # Entferne eckige Klammern wie [Black/Pale Green]
        part = re.sub(r"\s*\[[^\]]+\]", "", part)

        # Extrahiere Name und Set
        match = re.match(r"(.+?)\s*\(([^)]+)\)\s*$", part)
        if match:
            raw_name = match.group(1).strip()
            raw_sets = match.group(2).replace(" and ", ",")
            sets = [s.strip() for s in raw_sets.split(",") if s.strip()]
            for s in sets:
                results.append((raw_name, s))

    return results


# === PARSE ORDIR ===
category_map = defaultdict(set)
reference_map = defaultdict(set)

i = 0
while i < len(lines):
    line = normalize(lines[i])
    if line in category_set:
        current_category = line
        print(f"\n📘 Neue Kategorie erkannt: {current_category}")
        i += 1
        is_reference = False

        while i < len(lines):
            marker = normalize(lines[i])
            if marker in category_set:
                print(f"🔁 Nächste Kategorie erreicht: {marker} → Kapitelwechsel")
                break

            if is_marker(marker):
                print(f"📍 Marker erkannt: {marker}")
                is_reference = is_reference_marker(marker)
                print(f"   → Marker ist Referenz: {is_reference}")
                i += 1

                # 🧩 NEU: Sammle alle Bullet-Zeilen nach dem Marker
                block_lines = []
                while i < len(lines):
                    line = lines[i]
                    if is_bullet(line):
                        current_line = line
                        i += 1
                        # Sammle Folgezeilen, die zur Bullet gehören
                        while i < len(lines):
                            next_line = lines[i]
                            if re.match(r"^[A-Z]$", next_line.strip()):
                                print(f"⛔ Abschnittsmarker erkannt: {repr(next_line.strip())} → wird nicht angehängt")
                                break
                            if is_bullet(next_line) or is_marker(next_line) or next_line in category_set:
                                break
                            current_line += " " + next_line
                            i += 1
                        block_lines.append(current_line)
                    elif is_marker(line) or line in category_set:
                        break
                    else:
                        i += 1

                print(f"📦 Bullet-Block nach Marker mit {len(block_lines)} Zeilen:")
                for bl in block_lines:
                    print(f"   → {repr(bl)}")

                cards = extract_cards_from_block(block_lines)
                target = reference_map if is_reference else category_map
                for raw_name, raw_set in cards:
                    for key in safe_keys(raw_name, raw_set):
                        print(f"🧩 Zuordnung: {key} → Kategorie: {current_category}")
                        try:
                            target[key].add(current_category)
                        except TypeError as e:
                            print(f" Fehler beim Einfügen in Mapping: {key} -> {e}")

            elif is_bullet(lines[i]):
                # 🧩 NEU: Sammle Bullet-Zeilen direkt unter Kategoriezeile
                block_lines = []
                while i < len(lines):
                    line = lines[i]
                    if is_bullet(line):
                        current_line = line
                        i += 1
                        while i < len(lines):
                            next_line = lines[i]
                            if re.match(r"^[A-Z]$", next_line.strip()):
                                print(f"⛔ Abschnittsmarker erkannt: {repr(next_line.strip())} → wird nicht angehängt")
                                break
                            if is_bullet(next_line) or is_marker(next_line) or next_line in category_set:
                                break
                            current_line += " " + next_line
                            i += 1
                        block_lines.append(current_line)
                    elif is_marker(line) or line in category_set:
                        break
                    else:
                        i += 1

                print(f"📦 Bullet-Block direkt unter Kategorie mit {len(block_lines)} Zeilen:")
                for bl in block_lines:
                    print(f"   → {repr(bl)}")

                cards = extract_cards_from_block(block_lines)
                for raw_name, raw_set in cards:
                    for key in safe_keys(raw_name, raw_set):
                        print(f"🧩 Zuordnung: {key} → Kategorie: {current_category}")
                        try:
                            category_map[key].add(current_category)
                        except TypeError as e:
                            print(f" Fehler beim Einfügen in Mapping: {key} -> {e}")

            else:
                i += 1
    else:
        i += 1

# === WRITE: category_map.py ===
with CATEGORY_FILE.open("w", encoding="utf-8") as f:
    f.write("# ORDIR card-to-category mapping\n")
    f.write("ORDIR_CARD_ENTRIES = {\n")
    for (name, set_code), categories in sorted(category_map.items()):
        cat_list = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    ("{name}", "{set_code}"): [{cat_list}],\n')
    f.write("}\n")

# === WRITE: reference_map.py ===
with REFERENCE_FILE.open("w", encoding="utf-8") as f:
    f.write("# ORDIR reference mapping\n")
    f.write("ORDIR_REFERENCE_ENTRIES = {\n")
    for (name, set_code), categories in sorted(reference_map.items()):
        cat_list = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    ("{name}", "{set_code}"): [{cat_list}],\n')
    f.write("}\n")

# === VALIDIERUNG + WRITE: ordir_carddata_mapping.py ===
try:
    with EXTENDED_CARDS.open(encoding="utf-8") as f:
        extended_cards = json.load(f)["cards"]

    verbose_entries = []

    for idx, card in enumerate(extended_cards):
        raw_name = card.get("Name")
        raw_set = card.get("Set", "")
        rarity = card.get("Rarity", "").strip()
        is_legacy_rare = rarity.lower() == "legacy rare"

        cleaned_name = clean_card_name(raw_name)
        stripped_name = strip_print_suffix(cleaned_name)

        # Name-Errata anwenden
        corrected_name = ORDIR_NAME_EXCEPTIONS.get(stripped_name, stripped_name)

        # Doppelnamen aufsplitten
        name_parts = [corrected_name]
        if "/" in corrected_name:
            name_parts = [part.strip() for part in corrected_name.split("/") if part.strip()]

        set_variants = extract_set_variants(raw_set)
        keys_tested = []
        for part in name_parts:
            for variant in set_variants:
                keys_tested.extend(safe_keys(part, variant))

        # Legacy Rare Spezialregel: zusätzlich (Name, "LR") prüfen
        if is_legacy_rare:
            for part in name_parts:
                keys_tested.append((normalize(part), "LR"))

        found_categories = []
        matched_ordir_set = None

        # Case-insensitive Vergleich für Namen, Set bleibt exakt
        for key in keys_tested:
            for mk in category_map:
                if key[0].lower() == mk[0].lower() and key[1] == mk[1]:
                    found_categories = sorted(category_map[mk])
                    matched_ordir_set = mk[1]
                    break
            if found_categories:
                break

        verbose_entries.append({
            "card_name": raw_name,
            "ordir_name": stripped_name,
            "card_set": raw_set,
            "ordir_set": matched_ordir_set,
            "categories": found_categories
        })

        if not found_categories:
            print(f"\n❌ Nicht gefunden:")
            print(f"  Kartendaten: {repr(raw_name)} [{raw_set}]")
            print(f"  ORDIR-Name:  {repr(stripped_name)}")
            print(f"  Kategorien:  —")
            print(f"  → Geprüfte Schlüssel:")
            for k in keys_tested:
                match_found = any(k[0].lower() == mk[0].lower() and k[1] == mk[1] for mk in category_map)
                print(f"     - {repr(k)} {'✅' if match_found else '❌'}")
#                if not match_found:
#                    print("       → Vergleich mit Mapping-Schlüsseln:")
#                    for mk in category_map:
#                        name_match = k[0].lower() == mk[0].lower()
#                        set_match = k[1] == mk[1]
#                        print(f"         - Mapping Key: {repr(mk)}")
#                        print(f"           → Name gleich: {name_match} ({repr(k[0])} == {repr(mk[0])})")
#                        print(f"           → Set gleich:  {set_match} ({repr(k[1])} == {repr(mk[1])})")
#                        print(f"           → Komplett gleich: {name_match and set_match}")

    with CARDDATA_MAPPING_FILE.open("w", encoding="utf-8") as f:
        f.write("# ORDIR mapping with original card names, sets and categories\n")
        f.write("ORDIR_CARDDATA_MAPPING = [\n")
        for entry in verbose_entries:
            f.write("    {\n")
            f.write(f'        "card_name": {repr(entry["card_name"])},\n')
            f.write(f'        "ordir_name": {repr(entry["ordir_name"])},\n')
            f.write(f'        "card_set": {repr(entry["card_set"])},\n')
            f.write(f'        "ordir_set": {repr(entry["ordir_set"]) if entry["ordir_set"] else "None"},\n')
            f.write(f'        "categories": {entry["categories"]},\n')
            f.write("    },\n")
        f.write("]\n")

    print(f"\n Strukturierte Kartendaten geschrieben nach: {CARDDATA_MAPPING_FILE}")
    print(f" Gesamtzahl der Einträge: {len(verbose_entries)}")
except Exception as e:
    print(f"\nFehler beim Erzeugen von ordir_carddata_mapping.py: {type(e).__name__}: {e}")
