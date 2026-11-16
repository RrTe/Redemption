"""Idempotent deterministic migration for ORDIR 7.1.0 terminology and unresolved card_titles.

Sanitizes legacy ORDIR 7.0.0 phrases (while preserving explicit 'Musician'/'music' text),
splits unambiguous multi-title selectors, fixes known spelling/edition variants, clears
self-referential card_titles, and structurally relocates non-title zone/owner/trait tokens
into canonical AST selector fields across both Stage 8 raw and Stage 9 AI datasets.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.logic.card_logic import CardSideLogic
from utils.card_helpers import get_card_name, get_side_field, get_star_ability
from utils.card_linker import CardLinker, link_side_logic_targets

AI_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_FILE = BASE_DIR / "data" / "card_abilities_raw.json"
EXT_FILE = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"

_GHOST_KEYS = ("-1587655157_shared_top", "-1587655157_top_top")
_SET_TAG_RE = re.compile(r"(?:\s*[\(\[].*?[\)\]])+$")

_MULTI_TITLE_SPLITS: Dict[str, List[str]] = {
    "abiram or korah": ["Abiram", "Korah"],
    "lois or timothy": ["Lois", "Timothy"],
    "wall of protection or jerusalem tower": ["Wall of Protection", "Jerusalem Tower"],
    "abner, michal or doeg": ["Abner", "Michal", "Doeg"],
    "herod antipas and herodias": ["Herod Antipas", "Herodias"],
    "esau and jacob": ["Esau", "Jacob"],
    "saul/paul": ["Saul", "Paul"],
    "eli's sons": ["Hophni, son of Eli", "Phinehas, son of Eli"],
}

_CANONICAL_TITLE_FIXES: Dict[str, str] = {
    "zebubbabel's temple": "Zerubbabel's Temple",
    "the heavenly temple": "Heavenly Temple",
    "solomon's temple fortress site": "Solomon's Temple",
    "king joram of israel": "King Joram",
    "king amaziah of judah": "King Amaziah",
    "kingdoms of this world": "Kingdoms of the World",
    "goliath's brother (lahmi)": "Lahmi",
    "goliath's brother": "Lahmi",
}

_SELF_TITLE_ALIAS_FIXES: Set[str] = {
    "boaz sandal",
}


def _dedupe_str_list(items: List[str]) -> List[str]:
    """Preserves order while deduplicating non-empty strings."""
    out: List[str] = []
    seen = set()
    for item in items:
        s = str(item).strip()
        if s and s.lower() not in seen:
            out.append(s)
            seen.add(s.lower())
    return out


def _append_unique(target_list: List[str], value: str) -> None:
    """Appends value case-insensitively if not already present."""
    v = value.strip()
    if v and v.lower() not in {x.lower() for x in target_list}:
        target_list.append(v)


def _strip_set_tags(name: str) -> str:
    """Removes trailing edition/set tags like '(GoC)' or '[IR]' for self-comparison."""
    return _SET_TAG_RE.sub("", name or "").strip().lower()


def _migrate_selector(
    sel: Dict[str, Any],
    card_name: str,
    raw_text: str,
    parent_pf: Optional[Dict[str, Any]] = None,
    is_card_source: bool = False,
) -> bool:
    """Migrates ORDIR 7.1.0 terminology and unresolved card_titles inside one TargetSelector dict.

    Args:
        sel: Mutable TargetSelector dictionary.
        card_name: Canonical name of the owning card.
        raw_text: Combined raw ability text of the card/side.
        parent_pf: Optional parent ProtectionFilter dictionary when inside ``card_sources``.
        is_card_source: True when selector lives inside ``protection_filter.card_sources``.

    Returns:
        True if any field in ``sel`` or ``parent_pf`` was modified.
    """
    changed = False
    raw_low = raw_text.lower()
    before_snapshot = json.dumps(sel, sort_keys=True) + json.dumps(parent_pf or {}, sort_keys=True)

    # 1. ORDIR 7.1.0 identifier & trait normalization
    orig_idents = list(sel.get("identifiers", []))
    new_idents: List[str] = []
    classes = list(sel.get("classes", []))

    for ident in orig_idents:
        ilow = ident.strip().lower()
        if ilow == "with herod in the title":
            _append_unique(new_idents, "Herod in the Title")
        elif ilow in ("gideon's name in the title", "with gideon's name in the title"):
            _append_unique(new_idents, "Gideon in the Title")
        elif ilow in ("paul's name in the title", "with paul's name in the title"):
            _append_unique(new_idents, "Paul in the Title")
        elif ilow in (
            "depicting an idol",
            "depicting idol",
            "depicting a false religious practice",
            "depicting an evil altar",
            "depicting an idol or evil altar",
            "evil altar",
        ):
            _append_unique(new_idents, "Idol")
        elif ilow == "o.t. artifact depicting an idol":
            sel["testament"] = "OT"
            if not sel.get("target_type"):
                sel["target_type"] = "artifact"
            _append_unique(new_idents, "Idol")
        elif ilow == "fought in an earthly battle":
            sel["testament"] = "OT"
            sel["is_human"] = True
            _append_unique(classes, "Warrior")
        elif ilow == "connected with demons":
            sel["target_type"] = "enhancement"
            brigades = list(sel.get("brigades", []))
            if "Orange" not in brigades:
                brigades.append("Orange")
            sel["brigades"] = brigades
            # Drop companion hallucinated "Demon" token on enhancement selector
            new_idents = [x for x in new_idents if x.lower() != "demon"]
        elif ilow == "spiritual gift":
            _append_unique(new_idents, "Fruit of the Spirit")
        elif ilow == "prophet" and sel.get("alignment") == "evil" and "evil prophet" in raw_low:
            if sel.get("target_type") == "hero":
                sel["target_type"] = "evil_character"
            _append_unique(new_idents, "False Prophet")
        else:
            # Guard: skip stray 'Demon' when connected with demons also appeared in orig_idents
            if ilow == "demon" and "connected with demons" in [x.lower() for x in orig_idents]:
                continue
            _append_unique(new_idents, ident)

    sel["identifiers"] = _dedupe_str_list(new_idents)
    if classes:
        sel["classes"] = _dedupe_str_list(classes)

    # 2. Card-title normalization (only act on selectors with empty target_card_ids)
    titles = list(sel.get("card_titles", []))
    t_ids = list(sel.get("target_card_ids", []))
    if titles and not t_ids:
        base_card_name = _strip_set_tags(card_name)
        new_titles: List[str] = []

        for title in titles:
            t_strip = title.strip()
            t_low = t_strip.lower()
            t_base = _strip_set_tags(t_strip)

            # 2a. Explicit multi-title splits
            if t_low in _MULTI_TITLE_SPLITS:
                new_titles.extend(_MULTI_TITLE_SPLITS[t_low])
                continue

            # 2b. Canonical DB title spellings
            if t_low in _CANONICAL_TITLE_FIXES:
                new_titles.append(_CANONICAL_TITLE_FIXES[t_low])
                continue

            # 2c. Self-references (automatic_self or card's own name not explicitly referenced in raw)
            is_self_mode = sel.get("selection_mode") == "automatic_self"
            is_self_name = bool(base_card_name and t_base == base_card_name) or (t_low in _SELF_TITLE_ALIAS_FIXES)
            if is_self_mode and (is_self_name or t_base in base_card_name):
                continue
            if is_self_name and not re.search(rf"\b{re.escape(t_base)}\b", raw_low):
                sel["selection_mode"] = "automatic_self"
                continue
            if is_self_name and any(
                p in raw_low for p in ("this card", "this character", "if played from hand", "if played in battle", "if used during battle", "if alone")
            ):
                sel["selection_mode"] = "automatic_self"
                continue

            # 2d. ORDIR category & trait nouns misplaced in card_titles
            if t_low == "antediluvian human":
                sel["is_human"] = True
                _append_unique(sel["identifiers"], "Antediluvian")
                continue
            if t_low in ("antediluvian", "antediluvian or if played during battle"):
                _append_unique(sel["identifiers"], "Antediluvian")
                if not sel.get("target_type"):
                    sel["target_type"] = "character"
                continue
            if t_low in ("if played during battle", "played during battle"):
                _append_unique(sel["identifiers"], t_strip)
                continue
            if t_low == "flood survivor or antediluvian":
                _append_unique(sel["identifiers"], "Flood Survivor")
                _append_unique(sel["identifiers"], "Antediluvian")
                continue
            if t_low == "deacon":
                _append_unique(sel["identifiers"], "Deacon")
                continue
            if t_low == "king of israel":
                _append_unique(sel["identifiers"], "King of Israel")
                if not sel.get("target_type"):
                    sel["target_type"] = "character"
                continue
            if t_low == "roman emperor":
                _append_unique(sel["identifiers"], "Roman Emperor")
                sel["target_type"] = sel.get("target_type") or "evil_character"
                sel["alignment"] = sel.get("alignment") or "evil"
                continue
            if t_low in ("sadducee or pharisee", "pharisee or sadducee"):
                _append_unique(sel["identifiers"], "Pharisee")
                _append_unique(sel["identifiers"], "Sadducee")
                if not sel.get("target_type"):
                    sel["target_type"] = "character"
                continue
            if t_low == "sadducees and scribes":
                _append_unique(sel["identifiers"], "Sadducee")
                _append_unique(sel["identifiers"], "Scribe")
                if not sel.get("target_type"):
                    sel["target_type"] = "character"
                continue
            if t_low == "fruit of the spirit":
                _append_unique(sel["identifiers"], "Fruit of the Spirit")
                sel["target_type"] = sel.get("target_type") or "enhancement"
                continue
            if t_low == "different wilderness":
                sel["gender"] = "female"
                sel["target_type"] = sel.get("target_type") or "hero"
                sel["alignment"] = sel.get("alignment") or "good"
                _append_unique(sel["identifiers"], "Wilderness Character")
                continue
            if t_low == "grim reaper":
                _append_unique(sel["identifiers"], "Grim Reaper")
                continue
            if t_low == "his strength":
                _append_unique(sel["identifiers"], "his strength")
                continue
            if t_low == "males":
                sel["gender"] = "male"
                sel["target_type"] = sel.get("target_type") or "character"
                continue

            # 2e. Board zones, pronouns, chained refs, ability words & protection sources
            if t_low == "land of redemption":
                sel["scope"] = ["land_of_redemption"]
                sel["target_type"] = "card"
                continue
            if t_low == "decks":
                sel["scope"] = ["deck"]
                sel["target_type"] = "card"
                continue
            if t_low == "decks and reserves":
                sel["scope"] = ["deck", "reserve_pile"]
                sel["target_type"] = "card"
                continue
            if t_low == "discard pile":
                sel["scope"] = ["discard_pile"]
                sel["target_type"] = "card"
                continue
            if t_low == "draw pile":
                sel["scope"] = ["deck"]
                sel["target_type"] = "card"
                continue
            if t_low == "that idol":
                sel["selection_mode"] = "chained_target"
                sel["ref_step"] = sel.get("ref_step") or 1
                sel["target_type"] = sel.get("target_type") or "artifact"
                _append_unique(sel["identifiers"], "Idol")
                continue
            if t_low == "rest":
                _append_unique(sel["identifiers"], "rest")
                continue
            if t_low == "brigade":
                _append_unique(sel["identifiers"], "brigade")
                continue
            if t_low in ("brigades", "selected brigade"):
                if not sel.get("brigades"):
                    _append_unique(sel["identifiers"], "selected brigade")
                continue
            if t_low in ("opponents", "opponents'", "opponent", "from opponent", "used by opponent", "protected from opponents"):
                sel["zone_owner"] = "opponent"
                if is_card_source and not sel.get("target_type"):
                    sel["target_type"] = "card"
                continue
            if t_low == "opponents during the next battle phase":
                sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    quals = list(parent_pf.get("qualifiers", []))
                    _append_unique(quals, "during the next battle phase")
                    parent_pf["qualifiers"] = quals
                continue
            if t_low == "shuffle by an opponent":
                sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    acts = list(parent_pf.get("actions", []))
                    _append_unique(acts, "shuffle")
                    parent_pf["actions"] = acts
                continue
            if t_low == "opponents' look":
                sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    acts = list(parent_pf.get("actions", []))
                    _append_unique(acts, "look")
                    parent_pf["actions"] = acts
                continue
            if t_low == "opponents' band":
                sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    acts = list(parent_pf.get("actions", []))
                    _append_unique(acts, "band")
                    parent_pf["actions"] = acts
                continue
            if t_low in ("discard abilities", "discard abilities used by opponent"):
                if "opponent" in t_low:
                    sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    acts = list(parent_pf.get("actions", []))
                    _append_unique(acts, "discard")
                    parent_pf["actions"] = acts
                else:
                    _append_unique(sel["identifiers"], "discard abilities")
                continue
            if t_low == "withdraw":
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                if parent_pf is not None:
                    acts = list(parent_pf.get("actions", []))
                    _append_unique(acts, "withdraw")
                    parent_pf["actions"] = acts
                continue
            if t_low in ("special abilities this turn", "special abilities used by opponent"):
                if "opponent" in t_low:
                    sel["zone_owner"] = "opponent"
                if not sel.get("target_type"):
                    sel["target_type"] = "card"
                _append_unique(sel["identifiers"], "special abilities")
                continue
            if t_low == "banding":
                _append_unique(sel["identifiers"], "band abilities")
                continue
            if t_low == "protect abilities":
                _append_unique(sel["identifiers"], "protect abilities")
                continue
            if t_low == "band and toss abilities":
                _append_unique(sel["identifiers"], "band abilities")
                _append_unique(sel["identifiers"], "toss abilities")
                continue
            if t_low == "non- special abilities":
                _append_unique(sel["identifiers"], "special abilities")
                continue
            if t_low == "drawing and":
                _append_unique(sel["identifiers"], "draw abilities")
                continue
            if t_low == "heal and resurrect abilities":
                _append_unique(sel["identifiers"], "heal abilities")
                _append_unique(sel["identifiers"], "resurrect abilities")
                continue
            if t_low == "draw":
                _append_unique(sel["identifiers"], "draw")
                continue

            new_titles.append(t_strip)

        if new_titles != titles:
            sel["card_titles"] = new_titles
            if not new_titles:
                sel["target_card_ids"] = []

    after_snapshot = json.dumps(sel, sort_keys=True) + json.dumps(parent_pf or {}, sort_keys=True)
    if after_snapshot != before_snapshot:
        changed = True
    return changed


def _migrate_side_dict(
    side_dict: Dict[str, Any],
    card_name: str,
    raw_text: str,
    linker: Optional[CardLinker] = None,
) -> Tuple[Dict[str, Any], bool]:
    """Runs idempotent selector migrations and re-validates a CardSideLogic payload.

    Args:
        side_dict: Serialized CardSideLogic dictionary.
        card_name: Owning card name.
        raw_text: Raw ability text for context checks.
        linker: Optional CardLinker to resolve newly fixed card_titles immediately.

    Returns:
        Tuple of ``(validated_side_dict, changed_flag)``.
    """
    working = copy.deepcopy(side_dict)
    changed = False

    for ab in working.get("abilities", []):
        if isinstance(ab.get("trigger_filter"), dict):
            changed |= _migrate_selector(ab["trigger_filter"], card_name, raw_text)
        for cond in ab.get("conditions", []):
            if isinstance(cond.get("selector"), dict):
                changed |= _migrate_selector(cond["selector"], card_name, raw_text)
        for cost in ab.get("costs", []):
            if isinstance(cost.get("target"), dict):
                changed |= _migrate_selector(cost["target"], card_name, raw_text)
        for eff in ab.get("effects", []):
            pf = eff.get("protection_filter") if isinstance(eff.get("protection_filter"), dict) else None
            if isinstance(eff.get("target"), dict):
                changed |= _migrate_selector(eff["target"], card_name, raw_text, parent_pf=None)
            if pf:
                for cs in pf.get("card_sources", []):
                    if isinstance(cs, dict):
                        changed |= _migrate_selector(cs, card_name, raw_text, parent_pf=pf, is_card_source=True)

    if changed:
        validated = CardSideLogic.model_validate(working)
        if linker:
            link_side_logic_targets(validated, linker)
        return validated.model_dump(exclude_none=True), True
    return side_dict, False


def _build_ext_lookup() -> Tuple[Dict[str, Tuple[str, str]], Optional[CardLinker]]:
    """Loads extended cards database and builds raw-text lookup and CardLinker."""
    if not EXT_FILE.exists():
        return {}, None
    ext_cards = json.loads(EXT_FILE.read_text(encoding="utf-8")).get("cards", [])
    linker = CardLinker(ext_cards)
    lookup: Dict[str, Tuple[str, str]] = {}
    for c in ext_cards:
        cid = str(c.get("Id", "")).strip()
        if not cid:
            continue
        name = get_card_name(c)
        raw_parts = [
            get_star_ability(c),
            get_side_field(c, "top", "SpecialAbility") or "",
            get_side_field(c, "bottom", "SpecialAbility") or "",
            c.get("SpecialAbility") or "",
        ]
        lookup[cid] = (name, " ".join(p for p in raw_parts if p))
    return lookup, linker


def migrate_all(dry_run: bool = False) -> Dict[str, int]:
    """Executes the idempotent ORDIR 7.1.0 & card_titles migration on raw and AI AST files.

    Args:
        dry_run: If True, computes all changes without writing modified JSON files to disk.

    Returns:
        Summary metrics dictionary.
    """
    ext_lookup, linker = _build_ext_lookup()
    stats = {"ghost_keys_removed": 0, "ai_entries_updated": 0, "raw_sides_updated": 0}

    if AI_FILE.exists():
        ai_data = json.loads(AI_FILE.read_text(encoding="utf-8"))
        for gk in _GHOST_KEYS:
            if gk in ai_data:
                ai_data.pop(gk)
                stats["ghost_keys_removed"] += 1

        for key, entry in ai_data.items():
            cid = str(entry.get("card_id", "")).strip()
            ext_name, ext_raw = ext_lookup.get(cid, ("", ""))
            cname = entry.get("card_name") or ext_name or key
            raw_text = entry.get("raw_ability") or ext_raw
            ast = entry.get("ast")
            if isinstance(ast, dict):
                updated_ast, was_changed = _migrate_side_dict(ast, cname, raw_text, linker=linker)
                if was_changed:
                    entry["ast"] = updated_ast
                    stats["ai_entries_updated"] += 1

        if not dry_run and (stats["ghost_keys_removed"] > 0 or stats["ai_entries_updated"] > 0):
            AI_FILE.write_text(json.dumps(ai_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if RAW_FILE.exists():
        raw_data = json.loads(RAW_FILE.read_text(encoding="utf-8"))
        for cid, card_entry in raw_data.items():
            ext_name, ext_raw = ext_lookup.get(cid, ("", ""))
            sides = card_entry.get("sides", {})
            for side_key, side_ast in list(sides.items()):
                if isinstance(side_ast, dict):
                    updated_side, was_changed = _migrate_side_dict(side_ast, ext_name, ext_raw, linker=linker)
                    if was_changed:
                        sides[side_key] = updated_side
                        stats["raw_sides_updated"] += 1

        if not dry_run and stats["raw_sides_updated"] > 0:
            RAW_FILE.write_text(json.dumps(raw_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return stats


def _parse_args() -> argparse.Namespace:
    """Parses CLI arguments."""
    parser = argparse.ArgumentParser(description="Migrate ORDIR 7.1.0 terms and unresolved card_titles.")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    res = migrate_all(dry_run=args.dry_run)
    print(f"ORDIR 7.1.0 & card_titles migration complete (dry_run={args.dry_run}): {res}")
