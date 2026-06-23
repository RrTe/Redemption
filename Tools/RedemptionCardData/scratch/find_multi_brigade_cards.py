import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
multi_cards = []

for card in cards:
    b = card.get("Brigade", "")
    if "multi" in b.lower():
        multi_cards.append({
            "Name": card.get("Name"),
            "Brigade": b,
            "Type": card.get("Type"),
            "Alignment": card.get("Alignment")
        })

print(f"Found {len(multi_cards)} cards with 'Multi' in Brigade.")
print(json.dumps(multi_cards[:10], indent=2))
