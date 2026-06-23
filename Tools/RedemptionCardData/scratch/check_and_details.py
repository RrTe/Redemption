import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
names = ["Eternal Judgment", "Nebuchadnezzar (PoC)", "Scapegoat (PoC)"]

found = []
for card in cards:
    if card.get("Name") in names:
        found.append(card)

print(json.dumps(found, indent=2))
