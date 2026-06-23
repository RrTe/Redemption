import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
and_cards = []

for card in cards:
    b = card.get("Brigade", "")
    if "and" in b.lower():
        and_cards.append({
            "Name": card.get("Name"),
            "Brigade": b,
            "Type": card.get("Type")
        })

print(f"Found {len(and_cards)} cards with 'and' in Brigade.")
for c in and_cards[:20]:
    print(f"Name: {c['Name']} | Brigade: {c['Brigade']} | Type: {c['Type']}")
