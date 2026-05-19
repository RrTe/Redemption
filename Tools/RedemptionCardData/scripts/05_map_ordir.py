"""
Pipeline Stage 5: ORDIR Mapper (Registry-Based Architecture)

Purpose:
Maps ORDIR categories to card entries in the main database by building a
deduplicated middle-layer Unified Registry. This minimizes fuzzy iterations,
eliminates duplicate comparisons, and guarantees optimal mapping accuracy.

Inputs:
- data/ordir_extracted_raw.json (Extracted ORDIR database)
- data/cards_extended.json (Canonical database)

Outputs:
- data/cards_extended_with_ordir_fuzzy.json (Enriched database)
- data/unmatched_ordir_entries.log (Error logging for unmatched entries)
"""

import json
import re
import sys
from pathlib import Path
from thefuzz import process, fuzz

# Set up paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Read configuration from config.json
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as cf:
    config = json.load(cf)

ORDIR_RAW_FILE = BASE_DIR / config["ordir_extracted_raw"]
EXTENDED_CARDS = BASE_DIR / config["cards_file"]
OUT_FILE = BASE_DIR / config["cards_extended_with_ordir_fuzzy"]
UNMATCHED_LOG = BASE_DIR / config["unmatched_ordir_entries_log"]

# Add project root to sys.path
sys.path.append(str(BASE_DIR))
from mappings.alias_engine import (
    normalize_name,
    extract_all_raw_sets_from_card,
    sets_intersect,
    rarity_intersect,
    has_year_mismatch
)
from mappings.ordir_name_errata import GLOBAL_EXCEPTIONS
from mappings.special_ordir_overrides import SPECIAL_ORDIR_OVERRIDES


def load_data() -> tuple[list[dict], list[dict]]:
    """Loads input ORDIR extracted and extended card databases.

    Returns:
        tuple[list[dict], list[dict]]: The ORDIR data and the extended card list.
    """
    with ORDIR_RAW_FILE.open("r", encoding="utf-8") as f:
        ordir_data = json.load(f)

    with EXTENDED_CARDS.open("r", encoding="utf-8") as f:
        cards_data = json.load(f)["cards"]

    return ordir_data, cards_data


def build_card_lookup(cards_data: list[dict]) -> list[dict]:
    """Pre-processes and indexes the cards database.

    Creates both surgical and bare forms for matching, excluding tokens.

    Args:
        cards_data (list[dict]): Raw list of card dicts.

    Returns:
        list[dict]: Look-up list optimized for mapping.
    """
    lookup = []

    for c in cards_data:
        raw_name = c.get("Name", "")

        # Exclude tokens
        if "token" in raw_name.lower():
            continue

        names_to_test = [raw_name]

        # Handle split cards or multi-names
        if "/" in raw_name:
            names_to_test.extend([n.strip() for n in raw_name.split("/")])

        # Handle CardSides
        if "CardSides" in c and c["CardSides"]:
            for side_key, side_data in c["CardSides"].items():
                if isinstance(side_data, dict) and "Name" in side_data:
                    names_to_test.append(side_data["Name"])

        normalized_names = set()
        for name in names_to_test:
            # Form 1: Surgical stripping of print/year tags
            blocks = re.findall(r'[\(\[](.*?)[\)\]]', name)
            content_to_strip = []
            card_raw_sets = extract_all_raw_sets_from_card(c)

            for block in blocks:
                b_clean = block.strip()
                should_strip = False

                if b_clean in card_raw_sets:
                    should_strip = True

                if not should_strip:
                    parts = [p.strip() for p in b_clean.split(",")]
                    if len(parts) > 1 and all(
                        p in card_raw_sets
                        or re.match(r'^(199\d|20\d\d)$', p)
                        or p.lower() in [
                            "promo", "winner", "limited", "unlimited", "main",
                            "state", "regional", "national", "district",
                            "fundraiser", "rotation"
                        ]
                        for p in parts
                    ):
                        should_strip = True

                if not should_strip:
                    y_match = re.search(r'\b(199\d|20\d\d)\b', b_clean)
                    if y_match and int(y_match.group(1)) >= 1995:
                        should_strip = True

                if not should_strip:
                    metadata_terms = [
                        "promo", "winner", "limited", "unlimited", "main",
                        "state", "regional", "national", "district",
                        "fundraiser", "rotation"
                    ]
                    if any(t in b_clean.lower() for t in metadata_terms):
                        should_strip = True

                if should_strip:
                    content_to_strip.append(re.escape(block))

            n_surgical = name
            for cts in content_to_strip:
                n_surgical = re.sub(rf'[\(\[]\s*{cts}\s*[\)\]]', "", n_surgical)

            n_clean_surgical = normalize_name(
                GLOBAL_EXCEPTIONS.get(n_surgical.strip(), n_surgical.strip())
            )
            if n_clean_surgical:
                normalized_names.add(n_clean_surgical)

            # Form 2: Bare fallback (strip all brackets/parentheses)
            n_bare = re.sub(r"\([^)]*\)", "", name)
            n_bare = re.sub(r"\[[^\]]*\]", "", n_bare)
            n_clean_bare = normalize_name(
                GLOBAL_EXCEPTIONS.get(n_bare.strip(), n_bare.strip())
            )
            if n_clean_bare and n_clean_bare != n_clean_surgical:
                normalized_names.add(n_clean_bare)

        lookup.append({
            "original_name": raw_name,
            "normalized_names": list(normalized_names),
            "raw_sets": extract_all_raw_sets_from_card(c),
            "ref": c
        })

    return lookup


def map_ordir_to_cards():
    """Builds a Unified Registry of ORDIR cards and maps them deterministically

    or fuzzy to the database. Uses custom overrides from AI or manual errata.
    """
    ordir_data, cards_data = load_data()
    lookup = build_card_lookup(cards_data)

    # Initialize empty ORDIR arrays
    for c in cards_data:
        c["ORDIR"] = set()

    # Pre-build choice mapping for the database cards
    choice_map = {}
    fuzzy_choices = []
    for i, item in enumerate(lookup):
        for n in item["normalized_names"]:
            fuzzy_choices.append(n)
            if n not in choice_map:
                choice_map[n] = []
            choice_map[n].append(i)

    # Step 1: Build the Unified ORDIR Registry (Stage 1)
    print("Building ORDIR Unified Registry...", flush=True)
    registry = {}

    for category_block in ordir_data:
        cat_name = category_block["category"]
        for o_card in category_block["cards"]:
            o_name = o_card["card_name"]
            o_set = o_card["set"]
            o_brackets = o_card.get("brackets", "")

            search_name = o_name
            if o_brackets and (
                "lost soul" in o_name.lower() or "new covenant" in o_name.lower()
            ):
                search_name = f"{o_name} [{o_brackets}]"

            clean_o_name = normalize_name(
                GLOBAL_EXCEPTIONS.get(search_name, search_name)
            )

            # Registry unique identity defined by normalized name + set
            reg_key = (clean_o_name, o_set)
            if reg_key not in registry:
                registry[reg_key] = {
                    "original_name": o_name,
                    "search_name": search_name,
                    "set": o_set,
                    "categories": set(),
                    "raw_strings": set()
                }

            registry[reg_key]["categories"].add(cat_name)
            registry[reg_key]["raw_strings"].add(o_card["raw_string"])

    print(f"Registry created with {len(registry)} unique entities.")

    # Step 2: Map Registry entries to the cards database (Stage 2)
    print("Beginning Registry Mapping...", flush=True)
    unmatched = []
    mapped_count = 0
    total_refs = len(registry)
    processed_count = 0

    for reg_key, entity in registry.items():
        processed_count += 1
        if processed_count % 200 == 0:
            print(
                f"  Mapped {processed_count}/{total_refs} "
                f"({int(processed_count / total_refs * 100)}%)...",
                flush=True
            )

        clean_o_name, o_set = reg_key
        original_name = entity["original_name"]
        categories = entity["categories"]

        matched = False
        target_card_indices = []

        # --- A. Check Special Overrides first ---
        # Allow exact override by normalized name/set or original name/set
        matched_override_name = SPECIAL_ORDIR_OVERRIDES.get((clean_o_name, o_set)) or \
                                SPECIAL_ORDIR_OVERRIDES.get((original_name, o_set))

        if matched_override_name:
            if isinstance(matched_override_name, str):
                # Overrides point directly to a database canonical Name. Find it.
                for idx, candidate in enumerate(lookup):
                    if candidate["original_name"].lower() == matched_override_name.lower():
                        target_card_indices.append(idx)
                        matched = True
            elif isinstance(matched_override_name, dict):
                # Legacy dict override, let's treat the key as matching itself or let exact match handle it
                pass

        # --- B. Exact Match lookup in Database ---
        if not matched and clean_o_name in choice_map:
            candidate_indices = choice_map[clean_o_name]
            for idx in candidate_indices:
                candidate = lookup[idx]
                if sets_intersect(o_set, candidate["raw_sets"]) or rarity_intersect(o_set, candidate["ref"]):
                    if not has_year_mismatch(o_set, candidate["ref"].get("Name", "")):
                        target_card_indices.append(idx)
                        matched = True

        # --- C. Fuzzy Matching logic ---
        if not matched:
            best_matches = process.extractBests(
                clean_o_name, fuzzy_choices, scorer=fuzz.token_set_ratio,
                limit=100, score_cutoff=90
            )

            for match_str, score in best_matches:
                is_lost_soul = "lost soul" in clean_o_name.lower()
                sort_score = fuzz.token_sort_ratio(clean_o_name, match_str)

                # Require high token sort ratio for non-Lost-Soul cards to prevent subset matches
                if not is_lost_soul and sort_score < 80:
                    continue

                candidate_indices = choice_map[match_str]
                for idx in candidate_indices:
                    candidate = lookup[idx]

                    if o_set == "UNKNOWN" and score >= 98:
                        target_card_indices.append(idx)
                        matched = True
                        break

                    if sets_intersect(o_set, candidate["raw_sets"]) or rarity_intersect(o_set, candidate["ref"]):
                        if has_year_mismatch(o_set, candidate["ref"].get("Name", "")):
                            continue
                        target_card_indices.append(idx)
                        matched = True

        # Apply mapped categories to all matched database instances
        if matched and target_card_indices:
            for idx in target_card_indices:
                lookup[idx]["ref"]["ORDIR"].update(categories)
            mapped_count += 1
        else:
            # Log unmatched entity with metadata
            unmatched.append({
                "original_name": original_name,
                "target_name": clean_o_name,
                "target_set": o_set,
                "raw_strings": list(entity["raw_strings"]),
                "categories": list(categories)
            })

    # Convert sets to sorted lists for JSON serialization
    for c in cards_data:
        c["ORDIR"] = sorted(list(c["ORDIR"]))

    print(f"\nSuccessfully mapped {mapped_count} out of {total_refs} unique ORDIR entities.")
    print(f"Writing updated card data to {OUT_FILE}...")

    with OUT_FILE.open("w", encoding="utf-8") as f:
        json.dump({"cards": cards_data}, f, indent=4, ensure_ascii=False)

    # Write the unmatched registry report
    print(f"Writing {len(unmatched)} unmatched registry entries to {UNMATCHED_LOG}...")
    with UNMATCHED_LOG.open("w", encoding="utf-8") as f:
        for u in unmatched:
            f.write(f"Card: {u['target_name']} [{u['target_set']}] (Original: {u['original_name']})\n")
            f.write(f"Categories: {', '.join(u['categories'])}\n")
            for rs in u["raw_strings"]:
                f.write(f"Raw string: {rs}\n")
            f.write("-" * 40 + "\n")

    print("ORDIR Registry Matching Finished!")


if __name__ == "__main__":
    map_ordir_to_cards()
