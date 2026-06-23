import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
slash_types = set()
examples = {}

for card in cards:
    t = card.get("Type", "")
    if "/" in t:
        slash_types.add(t)
        if t not in examples:
            examples[t] = card.get("Name")

print("Types with slash:")
for t in sorted(slash_types):
    print(f"  {t} (e.g. {examples[t]})")
