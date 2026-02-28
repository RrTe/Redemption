import sys
from pathlib import Path
import json
import re
from collections import defaultdict

# === SYS PATH FIX ===
sys.path.append(str(Path(__file__).resolve().parent.parent))

# === CONFIG ===
ORDIR_TEXT = Path("../data/ORDIR_PDF_6.0.0.txt")
EXTENDED_JSON = Path("../data/cards_extended.json")
MAP_FILE = Path("../mappings/ordir_map.py")
FORWARD_FILE = Path("../mappings/ordir_forward_map.py")
REFERENCE_FILE = Path("../mappings/ordir_reference_map.py")

# === LOAD ===
with ORDIR_TEXT.open(encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]

with EXTENDED_JSON.open(encoding="utf-8") as f:
    data = json.load(f)
    extended = data["cards"]

# === CATEGORIES ===
from mappings.ordir_categories import ORDIR_CATEGORIES
category_set = set(ORDIR_CATEGORIES)

# === INIT ===
reverse_map = defaultdict(set)
forward_map = defaultdict(set)
reference_map = defaultdict(set)

# === SEARCH ===
for card in extended:
    name = card["Name"]
    set_code = card.get("Set", "").strip()
    variants = [name]
    if set_code:
        variants.append(f"{name} ({set_code})")

    found = False
    for variant in variants:
        for i, line in enumerate(lines):
            if variant in line:
                # Rückwärts zur Kategorie oder Referenz
                for j in range(i, -1, -1):
                    marker = lines[j].strip()
                    marker_lower = marker.lower()

                    if marker in category_set:
                        category = marker
                        reverse_map[name].add(category)
                        forward_map[category].add(name)
                        print(f"[FOUND] '{variant}' -> '{category}'")
                        found = True
                        break

                    elif any(x in marker_lower for x in ["refer to", "depict", "relate to"]):
                        # Versuche, die referenzierte Kategorie zu extrahieren
                        match = re.search(r"(refer to|depict|relate to)\s+(.*?)(:|$)", marker_lower)
                        if match:
                            ref_cat = match.group(2).strip().title()
                            reference_map[name].add(ref_cat)
                            print(f"[REF] '{variant}' -> '{ref_cat}'")
                            found = True
                            break

                if found:
                    break

# === WRITE: ordir_map.py ===
with MAP_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_MAP = {\n")
    for card, categories in sorted(reverse_map.items()):
        cats = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    "{card}": [{cats}],\n')
    f.write("}\n")

# === WRITE: ordir_forward_map.py ===
with FORWARD_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_FORWARD_MAP = {\n")
    for cat, cards in sorted(forward_map.items()):
        names = ", ".join(f'"{n}"' for n in sorted(cards))
        f.write(f'    \"{cat}\": [{names}],\n')
    f.write("}\n")

# === WRITE: ordir_reference_map.py ===
with REFERENCE_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_REFERENCE_MAP = {\n")
    for card, refs in sorted(reference_map.items()):
        refs_str = ", ".join(f'"{r}"' for r in sorted(refs))
        f.write(f'    "{card}": [{refs_str}],\n')
    f.write("}\n")

# === SUMMARY ===
print(f"\n Mapping geschrieben nach: {MAP_FILE}")
print(f"Forward-Deklaration geschrieben nach: {FORWARD_FILE}")
print(f"Referenz-Mapping geschrieben nach: {REFERENCE_FILE}")
print(f"Gesamtanzahl gemappter Karten: {len(reverse_map)}")
print(f"Karten mit Referenz-Zuordnung: {len(reference_map)}")
