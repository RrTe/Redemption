import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import json
from datetime import datetime
from models.card import Card
from models.card_side import CardSide
from utils.extend_types import expand_and_inherit_types
from models.enums.brigade import ALL_BRIGADES
from models.enums.alignment import Alignment
from models.enums.card_type import CardType
from mappings.card_type_metadata import TYPE_ALIGNMENT_MAP, TYPES_WITH_BRIGADES, TYPES_WITH_STATS
from mappings.ordir_map import ORDIR_MAP

# Load config from config.json
BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

INPUT_FILE = BASE_DIR / _config["carddata_json"]
OUTPUT_FILE = BASE_DIR / _config["cards_file"]
OUTPUT_FILE_MIN = BASE_DIR / _config["cards_file_min"]

BRIGADE_ALIGNMENT_MAP = {
    "White": "Good",
    "Red": "Good",
    "Blue": "Good",
    "Green": "Good",
    "Teal": "Good",
    "Silver": "Good",
    "Purple": "Good",
    "Clay": "Good",
    "Brown": "Evil",
    "Gray": "Evil",
    "Orange": "Evil",
    "Black": "Evil",
    "Crimson": "Evil",
    "Pale Green": "Evil",
    "Gold": "Shared",
    "Multi": "Shared",
    "Mult": "Shared"
}

def normalize_brigade(b: str) -> str:
    return b.strip()

def split_dual_brigades(brigades: list[str], top_align: str, bottom_align: str) -> tuple[list[str], list[str]]:
    brigades = [normalize_brigade(b) for b in brigades]
    
    if top_align == "Neutral":
        return [], brigades
    if bottom_align == "Neutral":
        return brigades, []
        
    if len(brigades) == 2 and {top_align, bottom_align} == {"Good", "Evil"}:
        if top_align == "Good":
            return [brigades[0]], [brigades[1]]
        else:
            return [brigades[1]], [brigades[0]]

    strict_good = {"White", "Red", "Blue", "Green", "Teal", "Silver", "Purple", "Clay"}
    strict_evil = {"Brown", "Gray", "Orange", "Black", "Crimson", "Pale Green"}
    
    valid_indices = []
    n = len(brigades)
    for k in range(n + 1):
        cond1 = all(brigades[i] not in strict_evil for i in range(k))
        cond2 = all(brigades[i] not in strict_good for i in range(k, n))
        if cond1 and cond2:
            valid_indices.append(k)
            
    if valid_indices:
        best_k = min(reversed(valid_indices), key=lambda k: abs(k - (n - k)))
    else:
        best_k = n // 2
        
    good_list = brigades[:best_k]
    evil_list = brigades[best_k:]
    
    if top_align == "Good" and bottom_align == "Evil":
        return good_list, evil_list
    elif top_align == "Evil" and bottom_align == "Good":
        return evil_list, good_list
    else:
        split = len(brigades) // 2
        return brigades[:split], brigades[split:]

def parse_flip_types(type_str: str) -> dict:
    if not type_str:
        return {}
    parts = [p.strip() for p in type_str.split("/")]
    if len(parts) >= 2:
        return {"top": parts[0], "bottom": parts[1]}
    elif len(parts) == 1:
        return {"top": parts[0]}
    return {}

def parse_brigades(raw: dict, types: list[str]) -> dict:
    raw_brigade = raw.get("Brigade", "")
    if not raw_brigade:
        return {}
    raw_brigade = raw_brigade.strip()
    result = {}
    
    # Typo corrections
    s = raw_brigade.replace("Teal Gold", "Teal/Gold")
    
    # Normalize splitting by / and " and "
    import re
    s = re.sub(r'\s+and\s+', '/', s, flags=re.IGNORECASE)
    s = re.sub(r'\s+&\s+', '/', s)
    
    alignments = parse_flip_alignment(raw.get("Alignment", ""))
    top_align = alignments.get("top").value if alignments.get("top") else raw.get("Alignment", "")
    bottom_align = alignments.get("bottom").value if alignments.get("bottom") else None
    
    if "(" in raw_brigade and ")" in raw_brigade:
        top_str, bottom_str = raw_brigade.split("(", 1)
        bottom_str = bottom_str.rstrip(")")
        top_list = [normalize_brigade(b) for b in top_str.split("/") if normalize_brigade(b) in ALL_BRIGADES]
        bottom_list = [normalize_brigade(b) for b in bottom_str.split("/") if normalize_brigade(b) in ALL_BRIGADES]
    else:
        all_brigades = [normalize_brigade(b) for b in s.split("/") if normalize_brigade(b) in ALL_BRIGADES]
        
        if bottom_align is not None:
            top_list, bottom_list = split_dual_brigades(all_brigades, top_align, bottom_align)
        else:
            top_list = all_brigades
            bottom_list = []
            
    result["top"] = top_list
    result["bottom"] = bottom_list
    
    if len(types) > 1:
        raw_types_order = [t.strip() for t in raw.get("Type", "").split("/")]
        
        if bottom_align is not None and len(raw_types_order) >= 2:
            top_type = raw_types_order[0]
            bottom_type = raw_types_order[1]
            
            for t in types:
                if t == top_type:
                    result[t] = top_list if t in TYPES_WITH_BRIGADES else []
                elif t == bottom_type:
                    result[t] = bottom_list if t in TYPES_WITH_BRIGADES else []
                else:
                    result[t] = []
        else:
            all_brigades = [normalize_brigade(b) for b in s.split("/") if normalize_brigade(b) in ALL_BRIGADES]
            split = len(all_brigades) // len(raw_types_order) if len(raw_types_order) > 0 else len(all_brigades)
            type_to_brigades = {}
            for i, t in enumerate(raw_types_order):
                type_to_brigades[t] = all_brigades[i*split:(i+1)*split]
                
            for t in types:
                if t in type_to_brigades:
                    result[t] = type_to_brigades[t] if t in TYPES_WITH_BRIGADES else []
                else:
                    result[t] = []
                    
    return result

def parse_flip_int(value: str) -> dict:
    if not value:
        return {}
    value = value.strip()
    if "(" in value and ")" in value:
        top, bottom = value.split("(", 1)
        bottom = bottom.rstrip(")")
        try:
            return {"top": int(top.strip()), "bottom": int(bottom.strip())}
        except ValueError:
            return {}
    try:
        return {"top": int(value)}
    except ValueError:
        return {}

def parse_flip_alignment(value: str) -> dict:
    if not value:
        return {}
    parts = [p.strip() for p in value.split("/")]
    try:
        if len(parts) == 2:
            return {
                "top": Alignment(parts[0]),
                "bottom": Alignment(parts[1])
            }
        elif len(parts) == 1:
            return {"top": Alignment(parts[0])}
    except ValueError:
        return {}
    return {}

def parse_classes(value: str) -> list[str]:
    if not value:
        return []
    return [c.strip() for c in value.split(",") if c.strip()]

def extract_side_ability(text: str, side: str) -> str:
    marker = "TOP:" if side == "top" else "BOTTOM:"
    if marker in text:
        return text.split(marker, 1)[-1].split("BOTTOM:" if side == "top" else "TOP:", 1)[0].strip()
    return text.strip()

def extract_type_ability(text: str, card_type: str) -> str:
    marker = card_type.upper() + ":"
    if marker in text:
        return text.split(marker, 1)[-1].split(":", 1)[0].strip()
    return text.strip()

def _extract_shared_fields(sides: dict) -> dict:
    """Extracts fields that are identical across all real sides into a shared block.

    Compares field values across top/bottom sides. Fields with identical,
    non-empty values in ALL sides are moved into a 'shared' entry so they
    are not stored redundantly per side.

    Args:
        sides: Dict of side_key -> side_data (CardSide dicts). May contain
               'top' and optionally 'bottom'.

    Returns:
        Updated sides dict, potentially with a 'shared' key and deduplicated
        per-side entries.
    """
    real_sides = {k: v for k, v in sides.items() if k != "shared" and isinstance(v, dict)}
    if len(real_sides) < 2:
        return sides  # Only one side — no deduplication needed.

    all_keys = set().union(*[set(s.keys()) for s in real_sides.values()])
    shared = {}
    for field in all_keys:
        values = [s.get(field) for s in real_sides.values()]
        # Move field to shared only if ALL sides have the same non-empty value.
        if all(v == values[0] and v is not None and v != [] and v != {} for v in values):
            shared[field] = values[0]

    if not shared:
        return sides

    result = {}
    if shared:
        result["shared"] = shared
    for key, side in real_sides.items():
        side_remainder = {k: v for k, v in side.items() if k not in shared}
        if side_remainder:  # Drop sides that became empty after sharing.
            result[key] = side_remainder
    return result


def build_card_sides(raw: dict, types: list[str]) -> dict:

    brigades = parse_brigades(raw, types)
    strengths = parse_flip_int(raw.get("Strength", ""))
    toughnesses = parse_flip_int(raw.get("Toughness", ""))
    alignments = parse_flip_alignment(raw.get("Alignment", ""))
    classes = parse_classes(raw.get("Class", ""))
    abilities = raw.get("SpecialAbility", "")
    name = raw.get("Name", "")

    sides = {}

    if not types:
        print(f"[WARN] Karte '{name}' hat keine Typen -> CardSides wird leer.")
        return sides

    has_bottom = any(
        isinstance(d, dict) and "bottom" in d
        for d in [brigades, strengths, toughnesses, alignments]
    )

    is_multi_type = len(types) > 1

    flip_types = parse_flip_types(raw.get("Type", ""))

    if has_bottom:
        for side in ["top", "bottom"]:
            t = flip_types.get(side)
            if not t:
                t = types[0] if len(types) == 1 else (types[0] if side == "top" else types[-1])
            alignment = TYPE_ALIGNMENT_MAP.get(t)
            brigade = brigades.get(side, []) if t in TYPES_WITH_BRIGADES else []
            strength = strengths.get(side) if t in TYPES_WITH_STATS else None
            toughness = toughnesses.get(side) if t in TYPES_WITH_STATS else None

            sides[side] = CardSide(
                Name=name,
                Type=t,
                Alignment=alignment if alignment is not None else alignments.get(side),
                Brigades=brigade,
                Strength=strength,
                Toughness=toughness,
                Classes=classes,
                SpecialAbility=extract_side_ability(abilities, side)
            ).to_dict()
    elif is_multi_type:
        for t in types:
            alignment = TYPE_ALIGNMENT_MAP.get(t)
            brigade = brigades.get(t) or brigades.get("top", []) if t in TYPES_WITH_BRIGADES else []
            strength = strengths.get("top") if t in TYPES_WITH_STATS else None
            toughness = toughnesses.get("top") if t in TYPES_WITH_STATS else None

            sides[t] = CardSide(
                Name=name,
                Type=t,
                Alignment=alignment if alignment is not None else alignments.get("top"),
                Brigades=brigade,
                Strength=strength,
                Toughness=toughness,
                Classes=classes,
                SpecialAbility=extract_type_ability(abilities, t)
            ).to_dict()
    else:
        t = types[0]
        alignment = TYPE_ALIGNMENT_MAP.get(t)
        brigade = brigades.get("top", []) if t in TYPES_WITH_BRIGADES else []
        strength = strengths.get("top") if t in TYPES_WITH_STATS else None
        toughness = toughnesses.get("top") if t in TYPES_WITH_STATS else None

        sides["top"] = CardSide(
            Name=name,
            Type=t,
            Alignment=alignment if alignment is not None else alignments.get("top"),
            Brigades=brigade,
            Strength=strength,
            Toughness=toughness,
            Classes=classes,
            SpecialAbility=abilities.strip()
        ).to_dict()

    return _extract_shared_fields(sides)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    raw_cards = json.load(f)["cards"]

extended_cards = []
for i, raw in enumerate(raw_cards):
    try:
        raw_types_raw = [t.strip() for t in raw.get("Type", "").split("/")]
        raw_types = expand_and_inherit_types(raw_types_raw)

        raw["IsToken"] = any("Token" in t for t in raw_types)
        raw["CardSides"] = build_card_sides(raw, raw_types)

        raw["Meta"] = {
            "Created": datetime.now().strftime("%Y-%m-%d"),
            "LastModified": datetime.now().strftime("%Y-%m-%d")
        }

        card = Card(raw)
        extended_cards.append(card.to_dict())
    except Exception as e:
        print(f"[ERROR] Fehler bei Karte {i}: {raw.get('Name')} -> {type(e).__name__}: {e}")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump({"cards": extended_cards}, f, indent=2, ensure_ascii=False)

with open(OUTPUT_FILE_MIN, "w", encoding="utf-8") as f:
    json.dump({"cards": extended_cards}, f, separators=(",", ":"), ensure_ascii=False)

print(f"{len(extended_cards)} cards written to:")
print(f"  {OUTPUT_FILE}")
print(f"  {OUTPUT_FILE_MIN}")
