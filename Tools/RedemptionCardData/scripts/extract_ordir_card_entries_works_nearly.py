import sys
from pathlib import Path
import re
import unicodedata
from collections import defaultdict

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
CATEGORY_FILE = Path("../mappings/ordir_card_entries.py")
REFERENCE_FILE = Path("../mappings/ordir_reference_entries.py")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

from mappings.ordir_categories import ORDIR_CATEGORIES
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

def extract_cards_from_block(block_text):
    # Entferne Bullet-Zeichen und Typen
    block_text = re.sub(r"[•·\u2022]\s*\([^)]+\):", "", block_text)
    # Extrahiere alle (Name, Set)-Paare
    matches = re.findall(r"([^,]+?)\s*\(([^)]+)\)", block_text)
    results = []
    for raw_name, raw_sets in matches:
        name = normalize(raw_name.strip())
        sets = [s.strip() for s in raw_sets.split(",")]
        for s in sets:
            if name and s:
                results.append((name, s))
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
                break  # nächste Kategorie beginnt
            if is_marker(marker):
                is_reference = is_reference_marker(marker)
                i += 1
                block_lines = []
                while i < len(lines) and is_bullet(lines[i]):
                    block_lines.append(lines[i])
                    i += 1
                block_text = " ".join(block_lines)
                cards = extract_cards_from_block(block_text)
                target = reference_map if is_reference else category_map
                for name, set_code in cards:
                    target[(name, set_code)].add(current_category)
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
