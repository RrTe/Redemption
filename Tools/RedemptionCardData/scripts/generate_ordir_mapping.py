import sys
from pathlib import Path
import re
import unicodedata

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
OUTPUT_PY = Path("../mappings/ordir_card_entries.py")

# === MAPPINGS ===
from mappings.ordir_categories import ORDIR_CATEGORIES
from mappings.book_to_category import BOOK_TO_CATEGORY

category_set = set(ORDIR_CATEGORIES)

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

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

# === BUILD MAPPING ===
mapping = {}

for i, line in enumerate(lines):
    if not is_bullet(line):
        continue

    category = find_intro_and_category(i) or find_book_category(i)
    if not category:
        continue

    matches = re.findall(r"([^,]+?)\s*\(([^)]+)\)", line)
    for raw_name, raw_sets in matches:
        name = normalize(raw_name.strip())
        sets = [s.strip() for s in raw_sets.split(",")]
        for s in sets:
            key = (name, s)
            if key not in mapping:
                mapping[key] = []
            if category not in mapping[key]:
                mapping[key].append(category)

# === WRITE PYTHON FILE ===
with OUTPUT_PY.open("w", encoding="utf-8") as f:
    f.write("# ORDIR card-to-category mapping\n")
    f.write("ORDIR_CARD_ENTRIES = {\n")
    for (name, set_code), categories in sorted(mapping.items()):
        cat_list = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    ("{name}", "{set_code}"): [{cat_list}],\n')
    f.write("}\n")

print(f"[OK] Mapping geschrieben nach: {OUTPUT_PY}")
print(f"[Einträge] Gesamt: {len(mapping)}")
