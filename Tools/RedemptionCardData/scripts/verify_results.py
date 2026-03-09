import json
from pathlib import Path

# Fix: Use local path for Windows context
FILE = Path('data/cards_extended_with_ordir_fuzzy.json')
if not FILE.exists():
    print(f"File {FILE} not found!")
    exit(1)

with FILE.open('r', encoding='utf-8') as f:
    data = json.load(f)
    cards = data['cards']

targets = [
    'Nicodemus, the seeker',
    'Nicodemus, the teacher',
    'James (half-brother of Jesus',
    "Herod's Temple",
    "Foretelling Angel",
    "Striking Herod"
]

print("--- Start Verification ---")
for t in targets:
    t_lower = t.lower()
    matches = [c for c in cards if t_lower == c.get('Name', '').lower()]
    if not matches:
        # Fallback for partial matches
        matches = [c for c in cards if t_lower in c.get('Name', '').lower()]
        
    for m in matches:
        print(f"Name: {m.get('Name')}")
        print(f"Set:  {m.get('Set')}")
        ordir_list = sorted(list(m.get('ORDIR', [])))
        print(f"Categories Count: {len(ordir_list)}")
        print(f"ORDIR (first 10): {ordir_list[:10]}")
        # Check specific category for Nicodemus (Pharisee)
        if "Pharisee" in ordir_list:
             print("   Found category: Pharisee")
        if "Duplicate Card" in ordir_list:
             print("   Found category: Duplicate Card")
        print("-" * 20)
print("--- End Verification ---")
