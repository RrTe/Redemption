import sys
from pathlib import Path
import re
import unicodedata
from collections import defaultdict

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
CATEGORY_MAP = Path("../mappings/ordir_category_card_map.py")
REFERENCE_MAP = Path("../mappings/ordir_reference_card_map.py")

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

def extract_card_names(line):
    # Entferne Bullet-Zeichen und Typen
    line = re.sub(r"^[•·\u2022]\s*\([^)]+\):\s*", "", line).strip()
    # Zerlege nach Kommas und "and"
    parts = re.split(r",|\band\b", line)
    cards = []
    for part in parts:
        match = re.match(r"(.*?)(\s*\(([^)]+)\))?$", part.strip())
        if match:
            name = normalize(match.group(1).strip())
            if name:
                cards.append(name)
    return cards

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
                while i < len(lines) and is_bullet(lines[i]):
                    card_line = lines[i]
                    cards = extract_card_names(card_line)
                    target = reference_map if is_reference else category_map
                    for card in cards:
                        target[current_category].add(card)
                    i += 1
            else:
                i += 1
    else:
        i += 1

# === WRITE: category_map.py ===
with CATEGORY_MAP.open("w", encoding="utf-8") as f:
    f.write("ORDIR_CATEGORY_CARD_MAP = {\n")
    for cat, cards in sorted(category_map.items()):
        names = ", ".join(f'"{n}"' for n in sorted(cards))
        f.write(f'    "{cat}": [{names}],\n')
    f.write("}\n")

# === WRITE: reference_map.py ===
with REFERENCE_MAP.open("w", encoding="utf-8") as f:
    f.write("ORDIR_REFERENCE_CARD_MAP = {\n")
    for cat, cards in sorted(reference_map.items()):
        names = ", ".join(f'"{n}"' for n in sorted(cards))
        f.write(f'    "{cat}": [{names}],\n')
    f.write("}\n")

# === SUMMARY ===
print(f"\n✅ Kategorie-Mapping geschrieben nach: {CATEGORY_MAP}")
print(f"📎 Referenz-Mapping geschrieben nach: {REFERENCE_MAP}")
print(f"🔢 Kategorien mit Karten: {len(category_map)}")
print(f"📚 Referenzierte Kategorien: {len(reference_map)}")
