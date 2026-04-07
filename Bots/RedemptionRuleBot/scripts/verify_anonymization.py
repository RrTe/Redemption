import json
import re
from typing import Set

def get_original_names(log_filepath: str) -> Set[str]:
    """Extract all names from log headers."""
    names = set()
    header_pattern = re.compile(r'^\[\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}\]\s(.*)$')
    with open(log_filepath, 'r', encoding='utf-8') as f:
        for line in f:
            match = header_pattern.match(line)
            if match:
                names.add(match.group(1).strip())
    return names

def check_leaks(processed_filepath: str, original_names: Set[str], shield: Set[str]):
    """Check if any original name is present in the processed file."""
    with open(processed_filepath, 'r', encoding='utf-8') as f:
        content = f.read().lower()
        
    leaks = []
    for name in original_names:
        # Skip if name is protected (e.g. "Moses")
        if name.lower() in shield:
            continue
            
        if name.lower() in content:
            leaks.append(name)
            
    return leaks

if __name__ == "__main__":
    # Example usage for manual verification
    from scripts.utils.data_loader import get_protective_shield
    
    # Final Paths for 10MB check
    source_file = "data/DiscordRulings.txt"
    output_file = "ragdata/processed_rulings_final.json"
    card_data = "ragdata/carddata.json"
    
    print(f"Running Leak-Check: {source_file} -> {output_file}")
    
    shield = get_protective_shield(card_data)
    names = get_original_names(source_file)
    leaks = check_leaks(output_file, names, shield)
    
    if leaks:
        print(f"CRITICAL: Found {len(leaks)} potential name leaks: {leaks[:10]}")
    else:
        print("SUCCESS: No name leaks found in the processed data.")
