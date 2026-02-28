import sys
from pathlib import Path
import json
import re
import unicodedata

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
EXTENDED_JSON = Path("../data/cards_extended.json")
OUTPUT_JSON = Path("../data/cards_extended_with_ordir.json")
ORDIR_MAPPING_JSON = Path("../mappings/ordir_card_entries.json")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

with EXTENDED_JSON.open(encoding="utf-8") as f:
    data = json.load(f)
    cards = data["cards"]

# === MAPPINGS ===
from mappings.ordir_categories import ORDIR_CATEGORIES
from mappings.set_alias import SET_ALIAS
from mappings.book_to_category import BOOK_TO_CATEGORY

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

def is_bullet(line):
    return bool(re.match(r"^[•·\u2022]", line.strip()))

def is_valid_intro(line):
    line = normalize(line.lower())
    return (
        "the following redemption" in line
        and (" are " in line or " is " in line or " from " in line)
        and not any(x in line for x in ["refer to", "depict", "relate to"])
    )

def find_intro_and_category(start_index):
    intro_index = None
    for i in range(start_index - 1, -1, -1):
        if is_valid_intro(lines[i]):
            intro_index = i
            break
    if intro_index is None:
        return None
    for j in range(intro_index - 1, -1, -1):
        candidate = normalize(lines[j])
        if candidate in category_set:
            return candidate
    return None

def find_book_category(start_index):
    for i in range(start_index - 1, -1, -1):
        line = normalize(lines[i])
        match = re.search(r"from (\w+):", line)
        if match:
            book = match.group(1)
            return BOOK_TO_CATEGORY.get(book)
    return None

def extract_ordir_entries():
    entries = []
    for i, line in enumerate(lines):
        if not is_bullet(line):
            continue
        category = find_intro_and_category(i) or find_book_category(i)
        if not category:
            continue
        # Extrahiere alle Namen mit Sets
        matches = re.findall(r"([^,]+?)\s*\(([^)]+)\)", line)
        for raw_name, raw_sets in matches:
            name = normalize(raw_name.strip())
            sets = [s.strip() for s in raw_sets.split(",")]
            entries.append({"name": name, "sets": sets, "category": category})
    return entries

def extract_base_names(name):
    name_no_set = re.sub(r"\s*\(([^)]+)\)\s*$", "", name).strip()
    match = re.match(r"^(.*?)(\s*\([^)]+\))?$", name_no_set)
    cleaned = normalize(match.group(1).strip())
    full = normalize(name_no_set)
    return list({cleaned, full})

def get_ordir_sets(card_set):
    value = SET_ALIAS.get(card_set.strip())
    if value is None:
        return []
    return value if isinstance(value, list) else [value]

def match_card_to_entries(card, entries):
    name = card["Name"]
    set_code = card.get("Set", "").strip()
    base_names = extract_base_names(name)
    ordir_sets = get_ordir_sets(set_code)

    found_categories = set()
    for entry in entries:
        entry_name = entry["name"]
        entry_sets = entry["sets"]
        for base_name in base_names:
            variant = normalize(base_name).replace(",", "")
            if variant.lower() == entry_name.lower():
                if any(s in entry_sets for s in ordir_sets):
                    found_categories.add(entry["category"])
    return sorted(found_categories)

# === BUILD STRUCTURED ORDIR ENTRIES ===
ordir_entries = extract_ordir_entries()

with ORDIR_MAPPING_JSON.open("w", encoding="utf-8") as f:
    json.dump(ordir_entries, f, indent=2, ensure_ascii=False)
print(f"[ORdir] Strukturierte Einträge gespeichert in: {ORDIR_MAPPING_JSON}")

# === MATCH CARDS ===
missing_cards = []

for card in cards:
    categories = match_card_to_entries(card, ordir_entries)
    card["ORDIR"] = categories
    if not categories:
        missing_cards.append(card["Name"])
        print(f"[MISS] '{card['Name']}'")

# === WRITE UPDATED JSON ===
with OUTPUT_JSON.open("w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\n[Kategorien] Eingetragen in: {OUTPUT_JSON}")
print(f"[Treffer] Karten mit mindestens einer Kategorie: {len(cards) - len(missing_cards)}")
print(f"[Fehler] Karten ohne ORDIR-Kategorie: {len(missing_cards)}")
for name in sorted(missing_cards):
    print(f" - {name}")
