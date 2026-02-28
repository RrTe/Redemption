# test_meta.py im scripts/
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from models.meta import Meta

meta = Meta()
print(meta)
