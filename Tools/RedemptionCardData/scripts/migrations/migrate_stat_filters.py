"""Migration script for converting unprincipled stat strings in TargetSelector.identifiers to StatFilter ASTs.

Traverses all TargetSelector instances in `data/ai_generated_abilities.json`
(conditions, costs, effects, protection filters, trigger filters), identifies natural-language
stat constraint strings via regex, removes them from `identifiers`, and populates `stat_filters`.
Re-validates each tree through CardSideLogic and writes back the migrated dataset.
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

from models.logic.card_logic import CardSideLogic
from models.logic.stat_filter import StatFilter, parse_stat_filters
from models.logic.target_selector import TargetSelector


def collect_selectors(side_logic: CardSideLogic) -> List[TargetSelector]:
    """Extracts all TargetSelector nodes from a CardSideLogic tree.

    Args:
        side_logic: Validated CardSideLogic instance.

    Returns:
        List of all TargetSelector references in the tree.
    """
    selectors: List[TargetSelector] = []
    for ability in side_logic.abilities:
        if ability.trigger_filter:
            selectors.append(ability.trigger_filter)
        for cond in ability.conditions:
            if cond.selector:
                selectors.append(cond.selector)
        for cost in ability.costs:
            if cost.target:
                selectors.append(cost.target)
            if cost.protection_filter:
                selectors.extend(cost.protection_filter.card_sources)
        for eff in ability.effects:
            if eff.target:
                selectors.append(eff.target)
            if eff.protection_filter:
                selectors.extend(eff.protection_filter.card_sources)
    return selectors


def scan_raw_identifiers(ast_data: Any) -> List[str]:
    """Recursively scans a dictionary or list for all identifier strings matching stat patterns.

    Args:
        ast_data: Raw JSON AST object.

    Returns:
        List of all raw identifier strings that qualify as stat filters.
    """
    found: List[str] = []
    if isinstance(ast_data, dict):
        if "identifiers" in ast_data and isinstance(ast_data["identifiers"], list):
            for ident in ast_data["identifiers"]:
                if parse_stat_filters(str(ident)):
                    found.append(str(ident))
        for v in ast_data.values():
            found.extend(scan_raw_identifiers(v))
    elif isinstance(ast_data, list):
        for item in ast_data:
            found.extend(scan_raw_identifiers(item))
    return found


def migrate_card_ast(raw_ast: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Tuple[str, List[StatFilter]]]]:
    """Migrates a single raw card AST, extracting stat filters and returning the clean dict.

    Args:
        raw_ast: Raw dictionary AST for a card side.

    Returns:
        Tuple of (migrated AST dictionary, list of (original_ident, parsed_filters) tuples).
    """
    migrations: List[Tuple[str, List[StatFilter]]] = []

    # Detect initial stat strings before validation
    initial_stat_strings = scan_raw_identifiers(raw_ast)
    for raw_str in initial_stat_strings:
        parsed = parse_stat_filters(raw_str)
        if parsed:
            migrations.append((raw_str, parsed))

    # Validating CardSideLogic triggers TargetSelector.normalize_plural_target_semantics,
    # which moves recognized stat strings into stat_filters and strips them from identifiers.
    side_logic = CardSideLogic.model_validate(raw_ast)
    clean_dict = side_logic.model_dump(exclude_none=True)

    return clean_dict, migrations


def run_migration(
    input_file: Path,
    output_file: Path | None = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Executes the StatFilter migration across all cards in the specified JSON file.

    Args:
        input_file: Path to source abilities JSON file.
        output_file: Optional destination path; defaults to input_file.
        dry_run: If True, skips writing changes back to disk.

    Returns:
        Summary dictionary containing migration metrics.
    """
    target_out = output_file or input_file
    print(f"Loading ability data from: {input_file}")
    with input_file.open("r", encoding="utf-8") as f:
        data: Dict[str, Any] = json.load(f)

    total_cards = len(data)
    modified_cards = 0
    total_stat_strings_migrated = 0
    stat_type_counter: Counter[str] = Counter()
    operator_counter: Counter[str] = Counter()
    log_samples: List[str] = []

    for entry_key, entry_val in data.items():
        if not isinstance(entry_val, dict):
            continue

        card_name = entry_val.get("card_name", entry_key)
        card_id = entry_val.get("card_id", entry_val.get("card_identifier", entry_key))

        # Handle Stage 9 format (entry has "ast")
        if "ast" in entry_val and isinstance(entry_val["ast"], dict):
            migrated_ast, card_migrations = migrate_card_ast(entry_val["ast"])
            if card_migrations:
                modified_cards += 1
                total_stat_strings_migrated += len(card_migrations)
                for orig_str, filters in card_migrations:
                    filter_repr = ", ".join(
                        f"{f.stat} {f.operator} {f.value if f.value is not None else f.variable}"
                        for f in filters
                    )
                    for f in filters:
                        stat_type_counter[f.stat] += 1
                        operator_counter[f.operator] += 1
                    if len(log_samples) < 15:
                        log_samples.append(
                            f"  [{card_id}] {card_name}: '{orig_str}' -> [{filter_repr}]"
                        )
                entry_val["ast"] = migrated_ast

        # Handle raw format (entry has "sides")
        elif "sides" in entry_val and isinstance(entry_val["sides"], dict):
            any_migrated = False
            for side_name, side_ast in entry_val["sides"].items():
                if isinstance(side_ast, dict):
                    migrated_side, side_migrations = migrate_card_ast(side_ast)
                    if side_migrations:
                        any_migrated = True
                        total_stat_strings_migrated += len(side_migrations)
                        for orig_str, filters in side_migrations:
                            filter_repr = ", ".join(
                                f"{f.stat} {f.operator} {f.value if f.value is not None else f.variable}"
                                for f in filters
                            )
                            for f in filters:
                                stat_type_counter[f.stat] += 1
                                operator_counter[f.operator] += 1
                            if len(log_samples) < 15:
                                log_samples.append(
                                    f"  [{card_id}] {card_name} ({side_name}): '{orig_str}' -> [{filter_repr}]"
                                )
                        entry_val["sides"][side_name] = migrated_side
            if any_migrated:
                modified_cards += 1

    print(f"\nMigration Results:")
    print(f" - Total Cards Evaluated:      {total_cards}")
    print(f" - Cards Migrated:             {modified_cards}")
    print(f" - Stat Strings Transformed:   {total_stat_strings_migrated}")
    print(f" - Migrated Stats Breakdown:   {dict(stat_type_counter)}")
    print(f" - Operator Breakdown:         {dict(operator_counter)}")

    if log_samples:
        print("\nSample Transformations:")
        for sample in log_samples:
            print(sample)

    if not dry_run:
        target_out.parent.mkdir(parents=True, exist_ok=True)
        with target_out.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\nSuccessfully wrote migrated abilities to: {target_out}")
    else:
        print("\n[Dry-Run Mode] No files were modified on disk.")

    return {
        "total_cards": total_cards,
        "modified_cards": modified_cards,
        "total_stat_strings_migrated": total_stat_strings_migrated,
        "stat_breakdown": dict(stat_type_counter),
        "operator_breakdown": dict(operator_counter),
    }


def main() -> None:
    """CLI entrypoint for executing the stat filter migration."""
    parser = argparse.ArgumentParser(
        description="Migrate unprincipled stat strings from TargetSelector.identifiers to StatFilter models."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=BASE_DIR / "data" / "ai_generated_abilities.json",
        help="Input JSON file with card abilities.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON file (defaults to in-place overwrite).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate migration without modifying disk files.",
    )
    args = parser.parse_args()

    run_migration(args.input, args.output, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
