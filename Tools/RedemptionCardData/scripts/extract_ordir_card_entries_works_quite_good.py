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
EXTENDED_CARDS = Path("../data/cards_extended.json")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

from mappings.ordir_categories import ORDIR_CATEGORIES
from mappings.set_alias import SET_ALIAS

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

def safe_key(name, set_code):
    if isinstance(name, list):
        name = name[0] if name else ""
    if isinstance(set_code, list):
        set_code = set_code[0] if set_code else ""
    name_str = normalize(str(name))
    set_raw = normalize(str(set_code))
    alias = SET_ALIAS.get(set_raw, set_raw)
    if isinstance(alias, list):
        alias = alias[0] if alias else ""
    return (name_str, alias)

def extract_set_variants(raw_set):
    return re.findall(r"\b[A-Za-z0-9\-]+\b", str(raw_set))

def clean_card_name(name):
    return re.sub(r"\s*\([A-Za-z0-9\-]+\)$", "", str(name)).strip()

def is_marker(line):
    line = normalize(line.lower())
    return "the following redemption" in line and (
        " are " in line or " is " in line or " from " in line or
        "refer to" in line or "depict" in line or "relate to" in line
    )

def is_reference_marker(line):
    line = normalize(line.lower())
    return any(x in line for x in ["refer to", "depict", "relate to"])

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
    return results

def parse_card_line(line):
    results = []
    line = re.sub(r"^[•·\u2022]\s*\([^)]+\):\s*", "", line).strip()
    line = re.sub(r"^[•·\u2022]\s*", "", line).strip()
    line = re.sub(r"\)\s+and\s+", ")|", line)
    line = re.sub(r"\),\s+", ")|", line)
    parts = line.split("|")
    for part in parts:
        match = re.match(r"(.+?)\s*\(([^)]+)\)\s*$", part.strip())
        if match:
            raw_name = match.group(1).strip()
            raw_sets = match.group(2).replace(" and ", ",")
            sets = [s.strip() for s in raw_sets.split(",") if s.strip()]
            for s in sets:
                results.append((raw_name, s))
    return results

# === PARSE ===
category_map = defaultdict(set)
reference_map = defaultdict(set)

i = 0
while i < len(lines):
    line = normalize(lines[i])
    if line in category_set:
        current_category = line
        i += 1
        while i < len(lines):
            marker = normalize(lines[i])
            if marker in category_set:
                break
            if is_marker(marker):
                is_reference = is_reference_marker(marker)
                i += 1
                block_lines = []
                while i < len(lines):
                    if is_bullet(lines[i]):
                        block = []
                        while i < len(lines) and (
                            is_bullet(lines[i]) or
                            not is_marker(lines[i]) and lines[i] not in category_set
                        ):
                            block.append(lines[i])
                            i += 1
                        block_lines.extend(block)
                    elif is_marker(lines[i]) or lines[i] in category_set:
                        break
                    else:
                        i += 1
                cards = extract_cards_from_block(block_lines)
                target = reference_map if is_reference else category_map
                for raw_name, raw_set in cards:
                    key = safe_key(raw_name, raw_set)
                    try:
                        target[key].add(current_category)
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

# === SUMMARY ===
print(f"\n Kategorie-Mapping geschrieben nach: {CATEGORY_FILE}")
print(f" Referenz-Mapping geschrieben nach: {REFERENCE_FILE}")
print(f" Karten mit echten Kategorien: {len(category_map)}")
print(f" Karten mit Referenzkategorien: {len(reference_map)}")

# === VALIDIERUNG: Karten ohne ORDIR-Kategorieeintrag ===
try:
    with EXTENDED_CARDS.open(encoding="utf-8") as f:
        extended_cards = json.load(f)["cards"]

    missing = []
    for idx, card in enumerate(extended_cards):
        raw_name = card.get("Name")
        raw_set = card.get("Set", "")
        name = clean_card_name(raw_name)
        set_variants = extract_set_variants(raw_set)
        keys_tested = [safe_key(name, variant) for variant in set_variants]
        found = False
        for key in keys_tested:
            if key in category_map:
                found = True
                break
        if not found:
#            print(f"\n❌ Nicht gefunden: {raw_name} ({raw_set})")
#            print(f"   → Bereinigt: {repr(name)}")
#            print(f"   → Set-Varianten: {set_variants}")
#            print(f"   → Geprüfte Schlüssel:")
#            for k in keys_tested:
#                print(f"     - {repr(k)} {'✅' if k in category_map else '❌'}")
#                if k not in category_map:
#                    print("       → Vergleich mit Mapping-Schlüsseln:")
#                    for mk in category_map:
#                        if k[0] == mk[0] or k[1] == mk[1]:
#                            print(f"         - Mapping Key: {repr(mk)}")
#                            print(f"           → Name gleich: {k[0] == mk[0]} ({repr(k[0])} == {repr(mk[0])})")
#                            print(f"           → Set gleich:  {k[1] == mk[1]} ({repr(k[1])} == {repr(mk[1])})")
#                            print(f"           → Komplett gleich: {k == mk}")
            missing.append(keys_tested[0])

        print(f"\n🔎 Karten ohne ORDIR-Kategorieeintrag: {len(missing)}")
    for name, set_code in sorted(missing):
        print(f"- {name} ({set_code})")
except Exception as e:
    print(f"\nFehler beim Laden oder Verarbeiten von cards_extended.json: {type(e).__name__}: {e}")
