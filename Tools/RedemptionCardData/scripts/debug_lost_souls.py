import json
import sys
from pathlib import Path

# Setup paths
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from mappings.alias_engine import sets_intersect, rarity_intersect, extract_all_raw_sets_from_card

def debug_lost_soul_match(ordir_set, candidate_name):
    # Load cards
    cards_file = BASE_DIR / "data" / "cards_extended.json"
    with cards_file.open("r", encoding="utf-8", errors="ignore") as f:
        cards = json.load(f)["cards"]
    
    found = False
    for c in cards:
        if c.get("Name") == candidate_name:
            found = True
            raw_sets = extract_all_raw_sets_from_card(c)
            intersect = sets_intersect(ordir_set, raw_sets)
            rarity_hit = rarity_intersect(ordir_set, c)
            print(f"Candidate: {candidate_name}")
            print(f"Candidate Sets: {raw_sets}")
            print(f"ORDIR Set: {ordir_set}")
            print(f"Sets Intersect: {intersect}")
            print(f"Rarity Hit: {rarity_hit}")
            break
    if not found:
        # Try case-insensitive
        for c in cards:
            if c.get("Name", "").lower() == candidate_name.lower():
                found = True
                raw_sets = extract_all_raw_sets_from_card(c)
                intersect = sets_intersect(ordir_set, raw_sets)
                rarity_hit = rarity_intersect(ordir_set, c)
                print(f"Candidate (CI): {c.get('Name')}")
                print(f"Candidate Sets: {raw_sets}")
                print(f"ORDIR Set: {ordir_set}")
                print(f"Sets Intersect: {intersect}")
                print(f"Rarity Hit: {rarity_hit}")
                break
    
    if not found:
        print(f"Could not find candidate: {candidate_name}")

if __name__ == "__main__":
    print("--- Case 1: Luke 13:30 ---")
    debug_lost_soul_match("IJ+", 'Lost Soul "the First" [Luke 13:30]')
    
    print("\n--- Case 2: Ezekiel 34:12 ---")
    debug_lost_soul_match("B", "Lost Soul  Ezekiel 34:12")
