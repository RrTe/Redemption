import csv
import json
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from datetime import datetime
from mappings.pipeline_constants import OT_BOOKS, NT_BOOKS, GOSPEL_BOOKS, BASE_ALIGNMENT_MAP, DA_TYPES

# Configuration
DATA_DIR = Path("data")
INPUT_FILE = DATA_DIR / "carddata.txt"
OUTPUT_FILE = DATA_DIR / "carddata.json"

def clean_text(text: str) -> str:
    """Replaces smart quotes and other problematic characters."""
    if not text:
        return ""
    # Smart quotes and other replacements
    text = text.replace("’", "'")
    text = text.replace("“", "\"")
    text = text.replace("”", "\"")
    return text.strip()

def clean_image_name(image_name: str) -> str:
    """Removes the .jpg and other common extensions from the image name."""
    if not image_name:
        return ""
    for suffix in [".jpg", ".png", ".gif", ".jpeg"]:
        if image_name.lower().endswith(suffix):
            return image_name[: -len(suffix)]
    return image_name

def determine_testament(reference: str) -> str:
    """Determines the testament based on the reference book."""
    if not reference:
        return "UNKNOWN"
    
    ref_lower = reference.lower()
    for book in OT_BOOKS:
        if book.lower() in ref_lower:
            return "OT"
    for book in NT_BOOKS:
        if book.lower() in ref_lower:
            return "NT"
    
    return "UNKNOWN"

def determine_alignment(card_type: str, original_alignment: str) -> str:
    """Determines the alignment based on the card type and original alignment."""
    # Split types for multi-type cards
    types = [t.strip() for t in card_type.split("/")]
    
    # Check for DA types
    if any(da in card_type for da in DA_TYPES) or "DA-Dominant" in card_type:
        return "Good/Evil"
    
    # Gather alignments for all types
    alignments = []
    
    for t in types:
        base = BASE_ALIGNMENT_MAP.get(t)
        if base:
            alignments.append(base)
        elif t == "Dominant" or t == "Fortress":
            # Use original alignment as fallback for these types
            if original_alignment:
                alignments.append(original_alignment)
        elif "City" in t:
             alignments.append("Neutral") # Base for City
    
    # special case for combinations like Site/Hero
    if "Site" in types and "Hero" in types:
        return "Neutral/Good"

    # Add original alignment if we have nothing or for safety
    if not alignments and original_alignment:
        alignments.append(original_alignment)
    
    # Deduplicate and format
    unique_alignments = []
    # Preserve order: Neutral, Good, Evil (common convention)
    for a in ["Neutral", "Good", "Evil"]:
        if any(a in item for item in alignments):
            unique_alignments.append(a)
    
    # Special concatenation if multiple unique ones found
    if len(unique_alignments) > 1:
        return "/".join(unique_alignments)
    elif unique_alignments:
        return unique_alignments[0]
    
    return original_alignment

def process_csv():
    """Processes the input CSV and creates the extended JSON."""
    if not INPUT_FILE.exists():
        print(f"Error: {INPUT_FILE} not found.")
        return

    cards = []
    unmapped_types = set()

    print(f"Processing {INPUT_FILE}...")
    
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        
        for row in reader:
            # 1. Clean basic fields
            name = clean_text(row.get("Name", ""))
            card_type = row.get("Type", "")
            original_alignment = row.get("Alignment", "")
            reference = clean_text(row.get("Reference", ""))
            
            # 2. Cleanup image name
            image_file = clean_image_name(row.get("ImageFile", ""))
            
            # 3. Determine new properties
            is_character = any(keyword in card_type for keyword in ["Hero", "Evil Character", "DAC"])
            is_enhancement = any(keyword in card_type for keyword in ["GE", "EE", "DAE", "Covenant", "Curse"])
            is_gospel = any(book.lower() in reference.lower() for book in GOSPEL_BOOKS)
            testament = determine_testament(reference)
            
            # 4. Alignment specialized logic
            alignment = determine_alignment(card_type, original_alignment)
            
            # Log unknown types for the report
            types = [t.strip() for t in card_type.split("/")]
            for t in types:
                if t not in BASE_ALIGNMENT_MAP and t not in ["Dominant", "Fortress", "City"]:
                    unmapped_types.add(t)

            # 5. Build the object
            card = {
                "Name": name,
                "Set": row.get("Set", ""),
                "ImageFile": image_file,
                "OfficialSet": row.get("OfficialSet", ""),
                "Type": card_type,
                "Brigade": row.get("Brigade", ""),
                "Strength": row.get("Strength", ""),
                "Toughness": row.get("Toughness", ""),
                "Class": row.get("Class", ""),
                "Identifier": row.get("Identifier", ""),
                "SpecialAbility": clean_text(row.get("SpecialAbility", "")),
                "Rarity": row.get("Rarity", ""),
                "Reference": reference,
                "Sound": row.get("Sound", ""),
                "Alignment": alignment,
                "Legality": row.get("Legality", ""),
                "IsCharacter": is_character,
                "IsEnhancement": is_enhancement,
                "IsGospel": is_gospel,
                "Testament": testament
            }
            cards.append(card)

    # Save to JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"cards": cards}, f, indent=2, ensure_ascii=False)

    print(f"Successfully processed {len(cards)} cards.")
    if unmapped_types:
        print(f"Warning: Found unmapped types: {list(unmapped_types)}")

if __name__ == "__main__":
    process_csv()
