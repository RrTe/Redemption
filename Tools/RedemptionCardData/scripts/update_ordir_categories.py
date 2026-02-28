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

def generate_name_variants(base_name):
    base = normalize(base_name)
    return {base, base.replace(",", "")}

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

def line_mentions_card(line, base_name, sets):
    if not is_bullet(line):
        return False
    line = normalize(line)
    name_variants = generate_name_variants(base_name)
    if any(variant.lower() in line.lower() for variant in name_variants):
        for s in sets:
            if f"({s})" in line or f"({s}," in line or f",{s})" in line:
                return True
    return False

# === MAIN ===
missing_cards = []

for card in cards:
    name = card["Name"]
    set_code = card.get("Set", "").strip()
    base_names = extract_base_names(name)
    ordir_sets = get_ordir_sets(set_code)

    found_categories = set()
    matched = False

    for base_name in base_names:
        for i, line in enumerate(lines):
            if line_mentions_card(line, base_name, ordir_sets):
                category = find_intro_and_category(i)
                if not category:
                    category = find_book_category(i)
                if category:
                    found_categories.add(category)
                    matched = True
                    print(f"[FOUND] '{base_name}' in '{line}' -> '{category}'")
                else:
                    print(f"[SKIP] '{base_name}' in '{line}' -> keine gültige Kategorie gefunden")

    card["ORDIR"] = sorted(found_categories)
    if not matched:
        print(f"[MISS] '{name}' -> Basisnamen: {base_names}, Sets: {ordir_sets}")
        missing_cards.append(name)

# === WRITE UPDATED JSON ===
with OUTPUT_JSON.open("w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\n[Kategorien] Eingetragen in: {OUTPUT_JSON}")
print(f"[Treffer] Karten mit mindestens einer Kategorie: {len(cards) - len(missing_cards)}")
print(f"[Fehler] Karten ohne ORDIR-Kategorie: {len(missing_cards)}")
for name in sorted(missing_cards):
    print(f" - {name}")
