import json
import os

def brute_force_cleanup(filepath, leaks):
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found.")
        return
        
    print(f"Brute-force cleanup of {filepath} for leaks: {leaks}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    for leak, replacement in leaks.items():
        original_len = len(content)
        # Case-insensitive replacement
        import re
        content = re.sub(re.escape(leak), replacement, content, flags=re.IGNORECASE)
        print(f"  - Replaced '{leak}' with '{replacement}'. Diff: {len(content) - original_len}")
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Cleanup finished.")

if __name__ == "__main__":
    # We map the persistent leaks to their corresponding IDs found in trials
    # Aggie is usually JUDGE_001 in our current run mapping
    replacements = {
        "redemptionaggie": "JUDGE_001",
        "cthetree": "USER_PII",
        "aggie": "JUDGE_001"
    }
    brute_force_cleanup("ragdata/processed_rulings_final.json", replacements)
