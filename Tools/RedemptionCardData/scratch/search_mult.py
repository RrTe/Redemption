import os
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent

for root, dirs, files in os.walk(base_dir):
    if ".venv" in root or ".git" in root:
        continue
    for file in files:
        if file.endswith(".py"):
            path = Path(root) / file
            try:
                content = path.read_text(encoding="utf-8")
                # Look for "Mult" but not "Multi"
                # e.g., using regex to find "Mult" as a whole word, or just substring "Mult"
                import re
                matches = re.findall(r'\bMult\b', content)
                if matches:
                    print(f"Found whole word 'Mult' in {path}")
                    lines = content.splitlines()
                    for i, line in enumerate(lines):
                        if re.search(r'\bMult\b', line):
                            print(f"  {i+1}: {line}")
            except Exception as e:
                pass
