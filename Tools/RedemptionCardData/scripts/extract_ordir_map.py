import sys
from pathlib import Path

# Projektwurzel zum sys.path hinzufügen
sys.path.append(str(Path(__file__).resolve().parent.parent))

from pathlib import Path
import re
from collections import defaultdict
from mappings.ordir_categories import ORDIR_CATEGORIES

# === CONFIG ===
TXT_PATH = Path("../data/ORDIR_PDF_6.0.0.txt")
MAP_FILE = Path("../mappings/ordir_map.py")

# === INITIALIZE ===
ordir_map = defaultdict(set)
current_category = None
tracking = False
buffer = ""

# === HELPERS ===
def clean_card_name(raw):
    raw = re.sub(r"\(.*?\)", "", raw)
    raw = re.sub(r"\[.*?\]", "", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()

def extract_card_names(line):
    line = line.replace(" and ", ", ")
    parts = line.split(",")
    return [clean_card_name(p) for p in parts if p.strip()]

def flush_buffer():
    global buffer
    if buffer:
        print(f"\n[FLUSH] Kategorie '{current_category}'")
        print(f"[RAW BUFFER] {buffer}")
        content = re.sub(r"^\([^)]+\):\s*", "", buffer)
        content = re.sub(r"^[A-Za-z]+:\s*", "", content)
        print(f"[CLEANED CONTENT] {content}")
        cards = extract_card_names(content)
        print(f"[PARSED CARDS] {cards}")
        for card in cards:
            if current_category:
                ordir_map[card].add(current_category)
                print(f"[MAPPED] '{card}' → '{current_category}'")
        buffer = ""

# === PARSE TEXT ===
with TXT_PATH.open(encoding="utf-8") as f:
    lines = [line.rstrip("\n") for line in f]

i = 0
while i < len(lines):
    line = lines[i].strip()
    print(f"[CHECK] Bullet-Erkennung: {repr(line)} → Match: {bool(re.search(r'^[ \t]*[•·\u2022]', line))}")

    if line in ORDIR_CATEGORIES:
        flush_buffer()
        current_category = line
        tracking = False
        print(f"\n[DEBUG] Kategorie erkannt: {current_category}")
        i += 1
        continue

    if re.search(r"^[ \t]*[•·\u2022]", line):
        flush_buffer()
        buffer = re.sub(r"^[ \t]*[•·\u2022]", "", line).strip()
        tracking = True
        i += 1
        # Folgezeilen anhängen
        while i < len(lines):
            next_line = lines[i].strip()
            if not next_line or next_line in ORDIR_CATEGORIES or re.search(r"^[ \t]*[•·\u2022]", next_line):
                break
            buffer += " " + next_line
            i += 1
        flush_buffer()
        tracking = False
        continue

    i += 1

flush_buffer()

# === WRITE: ordir_map.py ===
with MAP_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_MAP = {\n")
    for card, categories in sorted(ordir_map.items()):
        cats = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    "{card}": [{cats}],\n')
    f.write("}\n")

print(f"\n✅ Mapping geschrieben nach: {MAP_FILE}")
print(f"🔢 Gesamtanzahl gemappter Karten: {len(ordir_map)}")
