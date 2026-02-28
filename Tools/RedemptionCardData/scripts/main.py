import sys
import io

# === UTF-8 Ausgabe aktivieren ===
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from config import ORDIR_TEXT, EXTENDED_CARDS
from ordir_parser import parse_ordir
from card_validator import validate_cards
from mapping_writer import write_mappings

if __name__ == "__main__":
    category_map, reference_map = parse_ordir(ORDIR_TEXT)
    verbose_entries = validate_cards(EXTENDED_CARDS, category_map)
    write_mappings(category_map, reference_map, verbose_entries)
