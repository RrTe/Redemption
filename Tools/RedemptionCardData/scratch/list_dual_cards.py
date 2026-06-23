import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
dual_cards = []

for card in cards:
    align = card.get("Alignment", "")
    t = card.get("Type", "")
    if "/" in align or "/" in t:
        dual_cards.append({
            "Name": card.get("Name"),
            "Type": t,
            "Alignment": align,
            "Brigade": card.get("Brigade")
        })

print(f"Total dual/slash cards found: {len(dual_cards)}")
for c in dual_cards[:30]:
    print(f"Name: {c['Name']} | Type: {c['Type']} | Align: {c['Alignment']} | Brigade: {c['Brigade']}")
