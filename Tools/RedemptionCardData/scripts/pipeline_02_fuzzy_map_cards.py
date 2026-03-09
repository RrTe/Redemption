\"\"\"
Pipeline 02: Fuzzy Mapper

Purpose:
Maps the raw ORDIR card names (from pipeline_01) to the actual JSON objects in 'cards_extended.json'.
Uses fuzzy matching configured strictly (fuzz.token_sort_ratio >= 80) to prevent subset misidentification 
(e.g., preventing the category string "Coliseum" from claiming the card "Coliseum Lion").

Outputs:
data/cards_extended_with_ordir_fuzzy.json -> The final merged database.
data/unmatched_ordir_entries.log -> An error log of ORDIR cards that could not be found in the JSON.
\"\"\"
import json
from pathlib import Path
from thefuzz import process, fuzz
import sys

# Setup paths based on the current scripts directory
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

ORDIR_RAW_FILE = DATA_DIR / "ordir_extracted_raw.json"
EXTENDED_CARDS = DATA_DIR / "cards_extended.json"
OUT_FILE = DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
UNMATCHED_LOG = DATA_DIR / "unmatched_ordir_entries.log"

sys.path.append(str(BASE_DIR))
from mappings.alias_engine import normalize_name, extract_all_raw_sets_from_card, sets_intersect, rarity_intersect
from mappings.ordir_name_errata import GLOBAL_EXCEPTIONS

def load_data():
    with ORDIR_RAW_FILE.open("r", encoding="utf-8") as f:
        ordir_data = json.load(f)
        
    with EXTENDED_CARDS.open("r", encoding="utf-8") as f:
        cards_data = json.load(f)["cards"]
        
    return ordir_data, cards_data

def build_card_lookup(cards_data):
    """
    Builds a list of dictionaries that represent the available cards to match against.
    Applies name errata, string normalization, and tracks if it's a dual-sided card.
    
    Args:
        cards_data (list): The JSON array representing the extended card data.
        
    Returns:
        list: A lookup list mapping normalized names to their original JSON references.
    """
    lookup = []
    
    for c in cards_data:
        raw_name = c.get("Name", "")
        # The true logical identity of the card
        # If it has dual-faces we might want to map both sides.
        
        # Determine names to map against
        names_to_test = [raw_name]
        
        if "/" in raw_name:
            names_to_test.extend([n.strip() for n in raw_name.split("/")])
            
        # Add CardSides
        if "CardSides" in c and c["CardSides"]:
            for side_name, side_data in c["CardSides"].items():
                names_to_test.append(side_name)
                
        # Now normalize and errata all
        normalized_names = set()
        for name in names_to_test:
            # Special case for Lost Souls: preserve the full name including brackets/quotes
            is_lost_soul = "lost soul" in name.lower()
            
            if not is_lost_soul:
                # Drop print suffixes from the test name for normal cards
                import re
                name = re.sub(r"\([^)]+\)", "", name) # Strip (L), (Promo), etc
                name = re.sub(r"\[[^\]]+\]", "", name)
            
            n_clean = normalize_name(GLOBAL_EXCEPTIONS.get(name.strip(), name.strip()))
            
            if n_clean:
                normalized_names.add(n_clean)
                
        # Card representation
        lookup.append({
            "original_name": raw_name,
            "normalized_names": list(normalized_names),
            "raw_sets": extract_all_raw_sets_from_card(c),
            "ref": c  # Pointer back to original object
        })
        
    return lookup

def map_ordir_to_cards():
    ordir_data, cards_data = load_data()
    lookup = build_card_lookup(cards_data)
    
    # We want a target list of just names to give to thefuzz
    fuzzy_choices = []
    choice_map = {} # Maps the fuzzy choice back to lookup indices
    
    for i, item in enumerate(lookup):
        for n in item["normalized_names"]:
            fuzzy_choices.append(n)
            # A normalized string maps to a list of card indices (reprints exist)
            if n not in choice_map:
                choice_map[n] = []
            choice_map[n].append(i)

    unmatched = []
    mapped_count = 0
    total_ordir_refs = 0
    
    # Ensure ORDIR array initialized
    for c in cards_data:
        c["ORDIR"] = set()

    print("Beginning Fuzzy Matching...")
    
    for category_block in ordir_data:
        cat_name = category_block["category"]
        for o_card in category_block["cards"]:
            total_ordir_refs += 1
            
            o_name = o_card["card_name"]
            o_set = o_card["set"]
            o_brackets = o_card.get("brackets", "")
            
            # Reconstruct the "identity" name for Lost Souls if brackets exist
            search_name = o_name
            if o_brackets and "lost soul" in o_name.lower():
                search_name = f"{o_name} [{o_brackets}]"
            
            clean_o_name = normalize_name(GLOBAL_EXCEPTIONS.get(search_name, search_name))
            
            # Step 1: Find best fuzzy matches (above 90 threshold)
            # Default limit is 5, we MUST increase it to 100 because "Luke" matches 100% with dozens of "Lost Soul [Luke...]" cards!
            best_matches = process.extractBests(clean_o_name, fuzzy_choices, scorer=fuzz.token_set_ratio, limit=100, score_cutoff=90)
            
            matched = False
            for match_str, score in best_matches:
                # NEW STRICTNESS CHECK to prevent subset matching:
                # thefuzz's token_set_ratio returns 100% if string A is entirely contained in string B.
                # This causes false positives (e.g. "Coliseum" matching "Coliseum Lion").
                # To prevent this, we enforce a strict token_sort_ratio check.
                is_lost_soul = "lost soul" in clean_o_name.lower()
                sort_score = fuzz.token_sort_ratio(clean_o_name, match_str)
                
                # If it's not a Lost Soul (which legitimately has long bracketed identifiers),
                # we demand that the strings are actually similar in length and content,
                # not just that one is a subset of the other.
                if not is_lost_soul and sort_score < 80:
                    continue
                    
                # Get the candidate cards mapped to this fuzzy string
                candidate_indices = choice_map[match_str]
                
                # Step 2: Validate the set intersection
                # Fuzzy matching names alone is not robust. We MUST intersect the sets (e.g., "Ap" vs "Di").
                for idx in candidate_indices:
                    candidate = lookup[idx]
                    
                    # Exception: If ORDIR extraction failed to find a set (UNKNOWN), we trust a near-perfect name match.
                    if o_set == "UNKNOWN" and score >= 98:
                        candidate["ref"]["ORDIR"].add(cat_name)
                        matched = True
                        mapped_count += 1
                        break # Only map to the best one if the set is unknown
                        
                    if sets_intersect(o_set, candidate["raw_sets"]) or rarity_intersect(o_set, candidate["ref"]):
                        # Success!
                        candidate["ref"]["ORDIR"].add(cat_name)
                        matched = True
                        mapped_count += 1
                        
            if not matched:
                unmatched.append({
                    "category": cat_name,
                    "target_name": clean_o_name,
                    "target_set": o_set,
                    "raw_string": o_card["raw_string"],
                    "best_guesses": [(m[0], m[1]) for m in best_matches]
                })

    # Clean up sets to lists for JSON serialization
    for c in cards_data:
        c["ORDIR"] = sorted(list(c["ORDIR"]))
        
    print(f"Mapped {mapped_count} out of {total_ordir_refs} ORDIR references.")
    print(f"Writing updated cards to {OUT_FILE}...")
    
    with OUT_FILE.open("w", encoding="utf-8") as f:
        json.dump({"cards": cards_data}, f, indent=4, ensure_ascii=False)
        
    print(f"Writing {len(unmatched)} unmatched entries to {UNMATCHED_LOG}...")
    with UNMATCHED_LOG.open("w", encoding="utf-8") as f:
        for u in unmatched:
            f.write(f"Category: {u['category']}\n")
            f.write(f"Card: {u['target_name']} [{u['target_set']}]\n")
            f.write(f"Raw string: {u['raw_string']}\n")
            f.write(f"Best Guesses (Fuzzy Score): {u['best_guesses']}\n")
            f.write("-" * 40 + "\n")
            
    print("Done!")

if __name__ == "__main__":
    map_ordir_to_cards()
