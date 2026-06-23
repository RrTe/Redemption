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
                if "multi" in content.lower():
                    print(f"Found 'multi' in {path}")
                    # Print lines containing 'multi'
                    lines = content.splitlines()
                    for i, line in enumerate(lines):
                        if "multi" in line.lower():
                            print(f"  {i+1}: {line}")
            except Exception as e:
                pass
