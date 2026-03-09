from pathlib import Path

ORDIR_TEXT = Path("data/ORDIR_PDF_6.0.0.txt")
EXTENDED_CARDS = Path("data/cards_extended_samples.json")
CATEGORY_FILE = Path("mappings/ordir_card_entries.py")
REFERENCE_FILE = Path("../mappings/ordir_reference_entries.py")
CARDDATA_MAPPING_FILE = Path("../mappings/ordir_carddata_mapping.py")

LOG_PARSE_CARD_LINE = True
LOG_UNKNOWN_SETS = False
LOG_VALIDATION_KEYS = True
LOG_SET_VARIANTS = False
LOG_NOT_FOUND = True
LOG_ORDIR_STRUCTURE = False