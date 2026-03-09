import json
import sys
from pathlib import Path

# Setup paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "cards_extended.json"

def search():
    with DATA_FILE.open("r", encoding="utf-8", errors="ignore") as f:
        data = json.load(f)["cards"]
    
    for c in data:
        name = c.get("Name", "")
        if "seeker" in name.lower() or "nicodemus" in name.lower():
            print(f"Name: {name}, Set: {c.get('Set')}")
        elif "famine" in name.lower():
            print(f"Name: {name}, Set: {c.get('Set')}")
        elif "amram" in name.lower() or "jochebed" in name.lower() or "parents" in name.lower():
             if "moses" in name.lower():
                print(f"Name: {name}, Set: {c.get('Set')}")

if __name__ == "__main__":
    search()
