import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from config import CATEGORY_FILE, REFERENCE_FILE, CARDDATA_MAPPING_FILE

def write_mappings(category_map, reference_map, verbose_entries):
    with CATEGORY_FILE.open("w", encoding="utf-8") as f:
        f.write("# ORDIR card-to-category mapping\n")
        f.write("ORDIR_CARD_ENTRIES = {\n")
        for (name, set_code), categories in sorted(category_map.items()):
            cat_list = ", ".join(f'"{c}"' for c in sorted(categories))
            f.write(f'    ("{name}", "{set_code}"): [{cat_list}],\n')
        f.write("}\n")

    with REFERENCE_FILE.open("w", encoding="utf-8") as f:
        f.write("# ORDIR reference mapping\n")
        f.write("ORDIR_REFERENCE_ENTRIES = {\n")
        for (name, set_code), categories in sorted(reference_map.items()):
            cat_list = ", ".join(f'"{c}"' for c in sorted(categories))
            f.write(f'    ("{name}", "{set_code}"): [{cat_list}],\n')
        f.write("}\n")

    with CARDDATA_MAPPING_FILE.open("w", encoding="utf-8") as f:
        f.write("# ORDIR mapping with original card names, sets and categories\n")
        f.write("ORDIR_CARDDATA_MAPPING = [\n")
        for entry in verbose_entries:
            f.write("    {\n")
            f.write(f'        "card_name": {repr(entry["card_name"])},\n')
            f.write(f'        "ordir_name": {repr(entry["ordir_name"])},\n')
            f.write(f'        "card_set": {repr(entry["card_set"])},\n')
            f.write(f'        "ordir_set": {repr(entry["ordir_set"]) if entry["ordir_set"] else "None"},\n')
            f.write(f'        "categories": {entry["categories"]},\n')
            f.write("    },\n")
        f.write("]\n")

    print(f"\n✅ Strukturierte Kartendaten geschrieben nach: {CARDDATA_MAPPING_FILE}")
    print(f"📦 Gesamtzahl der Einträge: {len(verbose_entries)}")
