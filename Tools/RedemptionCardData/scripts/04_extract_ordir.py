"""
Pipeline 01: ORDIR Extractor

Purpose:
Extracts pure card data and associated sets from the chaotic text structure of the ORDIR PDF.
It ignores descriptive rules and only grabs actual lists of cards belonging to recognized categories.

Outputs:
data/ordir_extracted_raw.json -> Contains a dictionary mapping categories to lists of extracted card string data.
"""
import json
import re
from pathlib import Path
from collections import defaultdict

# Setup paths based on the current scripts directory
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Read configuration from config.json
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

ORDIR_FILE = BASE_DIR / _config["ordir_file"]
RAW_OUT_FILE = BASE_DIR / _config["ordir_extracted_raw"]

# Import valid ORDIR categories from mappings (we trust this list)
import sys
sys.path.append(str(BASE_DIR))
from mappings.ordir_categories import ORDIR_CATEGORIES

def clean_text(text: str) -> str:
    """
    Removes PDF artifacts and typographical noise while preserving exact punctuation and casing.
    This is critical because the fuzzy matcher later relies on relatively clean strings.
    
    Args:
        text (str): The raw string extracted from the PDF.
        
    Returns:
        str: The cleaned string with normalized quotes and dashes.
    """
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace("…", "...")
    # Condense multiple spaces into a single space
    return re.sub(r'\s+', ' ', text).strip()

CATEGORY_SET = set(clean_text(c) for c in ORDIR_CATEGORIES)

def is_bullet(line: str) -> bool:
    return line.startswith(("•", "·", "\u2022"))

def parse_card_lines(block: str) -> list[dict]:
    """
    Takes a full bullet block like:
    • (Good): Card A (Set 1), Card B (Set 2) and Card C (Set 3)
    Extracts each card name and its raw set string.
    """
    results = []
    
    # Strip bullet
    line = re.sub(r"^[•·\u2022]\s*", "", block).strip()
    # Strip optional Role/Alignment prefix like (Good):
    line = re.sub(r"^\([^)]+\):\s*", "", line).strip()
    
    # Split rules: ')' followed by 'and' or ','
    line = re.sub(r"\)\s+and\s+", ")|", line)
    line = re.sub(r"\)\s+or\s+", ")|", line)
    line = re.sub(r"\),\s+", ")|", line)
    
    parts = line.split("|")
    for part in parts:
        part = part.strip()
        if not part:
            continue
            
        # Robust regex to capture: Name, optional [Brackets], and mandatory (Sets)
        # We NO LONGER blindly strip [] beforehand.
        match = re.search(r'^([^\[\(\)]+?)\s*(?:\[([^\]]+)\])?\s*\(([^)]+)\)\s*$', part)
        
        if match:
            raw_name = match.group(1).strip()
            brackets = match.group(2).strip() if match.group(2) else ""
            raw_sets = match.group(3).strip()
            
            # Split Sets by comma or 'and'
            raw_sets_split = raw_sets.replace(" and ", ",")
            sets = [s.strip() for s in raw_sets_split.split(",") if s.strip()]
            for s in sets:
                results.append({
                    "card_name": raw_name,
                    "brackets": brackets,
                    "set": s,
                    "raw_string": part
                })
        else:
            # Fallback if no sets are found or malformed
            results.append({
                "card_name": part,
                "brackets": "",
                "set": "UNKNOWN",
                "raw_string": part
            })
            
    return results

def is_membership_marker(line: str) -> bool:
    """
    Determines if a line in the ORDIR PDF indicates the start of a list of cards that BELONG
    to the current category.
    
    This filter is crucial for avoiding 'false positive' extractions where the ORDIR is simply
    describing rules rather than listing cards.
    
    Args:
        line (str): The line of text to evaluate.
        
    Returns:
        bool: True if it's a membership marker, False otherwise.
    """
    l = clean_text(line.lower())
    
    # Strict check for the identifying marker or variations thereof
    if "the following" not in l: return False
    if "redemption" not in l and "card" not in l: return False
    
    # Avoid lines that say "The following cards refer to..." because those are reference lists,
    # not category membership lists.
    if "refer" in l or "relate" in l: return False
    
    # Positive membership indicators
    membership_keywords = [
        " are ", " is ", " from ", " represent ", " depict ", 
        " list of ", " have ", " identify ", " are listed ", 
        " can be ", " are considered ", " characters that ",
        " are members ", " belongs to "
    ]
    return any(x in l for x in membership_keywords)

def is_reference_marker(line: str) -> bool:
    """
    Determines if a line indicates a list of cards that REFER TO the category, but are not
    actually members of the category. We currently skip these lists.
    """
    l = line.lower()
    if "the following" not in l: return False
    return any(x in l for x in [" refer to ", " refers to ", " relate to "])

def clean_block_text(text: str) -> str:
    """
    Cleans a text block by removing stray digits (page numbers) that appear alone on lines.
    Also handles punctuation gore.
    """
    # Remove stray numbers (page numbers) like "34" or "60" that are separated by spaces
    words = text.split()
    cleaned_words = [w for w in words if not w.isdigit()]
    text = " ".join(cleaned_words)
    
    # Fix comma/paren spacing or debris
    text = text.replace("( ,", "(").replace(", )", ")").replace(", ,", ",")
    text = re.sub(r'\s*,\s*', ', ', text) # normalize comma spacing
    text = re.sub(r'\s+', ' ', text).strip()
    
    # DO NOT blindly close parentheses here if it's already complex.
    # We want to preserve the structure for James (half-brother of Jesus (Ap)
    # Actually, the James case is: "James (half-brother of Jesus (Ap)"
    # The last (Ap) is the set. The name is "James (half-brother of Jesus".
    return text

def parse_card_lines(block: str) -> list[dict]:
    """
    Takes a full bullet block.
    """
    results = []
    
    # Strip bullet
    line = re.sub(r"^[•·\u2022]\s*", "", block).strip()
    # Strip optional Role/Alignment prefix like (Good):
    line = re.sub(r"^\([^)]+\):\s*", "", line).strip()
    
    # Cleaning
    line = clean_block_text(line)
    
    # Split rules: ')' followed by 'and' or ','
    line = re.sub(r"\)\s+and\s+", ")|", line)
    line = re.sub(r"\)\s+or\s+", ")|", line)
    line = re.sub(r"\),\s+", ")|", line)
    
    parts = line.split("|")
    for part in parts:
        part = part.strip()
        if not part or len(part) < 3: # Skip noise
            continue
            
        # Robust parsing for Set and Card Name
        # Step 1: Find the LAST parenthesis block: "(Set, Set)"
        # We look for the last (...) at the end of the text part.
        # To handle nested parentheses like "James (half-brother of Jesus (Ap))", 
        # we look for the last closing parenthesis and its most immediate preceding opening parenthesis.
        match_all_parens = list(re.finditer(r'\(\s*([^()]+)\s*\)', part))
        if not match_all_parens:
             # Fallback if the string is malformed and has no set parentheses
             results.append({"card_name": part, "brackets": "", "set": "UNKNOWN", "raw_string": part})
             continue
             
        set_match = match_all_parens[-1] # Take the LAST parenthesis match
        raw_sets = set_match.group(1)
        
        # Step 2: Everything before the last parenthesis is considered the card name (and optional brackets)
        pre_set = part[:set_match.start()].strip()
        
        # 3. Handle optional brackets [...]
        bracket_match = re.search(r'\[([^\]]+)\]\s*$', pre_set)
        if bracket_match:
            brackets = bracket_match.group(1)
            raw_name = pre_set[:bracket_match.start()].strip()
        else:
            brackets = ""
            raw_name = pre_set

        # Noise Filter: If raw_name is too long or contains "If the title", skips
        if len(raw_name) > 100 or "refer to" in raw_name.lower() or ":" in raw_name:
            continue
            
        # Split Identities by '/' if it's not a Lost Soul
        if "/" in raw_name and "lost soul" not in raw_name.lower():
            sub_names = [n.strip() for n in raw_name.split("/")]
        else:
            sub_names = [raw_name]
            
        # Split Sets by comma or 'and'
        raw_sets_split = raw_sets.replace(" and ", ",")
        sets = [s.strip() for s in raw_sets_split.split(",") if s.strip()]
        
        for name in sub_names:
            for s in sets:
                results.append({
                    "card_name": name,
                    "brackets": brackets,
                    "set": s,
                    "raw_string": part
                })
            
    return results

def extract_ordir():
    print(f"Reading ORDIR from {ORDIR_FILE}")
    with ORDIR_FILE.open("r", encoding="utf-8") as f:
        lines = [clean_text(line) for line in f if line.strip()]

    ordir_data = [] # List of dicts
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        if line in CATEGORY_SET:
            current_category = line
            i += 1
            
            extracted_cards = []
            extracting_enabled = False # Don't start until we hit a membership marker
            
            # Read until the next category
            while i < len(lines):
                if lines[i] in CATEGORY_SET:
                    break
                
                # Create a 2-line window to catch markers that are split across lines 
                # (e.g. "The following Redemption cards\nrefer to...")
                window = lines[i]
                if i > 0 and not is_bullet(lines[i]) and not is_bullet(lines[i-1]):
                    window = lines[i-1] + " " + lines[i]
                
                # Check for markers
                if is_membership_marker(window):
                    extracting_enabled = True
                    i += 1
                    continue
                elif is_reference_marker(window):
                    extracting_enabled = False # Stop on "refer to"
                    i += 1
                    continue
                
                # If we hit a bullet, read the full block IF enabled
                if is_bullet(lines[i]):
                    if extracting_enabled:
                        block = lines[i]
                        i += 1
                        while i < len(lines):
                            # Same window check for breaking out of the block
                            break_window = lines[i]
                            if i > 0 and not is_bullet(lines[i]) and not is_bullet(lines[i-1]):
                                break_window = lines[i-1] + " " + lines[i]
                                
                            if is_bullet(lines[i]) or is_membership_marker(break_window) or is_reference_marker(break_window) or lines[i] in CATEGORY_SET or re.match(r"^[A-Z]$", lines[i]):
                                break
                            block += " " + lines[i]
                            i += 1
                        extracted_cards.extend(parse_card_lines(block))
                    else:
                        i += 1 # Skip definition bullets
                else:
                    i += 1
            
            if extracted_cards:
                ordir_data.append({
                    "category": current_category,
                    "cards": extracted_cards
                })
        else:
            i += 1

    # Generate flat dictionary for easy mapping
    print(f"Extracted {sum(len(c['cards']) for c in ordir_data)} total card references across {len(ordir_data)} categories.")
    
    with RAW_OUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(ordir_data, f, indent=4, ensure_ascii=False)
        
    print(f"Saved raw extraction to {RAW_OUT_FILE}")

if __name__ == "__main__":
    extract_ordir()
