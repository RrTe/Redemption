import requests
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

# Load config from config.json
import json
BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

RAW_URL = _config["carddata_url"]
OUTPUT_FILE = BASE_DIR / _config["carddata_txt"]
DATA_DIR = OUTPUT_FILE.parent

def download_carddata():
    """
    Downloads the carddata.txt file from GitHub Lackey repository.
    """
    print(f"Downloading card data from {RAW_URL}...")
    
    try:
        # Create data directory if it doesn't exist
        DATA_DIR.mkdir(exist_ok=True)
        
        response = requests.get(RAW_URL, timeout=30)
        response.raise_for_status()
        
        # Ensure the content is UTF-8 (it usually is on GitHub)
        content = response.text
        
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Successfully downloaded and saved to {OUTPUT_FILE}")
        print(f"Size: {len(content)} characters")
        
    except requests.exceptions.RequestException as e:
        print(f"Error downloading file: {e}")
        exit(1)

if __name__ == "__main__":
    download_carddata()
