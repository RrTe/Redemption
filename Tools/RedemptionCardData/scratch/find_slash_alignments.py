import json
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
input_file = base_dir / "data" / "carddata.json"

with input_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

cards = data.get("cards", [])
alignments = set()
for card in cards:
    align = card.get("Alignment", "")
    if "/" in align:
        alignments.add(align)

print("Alignments with slash:")
print(alignments)
