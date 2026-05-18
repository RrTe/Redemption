"""
Pipeline 02: Fuzzy Mapper

Purpose:
Maps the raw ORDIR card names (from pipeline_01) to the actual JSON objects in 'cards_extended.json'.
Uses fuzzy matching configured strictly (fuzz.token_sort_ratio >= 80) to prevent subset misidentification 
(e.g., preventing the category string "Coliseum" from claiming the card "Coliseum Lion").

Outputs:
data/cards_extended_with_ordir_fuzzy.json -> The final merged database.
data/unmatched_ordir_entries.log -> An error log of ORDIR cards that could not be found in the JSON.
"""
import json
from pathlib import Path
from thefuzz import process, fuzz
import sys

# Setup paths based on the current scripts directory
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Read configuration from config.json
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

ORDIR_RAW_FILE = DATA_DIR / "ordir_extracted_raw.json"
EXTENDED_CARDS = BASE_DIR / _config["cards_file"]
OUT_FILE = DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
UNMATCHED_LOG = DATA_DIR / "unmatched_ordir_entries.log"

sys.path.append(str(BASE_DIR))
from mappings.alias_engine import normalize_name, extract_all_raw_sets_from_card, sets_intersect, rarity_intersect, has_year_mismatch
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
        
        # EXCLUSION: Tokens are not real cards and are not listed in ORDIR.
        # We skip them to prevent false positive 'Lost Soul' matches.
        if "token" in raw_name.lower():
            continue
            
        # The true logical identity of the card
        # If it has dual-faces we might want to map both sides.
        
        # Determine names to map against
        names_to_test = [raw_name]
        
        if "/" in raw_name:
            names_to_test.extend([n.strip() for n in raw_name.split("/")])
            
        # Add CardSides
        if "CardSides" in c and c["CardSides"]:
            for side_key, side_data in c["CardSides"].items():
                if isinstance(side_data, dict) and "Name" in side_data:
                    names_to_test.append(side_data["Name"])
                
        # Now normalize and errata all
        normalized_names = set()
        import re
        for name in names_to_test:
            # STRATEGY: Register TWO normalized forms for maximum match coverage:
            # 1. "Surgical" form: Only strip metadata parentheticals (sets, years, print terms).
            #    This preserves identity like "(Ark of Salvation)" or "(Bar-Jesus)".
            # 2. "Bare" form: Strip ALL parentheticals/brackets.
            #    This is the old approach and catches cases where JSON card names have
            #    composite blocks like "(EC, Black)" that don't match individual set codes.
            
            # --- Form 1: Surgical stripping ---
            blocks = re.findall(r'[\(\[](.*?)[\)\]]', name)
            content_to_strip = []
            card_raw_sets = extract_all_raw_sets_from_card(c)
            
            for block in blocks:
                b_clean = block.strip()
                should_strip = False
                
                # 1a. Exact match against card's set codes
                if b_clean in card_raw_sets:
                    should_strip = True
                
                # 1b. Check individual comma-separated parts within the block
                if not should_strip:
                    parts = [p.strip() for p in b_clean.split(",")]
                    if len(parts) > 1 and all(
                        p in card_raw_sets 
                        or re.match(r'^(199\d|20\d\d)$', p)
                        or p.lower() in ["promo", "winner", "limited", "unlimited", "main", 
                                         "state", "regional", "national", "district", "fundraiser", "rotation"]
                        for p in parts
                    ):
                        should_strip = True
                
                # 2. Is it a year >= 1995?
                if not should_strip:
                    y_match = re.search(r'\b(199\d|20\d\d)\b', b_clean)
                    if y_match and int(y_match.group(1)) >= 1995:
                        should_strip = True
                            
                # 3. Whitelist of print metadata
                if not should_strip:
                    metadata_terms = ["promo", "winner", "limited", "unlimited", "main", "state", 
                                      "regional", "national", "district", "fundraiser", "rotation"]
                    if any(t in b_clean.lower() for t in metadata_terms):
                        should_strip = True

                if should_strip:
                    content_to_strip.append(re.escape(block))

            n_surgical = name
            for cts in content_to_strip:
                n_surgical = re.sub(rf'[\(\[]\s*{cts}\s*[\)\]]', "", n_surgical)
            
            n_clean_surgical = normalize_name(GLOBAL_EXCEPTIONS.get(n_surgical.strip(), n_surgical.strip()))
            if n_clean_surgical:
                normalized_names.add(n_clean_surgical)
            
            # --- Form 2: Bare fallback (strip ALL parentheticals/brackets) ---
            n_bare = re.sub(r"\([^)]*\)", "", name)
            n_bare = re.sub(r"\[[^\]]*\]", "", n_bare)
            n_clean_bare = normalize_name(GLOBAL_EXCEPTIONS.get(n_bare.strip(), n_bare.strip()))
            if n_clean_bare and n_clean_bare != n_clean_surgical:
                normalized_names.add(n_clean_bare)
                
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

    total_ordir_refs = sum(len(cat["cards"]) for cat in ordir_data)
    print(f"Beginning Mapping of {total_ordir_refs} references...", flush=True)
    processed_count = 0
    
    for category_block in ordir_data:
        cat_name = category_block["category"]
        for o_card in category_block["cards"]:
            processed_count += 1
            if processed_count % 500 == 0:
                print(f"  Processed {processed_count}/{total_ordir_refs} ({int(processed_count/total_ordir_refs*100)}%)...", flush=True)
            
            o_name = o_card["card_name"]
            o_set = o_card["set"]
            o_brackets = o_card.get("brackets", "")
            
            # Reconstruct the "identity" name for Lost Souls/New Covenant if brackets exist
            search_name = o_name
            if o_brackets and ("lost soul" in o_name.lower() or "new covenant" in o_name.lower()):
                search_name = f"{o_name} [{o_brackets}]"
            
            clean_o_name = normalize_name(GLOBAL_EXCEPTIONS.get(search_name, search_name))
            
            # --- OPTIMIZATION: EXACT MATCH SHORT-CIRCUIT ---
            # Fuzzy matching is O(N*M) and very slow. Exact hash lookup is O(1).
            # If the name matches exactly, we skip the expensive fuzzy search.
            if clean_o_name in choice_map:
                best_matches = [(clean_o_name, 100)]
            else:
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
                        # [NEW] Year-Aware Filter: If ORDIR set specifies a year (e.g. P-2018),
                        # ensure the card name or metadata also matches that year.
                        # This prevents cross-set bleed in Son of God promos (Pmo-P2).
                        if has_year_mismatch(o_set, candidate["ref"].get("Name", "")):
                            continue

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
