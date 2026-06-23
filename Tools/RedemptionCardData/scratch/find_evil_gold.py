import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
gold_multi_duals = []

for card in cards:
    align = card.get("Alignment", "")
    t = card.get("Type", "")
    if "/" in align or "/" in t:
        b = card.get("Brigade", "").lower()
        if "gold" in b or "multi" in b:
            gold_multi_duals.append({
                "Name": card.get("Name"),
                "Type": t,
                "Alignment": align,
                "Brigade": card.get("Brigade"),
                "SpecialAbility": card.get("SpecialAbility")
            })

print(f"Found {len(gold_multi_duals)} dual cards with Gold or Multi:")
for c in gold_multi_duals:
    print(f"Name: {c['Name']} | Brigade: {c['Brigade']} | Type: {c['Type']}")
