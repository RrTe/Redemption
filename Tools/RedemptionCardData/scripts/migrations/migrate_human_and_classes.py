"""Idempotent migration script for IsHuman/is_human and Classes/classes attributes.

Populates CardSide.IsHuman and normalizes CardSide.Classes across extended card
datasets, cleans residual compound human/class strings and missing is_human flags in
AI and raw AST caches, round-trips all ASTs through CardSideLogic (migrating
identifiers via TargetSelector), syncs dist extended data, and runs Stage 10 export.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.logic.card_logic import CardSideLogic  # noqa: E402
from utils.human_resolver import apply_is_human_to_card_sides, normalize_card_classes  # noqa: E402

_DATA_DIR = _PROJECT_ROOT / "data"
_EXTENDED_FILES = (
    _DATA_DIR / "cards_extended.json",
    _DATA_DIR / "cards_extended_with_ordir_fuzzy.json",
)
_FUZZY_FILE = _DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
_DIST_FUZZY_FILE = _DATA_DIR / "dist" / "cards_extended_with_ordir_fuzzy.json"
_AI_PATH = _DATA_DIR / "ai_generated_abilities.json"
_RAW_PATH = _DATA_DIR / "card_abilities_raw.json"


# Declarative field overrides keyed by (side_id, selector_path).
_SELECTOR_FIELD_PATCHES: Dict[Tuple[str, str], Dict[str, Any]] = {
    ("-97682549_top", "abilities[1].effects[0].protection_filter.card_sources[0]"): {
        "target_type": "character",
        "testament": "OT",
        "is_human": True,
        "card_titles": [],
    },
    ("-876641005_top", "abilities[0].effects[0].target"): {
        "testament": "OT",
        "is_human": True,
    },
    ("-1258684768_top", "abilities[1].effects[1].target"): {
        "is_human": True,
        "identifiers": ["of matching brigade"],
    },
    ("837438155_top", "abilities[1].effects[0].target"): {
        "is_human": True,
        "identifiers": ["of matching brigade"],
    },
    ("-1047809856_top", "abilities[1].effects[0].target"): {
        "is_human": True,
        "identifiers": ["of matching brigade"],
    },
    ("-386684264_top", "abilities[1].effects[0].target"): {
        "testament": "OT",
        "is_human": True,
    },
    ("-1027223523_top", "abilities[0].effects[1].target"): {
        "testament": "NT",
        "is_human": True,
    },
    ("953045732_top", "abilities[1].effects[2].target"): {
        "is_human": True,
    },
    ("953045732_top", "abilities[2].conditions[0].selector"): {
        "target_type": "character",
        "is_human": False,
    },
    ("-953497044_bottom", "abilities[0].effects[0].target"): {"is_human": True},
    ("-953497044_bottom", "abilities[0].effects[1].target"): {"is_human": True},
    ("-560048496_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("358977798_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1070093237_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1070093237_top", "abilities[1].effects[0].target"): {"is_human": True},
    ("1948821320_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("110267168_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-358090054_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1029228473_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("-1142609134_top", "abilities[0].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("1797167488_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1273229763_top", "abilities[0].trigger_filter"): {"is_human": True},
    ("-893875267_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-893807779_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("-1792902896_top", "abilities[0].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("-1441547833_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("704610103_shared", "abilities[1].effects[0].target"): {
        "is_human": True,
        "identifiers": ["of matching brigade"],
    },
    ("-2090982852_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("1708698410_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("881807846_top", "abilities[0].effects[0].target"): {
        "is_human": True,
        "identifiers": ["Prophet"],
    },
    ("551003852_top", "abilities[0].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("551003852_top", "abilities[1].conditions[0].selector"): {
        "target_type": "character",
        "is_human": True,
    },
    ("551003852_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("2138046710_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("1137272339_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1594853387_shared", "abilities[0].conditions[0].selector"): {"is_human": True},
    ("-1594853387_shared", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1594853387_shared", "abilities[1].effects[0].target"): {"is_human": True},
    ("338469435_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1819828040_top", "abilities[0].costs[0].target"): {"is_human": True},
    ("-1318675852_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("158154325_top", "abilities[0].costs[0].target"): {"is_human": True},
    ("-268346167_top", "abilities[0].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("1016743961_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("1016743961_top", "abilities[2].effects[0].target"): {"is_human": True},
    ("728351436_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("379379197_top", "abilities[1].effects[0].target"): {
        "is_human": True,
        "identifiers": [],
    },
    ("-1350134880_top", "abilities[1].effects[0].target"): {
        "target_type": "character",
        "scope": ["in_play"],
        "is_human": True,
    },
    ("-1899820848_top", "abilities[1].effects[0].target"): {
        "testament": "NT",
        "is_human": True,
    },
    ("1301834943_top", "abilities[0].effects[0].target"): {
        "target_type": "character",
        "is_human": True,
    },
    ("604138061_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-1895781061_top", "abilities[0].trigger_filter"): {
        "target_type": "character",
        "testament": "NT",
        "is_human": True,
    },
    ("-1895781061_top", "abilities[1].trigger_filter"): {
        "target_type": "character",
        "testament": "NT",
        "is_human": True,
    },
    ("-390912493_top", "abilities[0].effects[0].target"): {"is_human": True},
    ("-2146543811_top", "abilities[1].effects[0].target"): {
        "identifiers": ["on human Heroes"],
        "classes": ["Weapon"],
    },
    ("-1000265065_top", "abilities[0].effects[1].target"): {
        "target_type": "card",
        "is_human": False,
    },
    ("1173948213_top", "abilities[0].effects[0].target"): {"identifiers": ["except a human"]},
    ("1173948213_top", "abilities[0].effects[1].target"): {"identifiers": ["except a human"]},
    ("336508077_top", "abilities[0].effects[0].target"): {"identifiers": ["except a human"]},
    ("336508077_top", "abilities[0].effects[1].target"): {"identifiers": ["except a human"]},
}

# Declarative identifier cleanup / class addition rules for compound phrases.
_COMPOUND_CLEANUPS: Tuple[Dict[str, Any], ...] = (
    {
        "side_id": "328540351_top",
        "path": "abilities[0].effects[0].target",
        "remove_ident": "or weapons",
        "add_class": "Weapon",
    },
    {
        "side_id": "328540351_top",
        "path": "abilities[1].effects[0].target",
        "fields": {"is_human": True},
    },
    {
        "side_id": "-717902303_top",
        "path": "abilities[0].effects[0].target",
        "remove_ident": "and weapons",
        "add_class": "Weapon",
    },
    {
        "side_id": "1005696911_top",
        "path": "abilities[0].effects[1].target",
        "remove_ident": "weapons and",
        "add_class": "Weapon",
    },
    {
        "side_id": "-588621901_top",
        "path": "abilities[0].costs[0].target",
        "remove_ident": "your human",
        "fields": {"is_human": True, "zone_owner": "controller"},
    },
    {
        "side_id": "-576619974_top",
        "path": "abilities[0].effects[1].target",
        "replace_ident": ("human of matching brigade", "of matching brigade"),
        "fields": {"is_human": True},
    },
    {
        "side_id": "-1619215158_top",
        "path": "abilities[0].effects[1].target",
        "replace_ident": ("human of matching brigade", "of matching brigade"),
        "fields": {"is_human": True},
    },
    {
        "side_id": "654766573_top",
        "path": "abilities[0].effects[0].protection_filter.card_sources[0]",
        "replace_ident": ("human unless an angel is", "unless an angel is in battle"),
        "fields": {"is_human": True},
    },
    {
        "side_id": "-2111687982_top",
        "path": "abilities[0].effects[0].target",
        "replace_ident": ("human, Site or Fortress", "or Site or Fortress"),
        "fields": {"is_human": True},
    },
    {
        "side_id": "1653324896_top",
        "path": "abilities[0].effects[0].target",
        "fields": {"is_human": True},
    },
    {
        "side_id": "585985232_top",
        "path": "abilities[1].effects[0].target",
        "remove_ident": "except human",
        "fields": {"is_human": False},
    },
    {
        "side_id": "585985232_top",
        "path": "abilities[1].effects[1].target",
        "fields": {"is_human": True},
    },
)


def _load_json(path: Path) -> Any:
    """Loads JSON content from disk using UTF-8 encoding.

    Args:
        path: File path to read.

    Returns:
        Parsed JSON value.
    """
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_json_with_min(path: Path, payload: Any) -> None:
    """Writes formatted JSON and companion .min.json when present.

    Args:
        path: Primary JSON file path.
        payload: JSON-serializable payload.
    """
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    min_path = path.with_suffix(".min.json")
    if min_path.exists():
        with min_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"), ensure_ascii=False)


def _extract_cards_list(dataset: Any) -> List[Dict[str, Any]]:
    """Extracts the list of card dictionaries from list or {'cards': list} payloads.

    Args:
        dataset: Parsed extended card JSON payload.

    Returns:
        Mutable list of card dictionaries.
    """
    if isinstance(dataset, dict) and isinstance(dataset.get("cards"), list):
        return dataset["cards"]
    if isinstance(dataset, list):
        return dataset
    raise ValueError("Unsupported extended cards JSON structure")


def _extract_raw_cards_map(raw_data: Any) -> Dict[str, Any]:
    """Extracts the mutable card-ID dictionary from card_abilities_raw.json.

    Args:
        raw_data: Parsed card_abilities_raw.json payload.

    Returns:
        Dictionary mapping card IDs to ability entries.
    """
    if isinstance(raw_data, dict) and isinstance(raw_data.get("cards"), dict):
        return raw_data["cards"]
    if isinstance(raw_data, dict):
        return raw_data
    raise ValueError("Unsupported raw abilities JSON structure")


def _iter_matching_asts(
    ai_data: Dict[str, Any],
    raw_cards: Dict[str, Any],
    side_id: str,
) -> Iterable[Dict[str, Any]]:
    """Yields the effective AST dictionary for a '<card_id>_<side>' identifier.

    Yields ai_data[side_id]["ast"] when present, or raw_cards[cid]["sides"][sk]
    only when side_id is not overridden by ai_data so structurally divergent raw
    entries do not suffer index mismatches.

    Args:
        ai_data: Parsed ai_generated_abilities.json mapping.
        raw_cards: Parsed card_abilities_raw.json card mapping.
        side_id: Composite card-side identifier (e.g. '328540351_top').

    Yields:
        Mutable AST dictionary for that card side.
    """
    ai_entry = ai_data.get(side_id)
    if isinstance(ai_entry, dict) and isinstance(ai_entry.get("ast"), dict):
        yield ai_entry["ast"]
        return

    if "_" in side_id:
        cid, sk = side_id.rsplit("_", 1)
        raw_entry = raw_cards.get(cid)
        sides = raw_entry.get("sides") if isinstance(raw_entry, dict) else None
        if isinstance(sides, dict) and isinstance(sides.get(sk), dict):
            yield sides[sk]


def _resolve_selector_path(ast: Dict[str, Any], selector_path: str) -> Optional[Dict[str, Any]]:
    """Resolves a dotted/indexed selector path within a CardSideLogic AST dict.

    Args:
        ast: CardSideLogic AST dictionary.
        selector_path: Path expression such as 'abilities[0].effects[0].target'.

    Returns:
        Target selector dict if present, otherwise None.
    """
    node: Any = ast
    for segment in selector_path.split("."):
        if "[" in segment and segment.endswith("]"):
            key, idx_str = segment[:-1].split("[", 1)
            if not isinstance(node, dict) or key not in node:
                return None
            seq = node[key]
            idx = int(idx_str)
            if not isinstance(seq, list) or idx >= len(seq):
                return None
            node = seq[idx]
        else:
            if not isinstance(node, dict) or segment not in node:
                return None
            node = node[segment]
    return node if isinstance(node, dict) else None


def _patch_asts(ai_data: Dict[str, Any], raw_cards: Dict[str, Any]) -> int:
    """Applies compound identifier cleanups and missing is_human overrides.

    Args:
        ai_data: Parsed ai_generated_abilities.json dictionary.
        raw_cards: Parsed card_abilities_raw.json cards dictionary.

    Returns:
        Number of selector dictionaries modified.
    """
    patched = 0

    for rule in _COMPOUND_CLEANUPS:
        side_id = str(rule["side_id"])
        sel_path = str(rule["path"])
        asts = list(_iter_matching_asts(ai_data, raw_cards, side_id))
        if not asts:
            print(f"[WARN] Compound cleanup side not found: {side_id}")
            continue
        for ast in asts:
            sel = _resolve_selector_path(ast, sel_path)
            if sel is None:
                print(f"[WARN] Compound cleanup selector not found: {side_id} -> {sel_path}")
                continue
            idents = list(sel.get("identifiers") or [])
            if "remove_ident" in rule:
                target_rm = str(rule["remove_ident"])
                idents = [i for i in idents if i != target_rm]
                sel["identifiers"] = idents
            if "replace_ident" in rule:
                old_val, new_val = rule["replace_ident"]
                updated: List[str] = []
                for item in idents:
                    replacement = new_val if item == old_val else item
                    if replacement and replacement not in updated:
                        updated.append(replacement)
                sel["identifiers"] = updated
            if "add_class" in rule:
                classes = list(sel.get("classes") or [])
                cls_name = str(rule["add_class"])
                if cls_name not in classes:
                    classes.append(cls_name)
                sel["classes"] = classes
            for key, value in dict(rule.get("fields") or {}).items():
                sel[key] = value
            patched += 1

    for (side_id, sel_path), updates in _SELECTOR_FIELD_PATCHES.items():
        asts = list(_iter_matching_asts(ai_data, raw_cards, side_id))
        if not asts:
            print(f"[WARN] Field patch side not found: {side_id}")
            continue
        for ast in asts:
            sel = _resolve_selector_path(ast, sel_path)
            if sel is None:
                print(f"[WARN] Field patch selector not found: {side_id} -> {sel_path}")
                continue
            for key, value in updates.items():
                sel[key] = list(value) if isinstance(value, list) else value
            patched += 1

    return patched


def _roundtrip_validate_side_dict(side_ast: Dict[str, Any]) -> None:
    """Validates and normalizes a CardSideLogic AST dict in-place via Pydantic.

    Args:
        side_ast: Mutable CardSideLogic dictionary.
    """
    validated = CardSideLogic.model_validate(side_ast)
    dumped = validated.model_dump(exclude_none=True)
    side_ast.clear()
    side_ast.update(dumped)


def migrate(dry_run: bool = False) -> None:
    """Executes all metadata and AST migrations for IsHuman and Classes.

    Args:
        dry_run: When True, validates and reports without writing files or dist export.
    """
    for ext_path in _EXTENDED_FILES:
        if not ext_path.exists():
            continue
        dataset = _load_json(ext_path)
        cards = _extract_cards_list(dataset)
        for card in cards:
            apply_is_human_to_card_sides(card)
            normalize_card_classes(card)
        print(f"[Extended] Applied IsHuman & normalized Classes across {len(cards)} cards in {ext_path.name}")
        if not dry_run:
            _save_json_with_min(ext_path, dataset)

    if not dry_run and _FUZZY_FILE.exists():
        _DIST_FUZZY_FILE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(_FUZZY_FILE, _DIST_FUZZY_FILE)
        print(f"[Dist Sync] Copied {_FUZZY_FILE.name} to {_DIST_FUZZY_FILE}")

    ai_data = _load_json(_AI_PATH)
    raw_data = _load_json(_RAW_PATH)
    raw_cards = _extract_raw_cards_map(raw_data)

    patched_count = _patch_asts(ai_data, raw_cards)

    ai_validated = 0
    for entry in ai_data.values():
        if isinstance(entry, dict) and isinstance(entry.get("ast"), dict):
            _roundtrip_validate_side_dict(entry["ast"])
            ai_validated += 1

    raw_validated = 0
    for entry in raw_cards.values():
        sides = entry.get("sides") if isinstance(entry, dict) else None
        if not isinstance(sides, dict):
            continue
        for s_ast in sides.values():
            if isinstance(s_ast, dict):
                _roundtrip_validate_side_dict(s_ast)
                raw_validated += 1

    print(
        f"[ASTs] Pre-patched={patched_count}, Round-tripped AI={ai_validated}, Raw={raw_validated}"
    )

    if not dry_run:
        _save_json_with_min(_AI_PATH, ai_data)
        _save_json_with_min(_RAW_PATH, raw_data)
        stage10 = _SCRIPTS_DIR / "10_verify_logic.py"
        print("[Stage 10] Running verification and dist export...")
        subprocess.run(
            [sys.executable, str(stage10), "--export-dist"],
            cwd=str(_PROJECT_ROOT),
            check=True,
        )


def main() -> None:
    """CLI entry point for migrate_human_and_classes.py."""
    parser = argparse.ArgumentParser(description="Migrate IsHuman and Classes metadata and ASTs.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing files.")
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
