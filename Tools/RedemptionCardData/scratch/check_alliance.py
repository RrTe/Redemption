import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
cards_file = base_dir / "data" / "cards_extended.json"

with cards_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
for card in cards:
    if card.get("Name") == "Alliance Against Judah (LoC)":
        print(json.dumps(card, indent=2))
        break
