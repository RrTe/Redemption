import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
target_names = ["Coat of Many Colors (FoM)", "Daughter's Grief"]

found = []
for card in cards:
    if card.get("Name") in target_names:
        found.append(card)

print(json.dumps(found, indent=2))
