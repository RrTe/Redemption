"""Migration script introducing typed gender across card data and ability ASTs.

Performs three idempotent operations:
1. Enriches all character sides in data/cards_extended_with_ordir_fuzzy.json (and .min.json)
   with resolved 'Gender' ('male', 'female', 'both', 'genderless') via GenderResolver.
2. Migrates all ASTs in data/ai_generated_abilities.json and data/card_abilities_raw.json
   by re-validating through CardSideLogic (moving 'male'/'female' out of 'identifiers'
   and into TargetSelector.gender).
3. Executes Stage 10 verification & dist export (scripts/10_verify_logic.py --export-dist).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(BASE_DIR))

from models.enums.gender import CHARACTER_SIDE_TYPES
from models.logic.card_logic import CardSideLogic
from models.logic.target_decomposer import try_decompose_phrase
from scripts.utils.card_helpers import get_side_field
from scripts.utils.gender_resolver import apply_gender_to_card_sides


def scan_gender_identifiers(ast_data: Any) -> List[str]:
    """Scans a nested AST dict/list for raw gender tokens in selector identifiers.

    Args:
        ast_data: Arbitrary JSON-like AST subtree.

    Returns:
        List of identifier strings representing extractable gender filters.
    """
    found: List[str] = []
    if isinstance(ast_data, dict):
        idents = ast_data.get("identifiers")
        if isinstance(idents, list):
            for ident in idents:
                s = str(ident).strip()
                if s.lower() in ("male", "female"):
                    found.append(s)
                else:
                    dec = try_decompose_phrase(s, is_from_titles=False)
                    if dec is not None and dec.get("gender"):
                        found.append(s)
        for val in ast_data.values():
            found.extend(scan_gender_identifiers(val))
    elif isinstance(ast_data, list):
        for item in ast_data:
            found.extend(scan_gender_identifiers(item))
    return found


def migrate_card_ast(raw_ast: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Migrates a single side AST via CardSideLogic validation.

    Args:
        raw_ast: Raw CardSideLogic dictionary.

    Returns:
        Tuple of (migrated_ast_dict, list_of_migrated_identifier_strings).
    """
    detected = scan_gender_identifiers(raw_ast)
    side_logic = CardSideLogic.model_validate(raw_ast)
    return side_logic.model_dump(exclude_none=True), detected


def migrate_extended_cards(
    cards_path: Path,
    cards_min_path: Path | None = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Enriches all character cards in cards_extended_with_ordir_fuzzy.json with Gender.

    Args:
        cards_path: Path to cards_extended_with_ordir_fuzzy.json.
        cards_min_path: Optional path to minified variant.
        dry_run: When True, computes metrics without modifying files on disk.

    Returns:
        Summary dictionary of processed character cards and gender distribution.
    """
    with cards_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    cards: List[Dict[str, Any]] = payload.get("cards", []) if isinstance(payload, dict) else payload
    char_cards = 0
    char_sides = 0
    updated_cards = 0
    gender_counts: Counter[str] = Counter()

    for card in cards:
        if not card.get("IsCharacter"):
            continue
        char_cards += 1
        if apply_gender_to_card_sides(card):
            updated_cards += 1

        sides = card.get("CardSides") or {}
        real_keys = [k for k, v in sides.items() if k != "shared" and isinstance(v, dict)] or ["top"]
        for sk in real_keys:
            if get_side_field(card, sk, "Type") in CHARACTER_SIDE_TYPES:
                char_sides += 1
                g_val = get_side_field(card, sk, "Gender")
                if g_val:
                    gender_counts[str(g_val)] += 1

    if not dry_run:
        out_obj = {"cards": cards} if isinstance(payload, dict) else cards
        with cards_path.open("w", encoding="utf-8") as handle:
            json.dump(out_obj, handle, indent=2, ensure_ascii=False)
        if cards_min_path is not None and cards_min_path.exists():
            with cards_min_path.open("w", encoding="utf-8") as handle:
                json.dump(out_obj, handle, separators=(",", ":"), ensure_ascii=False)

    return {
        "total_cards": len(cards),
        "character_cards": char_cards,
        "character_sides": char_sides,
        "updated_cards": updated_cards,
        "gender_distribution": dict(gender_counts),
    }


def migrate_abilities_file(input_path: Path, dry_run: bool = False) -> Dict[str, Any]:
    """Migrates TargetSelector gender identifiers in an abilities JSON dataset.

    Supports both Stage 9 format (entries with top-level 'ast') and Stage 8
    raw format (entries with 'sides' mapping side_key -> side_ast).

    Args:
        input_path: Path to ai_generated_abilities.json or card_abilities_raw.json.
        dry_run: When True, skips writing changes back to disk.

    Returns:
        Summary dictionary with counts of modified entries and migrated tokens.
    """
    with input_path.open("r", encoding="utf-8") as handle:
        data: Dict[str, Any] = json.load(handle)

    modified_entries = 0
    migrated_tokens = 0
    errors: List[str] = []

    for key, val in data.items():
        if not isinstance(val, dict):
            continue

        if "ast" in val and isinstance(val["ast"], dict):
            hits = scan_gender_identifiers(val["ast"])
            if hits:
                try:
                    migrated_ast, _ = migrate_card_ast(val["ast"])
                    val["ast"] = migrated_ast
                    modified_entries += 1
                    migrated_tokens += len(hits)
                except Exception as exc:
                    errors.append(f"{key}: {exc}")
        elif "sides" in val and isinstance(val["sides"], dict):
            side_changed = False
            for side_key, side_ast in list(val["sides"].items()):
                if not isinstance(side_ast, dict):
                    continue
                hits = scan_gender_identifiers(side_ast)
                if hits:
                    try:
                        migrated_ast, _ = migrate_card_ast(side_ast)
                        val["sides"][side_key] = migrated_ast
                        side_changed = True
                        migrated_tokens += len(hits)
                    except Exception as exc:
                        errors.append(f"{key}.{side_key}: {exc}")
            if side_changed:
                modified_entries += 1

    if not dry_run and modified_entries > 0:
        with input_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)

    return {
        "file": str(input_path.name),
        "total_entries": len(data),
        "modified_entries": modified_entries,
        "migrated_tokens": migrated_tokens,
        "errors": errors,
    }


def run_migration(dry_run: bool = False, run_stage10: bool = True) -> Dict[str, Any]:
    """Executes the full gender migration workflow across datasets and dist exports.

    Args:
        dry_run: Preview migration changes without modifying JSON files.
        run_stage10: Run Stage 10 verification and dist export after migrating.

    Returns:
        Aggregated metrics dictionary from all migration stages.
    """
    with (BASE_DIR / "config.json").open("r", encoding="utf-8") as cf:
        cfg = json.load(cf)

    cards_path = BASE_DIR / cfg.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")
    cards_min_path = BASE_DIR / cfg.get("cards_extended_with_ordir_fuzzy_min", "data/cards_extended_with_ordir_fuzzy.min.json")
    ai_path = BASE_DIR / "data" / "ai_generated_abilities.json"
    raw_path = BASE_DIR / cfg.get("card_abilities_raw", "data/card_abilities_raw.json")

    card_stats = migrate_extended_cards(cards_path, cards_min_path=cards_min_path, dry_run=dry_run)
    ai_stats = migrate_abilities_file(ai_path, dry_run=dry_run) if ai_path.exists() else {}
    raw_stats = migrate_abilities_file(raw_path, dry_run=dry_run) if raw_path.exists() else {}

    print("Gender Migration Summary:")
    print(f"  Extended Cards: {card_stats}")
    print(f"  AI Abilities:   {ai_stats}")
    print(f"  Raw Abilities:  {raw_stats}")

    if run_stage10 and not dry_run:
        import importlib
        stage10 = importlib.import_module("scripts.10_verify_logic")
        stage10.run_logic_verifier(export_dist=True)

    return {
        "cards": card_stats,
        "ai_abilities": ai_stats,
        "raw_abilities": raw_stats,
    }


def _parse_args() -> argparse.Namespace:
    """Parses migration CLI arguments."""
    parser = argparse.ArgumentParser(description="Migrate character gender and TargetSelector.gender across datasets.")
    parser.add_argument("--dry-run", action="store_true", help="Compute migration metrics without writing files.")
    parser.add_argument("--skip-stage10", action="store_true", help="Skip Stage 10 dist export after migration.")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run_migration(dry_run=args.dry_run, run_stage10=not args.skip_stage10)
