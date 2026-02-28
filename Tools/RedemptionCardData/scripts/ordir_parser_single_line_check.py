import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import re
from collections import defaultdict
from config import LOG_ORDIR_STRUCTURE
from card_utils import normalize, safe_keys
from mappings.ordir_categories import ORDIR_CATEGORIES

def is_marker(line):
    """
    Robust marker detection:
    - Accepts 'the following redemption' OR just 'following redemption' to tolerate broken lines.
    - Requires one of the qualifying phrases.
    """
    line = normalize(line.lower())
    has_following = ("the following redemption" in line) or ("following redemption" in line)
    has_qualifier = (
        " are " in line or " is " in line or " from " in line or
        "are from" in line or "refer to" in line or "depict" in line or
        "relate to" in line or "represent" in line or "have" in line or
        "in the title" in line
    )
    return has_following and has_qualifier

def is_reference_marker(line):
    line = normalize(line.lower())
    if "refer to" in line or "relate to" in line:
        return True
    # Ausschlüsse nur anwenden, wenn kein Referenzmarker drin ist
    if ("have" in line or "in the title" in line or " are " in line or " is " in line or
        "are from" in line or " from " in line or "depict" in line or "represent" in line):
        return False
    return False

def is_bullet(line):
    return bool(line.strip().startswith(("•", "·", "\u2022")))

def parse_card_line(line):
    from config import LOG_PARSE_CARD_LINE, LOG_UNKNOWN_SETS
    from card_utils import extract_set_variants

    results = []
    # Remove leading bullet and role prefix like "(Hero): "
    line = re.sub(r"^[•·\u2022]\s*\([^)]+\):\s*", "", line).strip()
    # Remove bare bullet
    line = re.sub(r"^[•·\u2022]\s*", "", line).strip()

    # Split multiple cards in one bullet:
    #  - ') and ' between cards
    #  - '),' between cards
    line = re.sub(r"\)\s+and\s+", ")|", line)
    line = re.sub(r"\),\s+", ")|", line)
    parts = line.split("|")

    for part in parts:
        part = part.strip()
        # Drop optional bracketed notes [ ... ]
        part = re.sub(r"\s*\[[^\]]+\]", "", part)
        match = re.match(r"(.+?)\s*\(([^)]+)\)\s*$", part)
        if match:
            raw_name = match.group(1).strip()
            raw_sets = match.group(2).replace(" and ", ",")
            sets = [s.strip() for s in raw_sets.split(",") if s.strip()]
            for s in sets:
                results.append((raw_name, s))
        elif LOG_PARSE_CARD_LINE:
            print(f"❌ Kein Karten-Match: {repr(part)}")

    return results

def extract_cards_from_block(block_lines):
    results = []
    current_line = ""
    for line in block_lines:
        if is_bullet(line):
            if current_line:
                results.extend(parse_card_line(current_line))
            current_line = line
        else:
            current_line += " " + line
    if current_line:
        results.extend(parse_card_line(current_line))
    return results

def _coalesce_marker_lines(lines, start_idx, category_set):
    """
    Combine broken marker lines like:
      'The' on one line and 'following Redemption® ...' on the next.
    Returns (combined_marker, next_index_after_marker_line)
    """
    i = start_idx
    marker_line = normalize(lines[i])
    # If current line alone isn't a marker, try combining with following short fragments
    if not is_marker(marker_line):
        # Lookahead: if next line exists and contains 'following redemption', combine
        if i + 1 < len(lines):
            next_line = normalize(lines[i + 1])
            combined = normalize((lines[i] + " " + lines[i + 1]))
            if ("following redemption" in next_line.lower()) or is_marker(combined):
                marker_line = combined
                i += 1  # consume the next line as part of marker
    return marker_line, i + 1

def parse_ordir(ordir_path):
    with ordir_path.open(encoding="utf-8") as f:
        # Keep original raw lines (strip only trailing/leading spaces, skip empties)
        lines = [line.strip() for line in f if line.strip()]

    category_map = defaultdict(set)
    reference_map = defaultdict(set)
    category_set = set(ORDIR_CATEGORIES)

    i = 0
    while i < len(lines):
        line = normalize(lines[i])
        if line in category_set:
            current_category = line
            if LOG_ORDIR_STRUCTURE:
                print(f"\n📘 Neue Kategorie erkannt: {current_category}")
            i += 1

            while i < len(lines):
                # Stop if next category starts
                candidate = normalize(lines[i])
                if candidate in category_set:
                    break

                # Try to coalesce marker lines before testing
                marker, next_i = _coalesce_marker_lines(lines, i, category_set)

                if is_marker(marker):
                    is_reference = is_reference_marker(marker)
                    if LOG_ORDIR_STRUCTURE:
                        print(f"   🔎 Marker erfasst: {repr(marker)} | is_reference={is_reference}")
                    i = next_i

                    # Collect block lines until next marker/category/bullet structure
                    block_lines = []
                    while i < len(lines):
                        line = lines[i]
                        if is_bullet(line):
                            current_line = line
                            i += 1
                            while i < len(lines):
                                next_line = lines[i]
                                # Stop on single capital letter headings (e.g., role headers)
                                if re.match(r"^[A-Z]$", next_line.strip()):
                                    break
                                if is_bullet(next_line) or is_marker(normalize(next_line)) or normalize(next_line) in category_set:
                                    break
                                current_line += " " + next_line
                                i += 1
                            block_lines.append(current_line)
                        else:
                            # stop if we hit a new marker or category
                            norm = normalize(line)
                            if is_marker(norm) or norm in category_set:
                                break
                            i += 1

                    cards = extract_cards_from_block(block_lines)
                    if LOG_ORDIR_STRUCTURE:
                        for raw_name, raw_set in cards:
                            print(f"   → Extrahierte Karte: '{raw_name}' [{raw_set}]")

                    target = reference_map if is_reference else category_map
                    for raw_name, raw_set in cards:
                        for key in safe_keys(raw_name, raw_set):
                            target[key].add(current_category)
                            if LOG_ORDIR_STRUCTURE:
                                dest = "reference_map" if is_reference else "category_map"
                                print(f"   🔑 Eingefügt ({dest}): {key}")

                elif is_bullet(lines[i]):
                    # Collect contiguous bullet block
                    block_lines = []
                    while i < len(lines):
                        line = lines[i]
                        if is_bullet(line):
                            current_line = line
                            i += 1
                            while i < len(lines):
                                next_line = lines[i]
                                if re.match(r"^[A-Z]$", next_line.strip()):
                                    break
                                if is_bullet(next_line) or is_marker(normalize(next_line)) or normalize(next_line) in category_set:
                                    break
                                current_line += " " + next_line
                                i += 1
                            block_lines.append(current_line)
                        else:
                            norm = normalize(line)
                            if is_marker(norm) or norm in category_set:
                                break
                            i += 1

                    cards = extract_cards_from_block(block_lines)
                    for raw_name, raw_set in cards:
                        for key in safe_keys(raw_name, raw_set):
                            category_map[key].add(current_category)
                            if LOG_ORDIR_STRUCTURE:
                                print(f"   🔑 Eingefügt (category_map): {key}")
                else:
                    i += 1
        else:
            i += 1

    if LOG_ORDIR_STRUCTURE:
        print("\n🔑 category_map Keys:")
        for key in category_map.keys():
            print("   ", key)
        print("\n🔑 reference_map Keys:")
        for key in reference_map.keys():
            print("   ", key)

    return category_map, reference_map
