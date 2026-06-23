import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
targets = ["first bowl of wrath", "majestic heavens", "delivered"]
found = []

for card in cards:
    name = card.get("Name", "").lower()
    for t in targets:
        if t in name:
            found.append(card)

print(json.dumps(found, indent=2))
