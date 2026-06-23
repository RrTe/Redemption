import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
cards_file = base_dir / "data" / "cards_extended.json"

with cards_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])

# Let's inspect a few cards of different types
sample_cards = []
types_seen = set()

for card in cards:
    raw_type = card.get("Type", "")
    if "/" in raw_type:
        continue  # skip dual/slash cards for a moment
    
    # We want to see how normal cards map their brigades
    brigades = card.get("Brigades", {})
    if brigades and raw_type not in types_seen:
        types_seen.add(raw_type)
        sample_cards.append({
            "Name": card.get("Name"),
            "Type": raw_type,
            "CardTypes": card.get("CardTypes"),
            "Brigade": card.get("Brigade"),
            "Brigades": brigades
        })
        if len(sample_cards) >= 5:
            break

print("Normal cards:")
print(json.dumps(sample_cards, indent=2))
