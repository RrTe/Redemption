import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import json
from datetime import datetime
from models.card import Card
from models.card_side import CardSide
from extend_types import expand_and_inherit_types
from models.enums.brigade import ALL_BRIGADES
from models.enums.alignment import Alignment
from models.enums.card_type import CardType
from mappings.card_type_metadata import TYPE_ALIGNMENT_MAP, TYPES_WITH_BRIGADES, TYPES_WITH_STATS
from mappings.ordir_map import ORDIR_MAP

CARDDATA_DIR = Path("../../Phaser/Redemption Deck Editor/assets/")
DATA_DIR = Path("../data")
INPUT_FILE = CARDDATA_DIR / "carddata.json"
OUTPUT_FILE = DATA_DIR / "cards_extended.json"

def parse_brigades(raw_brigade: str, types: list[str]) -> dict:
    if not raw_brigade:
        return {}
    raw_brigade = raw_brigade.strip()
    result = {}

    if "(" in raw_brigade and ")" in raw_brigade:
        top, bottom = raw_brigade.split("(", 1)
        bottom = bottom.rstrip(")")
        result["top"] = [b.strip() for b in top.split("/") if b.strip() in ALL_BRIGADES]
        result["bottom"] = [b.strip() for b in bottom.split("/") if b.strip() in ALL_BRIGADES]
        return result

    if len(types) > 1:
        brigades = [b.strip() for b in raw_brigade.split("/") if b.strip() in ALL_BRIGADES]
        split = len(brigades) // len(types)
        for i, t in enumerate(types):
            result[t] = brigades[i*split:(i+1)*split]
        return result

    result["top"] = [b.strip() for b in raw_brigade.split("/") if b.strip() in ALL_BRIGADES]
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

def build_card_sides(raw: dict, types: list[str]) -> dict:
    print(f"[DEBUG] raw['CardTypes']: {raw.get('CardTypes')}")

    brigades = parse_brigades(raw.get("Brigade", ""), types)
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
    print(f"[DEBUG] Name: {name}, Types: {types}, is_multi_type: {is_multi_type}")

    if has_bottom:
        for side in ["top", "bottom"]:
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

    print(f"[DEBUG] CardSides keys: {list(sides.keys())}")
    return sides

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    raw_cards = json.load(f)["cards"]

extended_cards = []
for i, raw in enumerate(raw_cards):
    try:
        raw_types_raw = [t.strip() for t in raw.get("Type", "").split("/")]
        raw_types = expand_and_inherit_types(raw_types_raw)
        raw["CardTypes"] = raw_types

        raw["IsToken"] = any("Token" in t for t in raw_types)
        raw["Brigades"] = parse_brigades(raw.get("Brigade", ""), raw_types)
        raw["Strengths"] = parse_flip_int(raw.get("Strength", ""))
        raw["Toughnesses"] = parse_flip_int(raw.get("Toughness", ""))
        raw["Alignments"] = parse_flip_alignment(raw.get("Alignment", ""))
        raw["Classes"] = parse_classes(raw.get("Class", ""))
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

print(f"{len(extended_cards)} Karten erfolgreich erweitert und gespeichert.")
