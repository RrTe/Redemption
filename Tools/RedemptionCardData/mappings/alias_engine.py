import re
from mappings.set_alias import SET_ALIAS

def normalize_name(name: str) -> str:
    """
    Strips trailing periods, condenses spaces, standardizes quotes.
    Crucially, it DOES NOT strip brackets or articles. It preserves the unique name structure.
    """
    if not name:
        return ""
    # Standardize quotes
    name = name.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    
    # Optional: lowercase for matching
    name = name.lower()
    
    # Remove trailing/leading spaces and punctuation edge cases
    name = re.sub(r'[\r\n\t]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    # Remove weird trailing periods or commas
    name = re.sub(r'[.,;:]+$', '', name)
    
    # Standardize parentheses: If a name has an open paren but no close paren, or vice versa,
    # normalize to NO parentheses or fix THEM.
    # Actually, the most robust way is to strip trailing/extra parens for matching.
    name = name.replace("(", " ").replace(")", " ")
    
    # Remove trailing stray integers that ORDIR uses for footnotes (e.g. "Daniel 27" -> "Daniel")
    name = re.sub(r'\s+\d+$', '', name)
    
    # Final cleanup
    name = re.sub(r'\s+', ' ', name).strip()
    
    return name

def extract_all_raw_sets_from_card(card_data: dict) -> list[str]:
    """
    Extracts all set strings assigned to the JSON card dict.
    Returns something like ["Pmo-P1", "P-2016", "Main"]
    """
    raw_set_str = str(card_data.get("Set", ""))
    
    
    parts = re.split(r"[\/,\s]+", raw_set_str)
    
    # We ALSO want to extract sets that are hidden in the card's Name property (e.g. "Barnabas (B)")
    raw_name = card_data.get("Name", "")
    # Check if the name ends with a parenthesis
    match = re.search(r"\(([^)]+)\)$", raw_name.strip())
    if match:
        parts.append(match.group(1))
        
    # [NEW] If the card is marked as a Promo, add "P" to sets automatically
    official_set = str(card_data.get("OfficialSet", "")).lower()
    rarity = str(card_data.get("Rarity", "")).lower()
    if "promo" in official_set or "promo" in rarity:
        parts.append("P")
        
    return [p.strip() for p in parts if p.strip()]

def get_aliased_sets(raw_sets: list[str]) -> set[str]:
    """
    Takes a list of raw sets from JSON ["Pmo-P1", "RoJ"]
    Returns a unified set [] of underlying sets ["P", "P-2019", "RJ", "RoJ-AB"] based on the SET_ALIAS map.
    """
    aliased = set()
    for rs in raw_sets:
        # Strip brackets from raw set code if they somehow exist
        rs = re.sub(r'[\[\]\(\)]', '', rs).strip()
        # Normalization for set aliases:
        # 1. Standardize hyphens (remove spaces around them: "CW - Alt" -> "CW-Alt")
        rs_norm = re.sub(r'\s*-\s*', '-', rs)
        
        aliased.add(rs_norm)
        
        # Try finding in SET_ALIAS (exact match first)
        val = SET_ALIAS.get(rs_norm)
        
        # Fallback: case-insensitive match for the key if exact fails
        if not val:
            rs_lower = rs_norm.lower()
            for k, v in SET_ALIAS.items():
                if k.lower() == rs_lower:
                    val = v
                    break
        
        if val:
            if isinstance(val, list):
                aliased.update(val)
            else:
                aliased.add(val)
                
    return aliased

def sets_intersect(ordir_set: str, json_sets: list[str]) -> bool:
    """
    Checks if the targeted ORDIR set intersects at all with the card's aliased sets.
    """
    aliased_json_sets = get_aliased_sets(json_sets)
    
    # The ordir_set string may also be an alias or multiple sets.
    # Eg: "Ki, PoC"
    ordir_parts = [p.strip() for p in ordir_set.split(",") if p.strip()]
    ordir_aliased_sets = get_aliased_sets(ordir_parts)
    
    # Check intersection
    return bool(aliased_json_sets.intersection(ordir_aliased_sets))

RARITY_MAP = {
    "LR": ["Legacy Rare"],
    "UR": ["Ultra Rare", "Ultra-Rare"],
    "PR": ["Promo"],
    "R": ["Rare", "R"],
    "C": ["Common"],
    "U": ["Uncommon"]
}

def rarity_intersect(ordir_set: str, card_data: dict) -> bool:
    """
    Checks if one of the abbreviations in the ORDIR (often mistaken for Sets) is actually
    a Rarity that matches the JSON card_data's Rarity.
    """
    card_rarity = card_data.get("Rarity", "")
    if not card_rarity:
        return False
        
    ordir_parts = [p.strip() for p in ordir_set.split(",") if p.strip()]
    for p in ordir_parts:
        p = re.sub(r'[\[\]\(\)]', '', p).strip()
        
        valid_rarities = RARITY_MAP.get(p, [])
        for vr in valid_rarities:
            if vr.lower() == card_rarity.lower():
                return True
                
    return False
