import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
dual_brigades = {}

for card in cards:
    align = card.get("Alignment", "")
    t = card.get("Type", "")
    if "/" in align or "/" in t:
        b = card.get("Brigade", "")
        if b:
            dual_brigades[b] = dual_brigades.get(b, 0) + 1

print("Brigade strings in dual cards:")
for b, count in sorted(dual_brigades.items(), key=lambda x: x[1], reverse=True):
    print(f"  {b}: {count} occurrences")
