"""
Pipeline 03: Deterministic Verifier

Purpose:
Provides 5 deterministic "Safety Nets" to catch logical errors made by the fuzzy mapping.
It scans the mapped JSON file and flags cards that violate absolute ORDIR rules.

Checks Performed:
1. Herod's Temple Mismatch (Hardcoded Edge Case)
2. Alignment Check (Good vs Evil mismatches)
3. XML Card Type checks (Artifacts in Sites, etc.)
4. High-Category Anomaly (Card in >10 categories)
5. Category Reverse Logic (e.g. Jesus in 'Genesis Hero' category without referencing Genesis)

Outputs:
data/verification_report.log -> A human-readable text file containing all suspicious matches for manual/LLM review.
"""
import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
LOG_FILE = BASE_DIR / "data" / "verification_report.log"

def verify():
    """
    Performs deterministic sanity checks on the fuzzy-mapped JSON file.
    
    The fuzzy matcher relies heavily on name and set similarity. This verification step
    acts as a safety net, ensuring that the mapped cards align logically with the 
    assigned categories (e.g., Heroes don't end up in Evil categories, Artifacts don't
    end up in Site categories).
    """
    with DATA_FILE.open("r", encoding="utf-8", errors="ignore") as f:
        data = json.load(f)["cards"]
    
    suspicious = []
    
    # Check 1: Herod's Temple Mismatch 
    # Hardcoded check for a known edge case where Herod's Temple is mistaken for "Herod in the Title"
    for c in data:
        name = c.get("Name", "")
        ordir = c.get("ORDIR", [])
        if "Herod's Temple" in name and "Herod in the Title" in str(ordir):
            suspicious.append(f"Herod Mismatch: {name} found in category 'Herod in the Title'")

    # Check 2: Expanded Deterministic Checks (Alignment and Types)
    # Note for future developers: If you need to enforce strict rules (e.g., "Isaiah Cards MUST have 
    # reference to Isaiah"), add them here. However, the fuzzy matcher currently parses the precise
    # list of cards provided by the ORDIR, which makes secondary metadata validation largely redundant,
    # except for catching severe false positives.
    for c in data:
        alignment = c.get("Alignment", "")
        ordir = c.get("ORDIR", [])
        name = c.get("Name", "")
        types = [t.lower() for t in c.get("CardTypes", [])]
        
        for cat in ordir:
            cat_lower = cat.lower()
            
            # 1. Alignment checks
            if alignment == "Good" and "evil" in cat_lower and "hero" not in cat_lower:
                suspicious.append(f"Alignment Mismatch: Good card '{name}' in Evil category '{cat}'")
            if alignment == "Evil" and re.search(r"\bhero\b", cat_lower):
                suspicious.append(f"Alignment Mismatch: Evil Character '{name}' in Hero category '{cat}'")
                
            # 2. CardType specific checks
            if "artifact" in cat_lower and "artifact" not in types:
                if "tabernacle" not in cat_lower: # special exception where people might count other things
                    suspicious.append(f"Type Mismatch: '{name}' in Artifact category '{cat}' but is not an Artifact")
                    
            if "site" in cat_lower and "site" not in types:
                suspicious.append(f"Type Mismatch: '{name}' in Site category '{cat}' but is not a Site")
                
            if "fortress" in cat_lower and "fortress" not in types:
                suspicious.append(f"Type Mismatch: '{name}' in Fortress category '{cat}' but is not a Fortress")
                
            if "curse" in cat_lower and "curse" not in types:
                suspicious.append(f"Type Mismatch: '{name}' in Curse category '{cat}' but is not a Curse")
                
            if "covenant" in cat_lower and "covenant" not in types:
                suspicious.append(f"Type Mismatch: '{name}' in Covenant category '{cat}' but is not a Covenant")
                
            if "lost soul" in cat_lower and "lost soul" not in types:
                suspicious.append(f"Type Mismatch: '{name}' in Lost Soul category '{cat}' but is not a Lost Soul")

            # 3. Class checks
            if "cloud" in cat_lower:
                card_class = c.get("Class", "")
                if "cloud" not in card_class.lower():
                    suspicious.append(f"Class Mismatch: '{name}' in Cloud category '{cat}' but Class is '{card_class}'")
                    
            # 4. Nativity scope check
            if cat_lower == "nativity card":
                ref = c.get("Reference", "").lower()
                is_nativity = False
                # Matthew 1:18-25
                m_math = re.search(r'matthew\s+1[:\s](\d+)', ref)
                if m_math and 18 <= int(m_math.group(1)) <= 25:
                    is_nativity = True
                # Matthew 2
                if "matthew 2" in ref:
                    is_nativity = True
                # Luke 1-2
                if "luke 1" in ref or "luke 2" in ref:
                    is_nativity = True
                
                if not is_nativity:
                    suspicious.append(f"Nativity Mismatch: '{name}' in Nativity category but reference ({ref}) does not match Nativity scope.")

            # 5. Star card check
            if cat_lower == "star card":
                card_class = c.get("Class", "")
                if "star" not in card_class.lower():
                    suspicious.append(f"Class Mismatch: '{name}' in Star category but Class is '{card_class}'")

    # Check 3: The "High-Category Anomaly" (Ausreißer-Check)
    # If a card is mapped to an unusually high number of ORDIR categories (> 10), it's highly suspicious.
    for c in data:
        ordir = c.get("ORDIR", [])
        if len(ordir) > 10:
            suspicious.append(f"High-Category Anomaly: '{c.get('Name')}' is mapped to {len(ordir)} categories. Review recommended.")
            
    # Check 4: The "Duplicate Card" Check
    # Cards in "Duplicate Card" should ideally share a generic base name. This is a heuristic check.
    # We collect all duplicate cards, then group them by base name similarity.
    dup_cards = [c.get("Name") for c in data if "Duplicate Card" in c.get("ORDIR", [])]
    # We skip full duplicate processing here to keep it simple, but we can log if a specific type is weird.
    
    # Check 5: Category Reverse check & Length Difference (Subset Match Check)
    # We will do a generic subset check to see if the JSON name is wildly different in length 
    # from the typical category string it matched in ORDIR.
    # Since we don't have the original ORDIR string here, we will check if the Category Name
    # implies a required substring that the JSON card lacks.
    for c in data:
        ordir = c.get("ORDIR", [])
        name = c.get("Name", "")
        name_lower = name.lower()
        
        for cat in ordir:
            cat_lower = cat.lower()
            
            # Rule A: If the category is a "XYZ Card" (e.g. "Isaiah Card", "James Card"),
            # the card name MUST contain "XYZ" OR its Biblical Reference MUST contain "XYZ".
            if " card" in cat_lower and not any(x in cat_lower for x in ["duplicate", "star", "nativity", "cloud"]):
                prefix = cat_lower.split(" card")[0].strip()
                ref = c.get("Reference", "").lower()
                # Exclude generic terms like 'n.t.' or 'o.t.'
                if len(prefix) > 3 and prefix not in ["n.t.", "o.t."]:
                    
                    # Smart check for bible ranges (e.g., "genesis 37-50" or "acts 12")
                    m_pref = re.search(r'^([a-z0-9\s\.]+?)\s+(\d+)(?:-(\d+))?$', prefix)
                    
                    found_ref = False
                    if prefix in name_lower or prefix in ref:
                        found_ref = True
                    elif m_pref:
                        book = m_pref.group(1).strip()
                        start_chap = int(m_pref.group(2))
                        end_chap = int(m_pref.group(3)) if m_pref.group(3) else start_chap
                        
                        # Find all mentions of 'book chapter' in the reference
                        matches = re.findall(rf'{re.escape(book)}\s+(\d+)\b', ref)
                        for m in matches:
                            if start_chap <= int(m) <= end_chap:
                                found_ref = True
                                break
                                
                    if not found_ref:
                        suspicious.append(f"Category Reverse Anomaly: '{name}' is in '{cat}' but neither its name nor its reference ({ref}) satisfies '{prefix}'.")
                        
            # Rule B: Specific Book Checks (e.g. "Genesis 12-24 Hero")
            # If the category specifies a Bible book, the card's reference is highly expected to match.
            books = ["genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "samuel", "kings", "chronicles", "isaiah", "jeremiah", "luke", "john", "matthew", "mark", "acts", "romans", "revelation"]
            for b in books:
                if b in cat_lower:
                    ref = c.get("Reference", "").lower()
                    if b not in name_lower and b not in ref:
                        suspicious.append(f"Book Reference Mismatch: '{name}' is in '{cat}' but reference ({ref}) does not contain '{b}'.")

    with LOG_FILE.open("w", encoding="utf-8") as f:
        if not suspicious:
            f.write("No suspicious matches found during automated verification.\n")
            print("Verification Clean!")
        else:
            for s in suspicious:
                f.write(s + "\n")
            print(f"Found {len(suspicious)} suspicious matches. See {LOG_FILE.name}")

if __name__ == "__main__":
    verify()
