import requests
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

# Configuration
RAW_URL = "https://raw.githubusercontent.com/jalstad/RedemptionLackeyCCG/master/RedemptionQuick/sets/carddata.txt"
DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "carddata.txt"

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
