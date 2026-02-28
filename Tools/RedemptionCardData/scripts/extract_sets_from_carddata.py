import json
from pathlib import Path
from collections import Counter

# === CONFIG ===
EXTENDED_JSON = Path("../data/cards_extended.json")

# === LOAD ===
with EXTENDED_JSON.open(encoding="utf-8") as f:
    data = json.load(f)
    cards = data["cards"]

# === EXTRACT SETS ===
sets = [card.get("Set", "").strip() for card in cards if card.get("Set")]
counter = Counter(sets)

# === OUTPUT ===
print(f"🔢 Gesamtanzahl eindeutiger Sets: {len(counter)}\n")
for set_name, count in sorted(counter.items()):
    print(f"{set_name}: {count}")
