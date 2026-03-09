import json
from pathlib import Path

FILE = Path('data/ordir_extracted_raw.json')
if not FILE.exists():
    print("File not found")
    exit(1)

with FILE.open('r', encoding='utf-8') as f:
    data = json.load(f)

targets = ['Pharisee', 'Empty Tomb Hero', 'James Card', 'Gender']
card_targets = ['nicodemus', 'james', 'root of jesse', 'book of the law', 'salome']

with open('debug_output.txt', 'w', encoding='utf-8') as f:
    f.write("--- RAW EXTRACTION SCRUTINY ---\n")
    for cat in data:
        cat_name = cat['category']
        matches_cat = any(t.lower() in cat_name.lower() for t in targets)
        
        found_cards = []
        for c in cat['cards']:
            name = c['card_name'].lower()
            if any(ct in name for ct in card_targets):
                found_cards.append(c)
                
        if matches_cat or found_cards:
            f.write(f"\n[Category: {cat_name}]\n")
            if matches_cat and not found_cards:
                 f.write(f"  (Category matched targets, but no target cards found here. First 3 cards: {cat['cards'][:3]})\n")
            for fc in found_cards:
                f.write(f"  Found: {fc}\n")

    f.write("\n--- End Scrutiny ---\n")
