import sys
from pathlib import Path

# Projektwurzel zum sys.path hinzufügen
sys.path.append(str(Path(__file__).resolve().parent.parent))

import re
from collections import defaultdict
from mappings.ordir_categories import ORDIR_CATEGORIES  # ← Import der echten Kategorien

# === CONFIG ===
ORDIR_TXT_PATH = Path("../data/ORDIR_PDF_6.0.0.txt")
OUTPUT_DIR = Path("../mappings")
OUTPUT_DIR.mkdir(exist_ok=True)

MAP_FILE = OUTPUT_DIR / "ordir_map.py"

# === INITIALIZE ===
ordir_map = defaultdict(set)
current_category = None
collecting_cards = False

# === HELPERS ===
def clean_card_name(raw):
    raw = re.sub(r"\(.*?\)", "", raw)
    raw = re.sub(r"\[.*?\]", "", raw)
    raw = re.sub(r"[^a-zA-Z0-9'.,\- ]", "", raw)
    return raw.strip()

def extract_card_names(line):
    parts = re.split(r",| and ", line)
    return [clean_card_name(p) for p in parts if p.strip()]

def normalize(text):
    return text.strip().lower()

normalized_categories = {normalize(c): c for c in ORDIR_CATEGORIES}

# === PARSE ===
with ORDIR_TXT_PATH.open(encoding="utf-8") as f:
    for line in f:
        line = line.strip()

        # Kategorie aus Zuordnungssatz extrahieren
        match = re.match(r"The following Redemption.*are from the category (.+)", line)
        if match:
            candidate = match.group(1).strip()
            key = normalize(candidate)
            current_category = normalized_categories.get(key)

            if current_category:
                print(f"[DEBUG] Kategorie erkannt: {current_category}")
            else:
                print(f"[DEBUG] Unbekannte Kategorie: '{candidate}'")
                current_category = None

            collecting_cards = True
            continue

        # Kartenzeilen mit Bullet
        if collecting_cards and line.startswith("•"):
            cards = extract_card_names(line)
            for card in cards:
                if current_category:
                    ordir_map[card].add(current_category)
                    print(f"[DEBUG] Karte '{card}' → Kategorie '{current_category}'")
            continue

        # Kartenzeilen ohne Bullet (Fortsetzung)
        if collecting_cards and line and not line.startswith("The following"):
            cards = extract_card_names(line)
            for card in cards:
                if current_category:
                    ordir_map[card].add(current_category)
                    print(f"[DEBUG] Karte '{card}' → Kategorie '{current_category}'")
            continue

        # Leere Zeile → Ende des Blocks
        if not line:
            collecting_cards = False

# === WRITE: ordir_map.py ===
with MAP_FILE.open("w", encoding="utf-8") as f:
    f.write("ORDIR_MAP = {\n")
    for card, categories in sorted(ordir_map.items()):
        cats = ", ".join(f'"{c}"' for c in sorted(categories))
        f.write(f'    "{card}": [{cats}],\n')
    f.write("}\n")

print(f"✅ Mapping geschrieben nach: {MAP_FILE}")
