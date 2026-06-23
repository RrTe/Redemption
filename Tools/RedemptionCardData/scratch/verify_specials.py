import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
cards_file = base_dir / "data" / "cards_extended.json"

with cards_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
targets = [
    "Delivered",
    "First Bowl of Wrath (RoJ)",
    "First Bowl of Wrath (RoJ AB)",
    "Nebuchadnezzar (PoC)",
    "Scapegoat (PoC)",
    "Eternal Judgment",
    "Alliance Against Judah (LoC)"
]

found = []
for card in cards:
    if card.get("Name") in targets:
        found.append({
            "Name": card.get("Name"),
            "Brigade": card.get("Brigade"),
            "Brigades": card.get("Brigades"),
            "CardSides": {
                side: {
                    "Type": side_data.get("Type"),
                    "Alignment": side_data.get("Alignment"),
                    "Brigades": side_data.get("Brigades")
                }
                for side, side_data in card.get("CardSides", {}).items()
            }
        })

print(json.dumps(found, indent=2))
