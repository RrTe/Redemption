import json
import os
from typing import Set, List
from scripts.core.constants.bible_terms import BIBLICAL_CHARACTERS, REDEMPTION_ABBREVIATIONS
from scripts.core.constants.judges import OFFICIAL_JUDGES_LOWER

def load_card_names(filepath: str) -> Set[str]:
    """
    Load all unique card names from the carddata.json file.
    
    Args:
        filepath: Absolute path to the JSON file.
        
    Returns:
        A set of unique card names in lowercase.
    """
    card_names = set()
    if not os.path.exists(filepath):
        print(f"Warning: Card data not found at {filepath}")
        return card_names

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        for card in data.get("cards", []):
            name = card.get("Name", "").strip()
            if name:
                card_names.add(name.lower())
                # Also add name without parentheses suffix (e.g. "Noah's Ark")
                if "(" in name:
                    base_name = name.split("(")[0].strip()
                    if base_name:
                        card_names.add(base_name.lower())
                        
    return card_names

def get_protective_shield(card_data_path: str) -> Set[str]:
    """
    Combine all terms that should NOT be anonymized.
    
    Args:
        card_data_path: Path to the carddata.json file.
        
    Returns:
        A set of strings in lowercase to be protected.
    """
    shield = set()
    
    # 1. Biblical Characters
    shield.update(BIBLICAL_CHARACTERS)
    
    # 2. TCG Abbreviations
    shield.update(REDEMPTION_ABBREVIATIONS)
    
    # 3. Card Names
    shield.update(load_card_names(card_data_path))
    
    # 4. Common Game Terms (additional)
    shield.update({"battle", "territory", "hand", "discard", "deck", "reserve", "ruling", "judge"})
    
    return shield

def get_official_judges() -> Set[str]:
    """
    Return the set of official judge nicknames.
    """
    return OFFICIAL_JUDGES_LOWER
