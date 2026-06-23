import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
cards_file = base_dir / "data" / "cards_extended.json"

with cards_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])

samples = {}
for card in cards:
    # let's look for:
    # 1. A Hero
    # 2. An Evil Character
    # 3. A GE
    # 4. An EE
    # 5. A Multi-type/slash card
    name = card.get("Name", "")
    card_types = card.get("CardTypes", [])
    
    if "Hero" in card_types and "Hero" not in samples:
        samples["Hero"] = card
    elif "Evil Character" in card_types and "Evil Character" not in samples:
        samples["Evil Character"] = card
    elif "GE" in card_types and "GE" not in samples:
        samples["GE"] = card
    elif "EE" in card_types and "EE" not in samples:
        samples["EE"] = card
    
    if "/" in card.get("Type", "") and "Slash" not in samples:
        samples["Slash"] = card

for key, card in samples.items():
    print(f"=== {key}: {card.get('Name')} ===")
    print(f"  Type: {card.get('Type')}")
    print(f"  CardTypes: {card.get('CardTypes')}")
    print(f"  Brigade: {card.get('Brigade')}")
    print(f"  Brigades: {card.get('Brigades')}")
    print(f"  CardSides: {list(card.get('CardSides', {}).keys())}")
    for side, side_data in card.get('CardSides', {}).items():
        print(f"    Side '{side}': Type={side_data.get('Type')}, Alignment={side_data.get('Alignment')}, Brigades={side_data.get('Brigades')}")
