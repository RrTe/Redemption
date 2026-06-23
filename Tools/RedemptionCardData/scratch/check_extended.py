import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
cards_file = base_dir / "data" / "cards_extended.json"

if not cards_file.exists():
    print(f"Error: {cards_file} does not exist.")
    exit(1)

with cards_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
target_names = ["Coat of Many Colors (FoM)", "Daughter's Grief"]

found = []
for card in cards:
    if card.get("Name") in target_names:
        found.append(card)

print(json.dumps(found, indent=2))
