import subprocess
import sys
from pathlib import Path

def run_script(script_path: str):
    print(f"\n>>> Running {script_path}...")
    result = subprocess.run([sys.executable, script_path], check=True)
    if result.returncode != 0:
        print(f"!!! Error running {script_path}")
        sys.exit(1)

if __name__ == "__main__":
    scripts = [
        "scripts/01_download_data.py",
        "scripts/02_process_csv.py",
        "scripts/03_extend_cards.py",
        "scripts/04_extract_ordir.py",
        "scripts/05_map_ordir.py",
        "scripts/06_verify.py"
    ]
    
    print("Starting Redemption Card Pipeline (ORDIR Phase)...")
    try:
        for script in scripts:
            run_script(script)
        print("\nPipeline finished successfully!")
    except subprocess.CalledProcessError as e:
        print(f"\nPipeline failed at {e.cmd}")
        sys.exit(1)
