import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parent.parent))

import json
from datetime import datetime
from models.card import Card
from models.card_side import CardSide
from utils.extend_types import expand_and_inherit_types
from utils.ability_splitter import split_card_abilities
from utils.card_helpers import check_is_star_card, generate_card_id
from models.enums.brigade import ALL_BRIGADES
from models.enums.alignment import Alignment
from models.enums.card_type import CardType, TYPE_GROUPS
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

DUAL_CARD_TYPES = {
    "Hero/Evil Character", "GE/EE", "Evil Character/Fortress", "Hero/Site",
    "Evil Character/EE", "Hero/GE", "GE/Hero", "Evil Character/Site",
    "Hero/Fortress", "Artifact/EE", "GE/Artifact", "Hero/EE", "Curse/GE",
    "Covenant/Curse", "EE/GE"
}

LEGACY_DUALS = {
    "Abram/Abraham": ("Abram", "Abraham"),
    "Saul/Paul": ("Saul", "Paul"),
    "Banks of the Nile/Pharaoh's Court": ("Banks of the Nile", "Pharaoh's Court"),
    "Magicians' Staves/Magicians' Snakes": ("Magicians' Staves", "Magicians' Snakes")
}

def split_flip_name(name: str) -> tuple[str, str] | None:
    """Splits a dual card name into top and bottom side names if appropriate.

    Args:
        name: Raw card name string.

    Returns:
        Tuple of (top_name, bottom_name) or None if name should not be split.
    """
    if not name or name.startswith("Lost Soul"):
        return None
    if name in LEGACY_DUALS:
        return LEGACY_DUALS[name]

    import re
    base = re.sub(r'[\(\[].*?[\)\]]', '', name).strip()
    if ' / ' not in base:
        return None

    m = re.search(r'\s*(\([^\)]+\)|\[[^\]]+\])$', name)
    suffix = m.group(1).strip() if m else ''
    clean_full = name[:m.start()].strip() if m else name.strip()

    parts = [p.strip() for p in clean_full.split(' / ')]
    if len(parts) == 2:
        top = f"{parts[0]} {suffix}".strip()
        bot = f"{parts[1]} {suffix}".strip()
        return top, bot
    return None

def normalize_brigade(b: str) -> str:
    return b.strip()

def is_dual_sided(raw: dict) -> bool:
    """Determines whether a card is genuinely dual-sided (flip or dual-alignment)."""
    name = raw.get("Name", "")
    card_type = raw.get("Type", "")
    strength = raw.get("Strength", "")
    toughness = raw.get("Toughness", "")
    brigade = raw.get("Brigade", "")
    special = raw.get("SpecialAbility", "")
    align = raw.get("Alignment", "")
    
    # Check 1: Slash in Name (flip cards), excluding Lost Soul citations
    import re
    base_name = re.sub(r'[\(\[].*?[\)\]]', '', name).strip()
    if "/" in base_name and not name.startswith("Lost Soul"):
        return True
        
    # Check 2: Parentheses or slash in stats
    if "(" in strength or "(" in toughness:
        return True
    if "/" in strength and all(part.strip().lstrip("-").isdigit() for part in strength.split("/") if part.strip()):
        return True
    if "/" in toughness and all(part.strip().lstrip("-").isdigit() for part in toughness.split("/") if part.strip()):
        return True
        
    # Check 3: Parentheses in Brigade (e.g. 'Purple (Clay)')
    if "(" in brigade and ")" in brigade:
        return True
        
    # Check 4: Explicit dual card types (e.g. GE/EE, Hero/Evil Character)
    types = [t.strip() for t in card_type.split("/") if t.strip()]
    if len(types) >= 2 and card_type in DUAL_CARD_TYPES:
        return True
        
    # Check 5: Alignment is Good/Evil
    if "/" in align:
        return True
        
    # Check 6: Explicit TOP: and BOTTOM: in SpecialAbility
    if re.search(r'(?:^|[\s/])TOP:\s*', special, re.IGNORECASE) and re.search(r'(?:^|[\s/])BOTTOM:\s*', special, re.IGNORECASE):
        return True
        
    return False

def parse_flip_types(type_str: str) -> dict:
    if not type_str:
        return {}
    parts = [p.strip() for p in type_str.split("/")]
    if len(parts) >= 2:
        return {"top": parts[0], "bottom": parts[1]}
    elif len(parts) == 1:
        return {"top": parts[0]}
    return {}

def parse_brigades(raw: dict, types: list[str], is_dual: bool = False) -> dict:
    raw_brigade = raw.get("Brigade", "")
    if not raw_brigade:
        return {}
    raw_brigade = raw_brigade.strip()
    result = {}
    
    # Typo corrections
    s = raw_brigade.replace("Teal Gold", "Teal/Gold")
    import re
    s = re.sub(r'\s+and\s+', '/', s, flags=re.IGNORECASE)
    s = re.sub(r'\s+&\s+', '/', s)
    
    # 1. Parentheses in brigade: "Top (Bottom)"
    if "(" in raw_brigade and ")" in raw_brigade:
        top_str, bottom_str = raw_brigade.split("(", 1)
        bottom_str = bottom_str.rstrip(")")
        top_list = [normalize_brigade(b) for b in top_str.split("/") if normalize_brigade(b) in ALL_BRIGADES]
        bottom_list = [normalize_brigade(b) for b in bottom_str.split("/") if normalize_brigade(b) in ALL_BRIGADES]
        result["top"] = top_list
        if bottom_list:
            result["bottom"] = bottom_list
        return result
        
    all_brigades = [normalize_brigade(b) for b in s.split("/") if normalize_brigade(b) in ALL_BRIGADES]
    
    # If not a dual-sided card, all brigades belong to top
    if not is_dual:
        result["top"] = all_brigades
        return result
        
    align = raw.get("Alignment", "")
    card_type = raw.get("Type", "")
    
    # Single shared brigade on dual card (e.g. 'Multi' or 'Brown')
    if len(all_brigades) == 1:
        result["top"] = all_brigades
        result["bottom"] = all_brigades
        return result
        
    # Dual brigade pair: exactly 2 brigades separated by slash -> Top gets first, Bottom gets second
    if len(all_brigades) == 2:
        result["top"] = [all_brigades[0]]
        result["bottom"] = [all_brigades[1]]
        return result
        
    # 3 brigades with Clay on GoC Disciples (e.g. Purple/Clay/Green -> Top: [Purple, Green], Bottom: [Clay])
    if len(all_brigades) == 3 and "Clay" in all_brigades:
        result["top"] = [b for b in all_brigades if b != "Clay"]
        result["bottom"] = ["Clay"]
        return result
        
    # Dual alignment split (Good vs Evil)
    is_good_evil = (
        ("Good" in align and "Evil" in align) or
        ("Hero" in card_type and "Evil Character" in card_type) or
        ("GE" in card_type and "EE" in card_type) or
        ("Hero" in card_type and "EE" in card_type) or
        ("Curse" in card_type and "GE" in card_type)
    )
    if is_good_evil:
        types_raw = [t.strip() for t in card_type.split("/") if t.strip()]
        first_is_evil = types_raw and types_raw[0] in ("Curse", "EE", "Evil Character")
        
        strict_good = {"White", "Red", "Blue", "Green", "Teal", "Silver", "Purple", "Clay"}
        strict_evil = {"Brown", "Gray", "Orange", "Black", "Crimson", "Pale Green"}
        good_b = [b for b in all_brigades if b in strict_good or b == "Silver"]
        evil_b = [b for b in all_brigades if b in strict_evil or b in ("Gold", "Orange", "Crimson", "Pale Green", "Black", "Gray", "Brown")]
        
        for b in all_brigades:
            if b == "Gold" and not evil_b and good_b:
                evil_b.append("Gold")
            elif b == "Gold" and not good_b and evil_b:
                good_b.append("Gold")
                
        if first_is_evil:
            result["top"] = evil_b
            result["bottom"] = good_b
        else:
            result["top"] = good_b
            result["bottom"] = evil_b
        return result
        
    split = len(all_brigades) // 2
    result["top"] = all_brigades[:split]
    result["bottom"] = all_brigades[split:]
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
    if "/" in value:
        parts = [p.strip() for p in value.split("/")]
        try:
            if len(parts) == 2:
                res = {}
                if parts[0].lstrip("-").isdigit():
                    res["top"] = int(parts[0])
                if parts[1].lstrip("-").isdigit():
                    res["bottom"] = int(parts[1])
                return res
        except ValueError:
            pass
    try:
        val = int(value)
        return {"top": val, "bottom": val}
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
    name = raw.get("Name", "")
    if not types:
        print(f"[WARN] Karte '{name}' hat keine Typen -> CardSides wird leer.")
        return {}

    has_bottom = is_dual_sided(raw)
    brigades = parse_brigades(raw, types, is_dual=has_bottom)
    strengths = parse_flip_int(raw.get("Strength", ""))
    toughnesses = parse_flip_int(raw.get("Toughness", ""))
    alignments = parse_flip_alignment(raw.get("Alignment", ""))
    classes = parse_classes(raw.get("Class", ""))
    abilities = raw.get("SpecialAbility", "")

    sides = {}
    is_multi_type = len(types) > 1
    flip_types = parse_flip_types(raw.get("Type", ""))
    star_ability = None

    if has_bottom:
        concrete_types = [ct for ct in types if ct not in TYPE_GROUPS] or types
        sides_info = []
        for side in ["top", "bottom"]:
            t = flip_types.get(side)
            if not t:
                t = concrete_types[0] if len(concrete_types) == 1 else (concrete_types[0] if side == "top" else concrete_types[-1])
            align_val = alignments.get(side) if alignments.get(side) is not None else TYPE_ALIGNMENT_MAP.get(t)
            align_str = align_val.value if hasattr(align_val, "value") else str(align_val) if align_val else None
            sides_info.append({"key": side, "type": t, "alignment": align_str})

        side_abilities, star_ability = split_card_abilities(abilities, sides_info)
        names = split_flip_name(name)
        side_names = {
            "top": names[0] if names else name,
            "bottom": names[1] if names else name
        }

        for side in ["top", "bottom"]:
            t = flip_types.get(side)
            if not t:
                t = concrete_types[0] if len(concrete_types) == 1 else (concrete_types[0] if side == "top" else concrete_types[-1])
            alignment = alignments.get(side) if alignments.get(side) is not None else TYPE_ALIGNMENT_MAP.get(t)
            brigade = brigades.get(side, []) if t in TYPES_WITH_BRIGADES else []
            strength = strengths.get(side) if t in TYPES_WITH_STATS else None
            toughness = toughnesses.get(side) if t in TYPES_WITH_STATS else None

            sides[side] = CardSide(
                Name=side_names.get(side, name),
                Type=t,
                Alignment=alignment,
                Brigades=brigade,
                Strength=strength,
                Toughness=toughness,
                Classes=classes,
                SpecialAbility=side_abilities.get(side)
            ).to_dict()
    elif is_multi_type:
        sides_info = []
        for t in types:
            align_val = TYPE_ALIGNMENT_MAP.get(t)
            if align_val is None and alignments.get("top"):
                align_val = alignments.get("top")
            align_str = align_val.value if hasattr(align_val, "value") else str(align_val) if align_val else None
            sides_info.append({"key": t, "type": t, "alignment": align_str})

        side_abilities, star_ability = split_card_abilities(abilities, sides_info)

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
                SpecialAbility=side_abilities.get(t)
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

    extracted = _extract_shared_fields(sides)
    if star_ability:
        if "shared" not in extracted:
            extracted["shared"] = {}
        extracted["shared"]["SpecialAbility"] = star_ability
    return extracted

def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw_cards = json.load(f)["cards"]

    extended_cards = []
    for i, raw in enumerate(raw_cards):
        try:
            raw_types_raw = [t.strip() for t in raw.get("Type", "").split("/")]
            raw_types = expand_and_inherit_types(raw_types_raw)

            raw["IsToken"] = any("Token" in t for t in raw_types)
            raw["CardSides"] = build_card_sides(raw, raw_types)
            raw["IsStarCard"] = check_is_star_card(raw)
            raw["Id"] = generate_card_id(raw.get("ImageFile"), raw.get("Set"), raw.get("Name"))

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


if __name__ == "__main__":
    main()

