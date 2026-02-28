import sys
from pathlib import Path
import re
import unicodedata
from collections import defaultdict

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
FORWARD_FILE = Path("../mappings/ordir_forward_map.py")
REFERENCE_FILE = Path("../mappings/ordir_reference_map.py")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

# === MAPPINGS ===
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

def is_bullet(line):
    return bool(re.match(r"^[•·\u2022]", line.strip()))

def is_valid_intro(line):
    line = normalize(line.lower())
    return (
        "the following redemption" in line
        and (" are " in line or " is " in line or " from " in line)
        and not any(x in line for x in ["refer to", "depict", "relate to"])
    )

def is_reference_intro(line):
    line = normalize(line.lower())
    return (
        "the following redemption" in line
        and any(x in line for x in ["refer to", "depict", "relate to"])
    )

def find_category_above(index):
    for i in range(index - 1, -1, -1):
        candidate = normalize(lines[i])
        if candidate in category_set:
            return candidate
    return None

# === INIT ===
forward_map = defaultdict(set)
reference_map = defaultdict(set)

# === PARSE ===
for i, line in enumerate(lines):
    if not is_bullet(line):
        continue

    if is_valid_intro(lines[i - 1]):
        category = find_category_above(i)
        if not category:
            print(f"[SKIP] Keine Kategorie über Zeile {i}: {lines[i]}")
            continue
        matches = re.findall(r"([^,]+?)\s*\(([^)]+)\)", line)
        for raw_name, raw_sets in matches:
            name = normalize(raw_name.strip())
            forward_map[category].add(name)
        print(f"[FORWARD] Kategorie '{category}' -> {len(matches)} Karten")

    elif is_reference_intro(lines[i - 1]):
        category = find_category_above(i)
        if not category:
            print(f"[SKIP] Keine Referenz-Kategorie über Zeile {i}: {lines[i]}")
            continue
        matches = re.findall(r"([^,]+?)\s*\(([^)]+)\)", line)
        for raw_name, raw_sets in matches:
            name = normalize(raw_name.strip())
            reference_map[category].add(name)
        print(f"[REFERENCE] Kategorie '{category}' -> {len(matches)} Karten")

# === WRITE: ordir_forward_map.py ===
with FORWARD_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_FORWARD_MAP = {\n")
    for cat, cards in sorted(forward_map.items()):
        names = ", ".join(f'"{n}"' for n in sorted(cards))
        f.write(f'    "{cat}": [{names}],\n')
    f.write("}\n")

# === WRITE: ordir_reference_map.py ===
with REFERENCE_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_REFERENCE_MAP = {\n")
    for cat, cards in sorted(reference_map.items()):
        names = ", ".join(f'"{n}"' for n in sorted(cards))
        f.write(f'    "{cat}": [{names}],\n')
    f.write("}\n")

# === SUMMARY ===
print(f"\n Forward-Mapping geschrieben nach: {FORWARD_FILE}")
print(f" Referenz-Mapping geschrieben nach: {REFERENCE_FILE}")
print(f" Kategorien mit Karten: {len(forward_map)}")
print(f" Referenzierte Kategorien: {len(reference_map)}")
