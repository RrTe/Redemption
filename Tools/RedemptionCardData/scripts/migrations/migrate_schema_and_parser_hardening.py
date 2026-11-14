"""Migration script for schema, parser hardening, and ability dataset sanitation.

Hardens existing abilities across card_abilities_raw.json and ai_generated_abilities.json:
1. Extracts natural-language stat expressions from TargetSelector.identifiers into StatFilter models.
2. Repairs erroneous 'deck' scopes caused by substring matching on 'discard pile'.
3. Corrects private-zone ownership (deck, reserve_pile, discard_pile, hand) from 'either'
   to 'controller' when no text evidence ('a/an/any/either/opponent') specifies otherwise.

The migration is idempotent and re-validates each affected CardSideLogic tree.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(BASE_DIR))

from models.logic.card_logic import CardSideLogic
from models.logic.stat_filter import StatFilter, parse_stat_filters

PRIVATE_ZONES: Set[str] = {"deck", "reserve_pile", "hand", "discard_pile"}

GENERIC_OWNER_RE = re.compile(
    r"\b(?:a|an|any|either)\s+(?:deck|draw\s+pile|card\s+pile|reserve(?:\s+pile)?|discard(?:\s+pile)?|hand)\b|"
    r"\bopponent(?:'s|s')?\b|\bany\s+player(?:'s)?\b",
    re.IGNORECASE,
)

DECK_ZONE_RE = re.compile(
    r"(?<!top)(?<!under)\b(?:draw\s+pile|deck)\b",
    re.IGNORECASE,
)


def build_text_index(ext_path: Path) -> Dict[str, str]:
    """Builds a lookup index from card IDs and side identifiers to raw ability texts.

    Args:
        ext_path: Path to cards_extended_with_ordir_fuzzy.json.

    Returns:
        Mapping from card identifier strings to special ability text strings.
    """
    id_to_text: Dict[str, str] = {}
    if not ext_path.exists():
        return id_to_text

    with ext_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    cards = data.get("cards", []) if isinstance(data, dict) else data
    for card in cards:
        cid = str(card.get("Id", "")).strip()
        if not cid:
            continue
        sides_dict = card.get("CardSides", {})
        for side_key in ("top", "bottom"):
            side_data = sides_dict.get(side_key, {})
            sa = side_data.get("SpecialAbility", "")
            if sa:
                id_to_text[f"{cid}_{side_key}"] = sa
                if cid not in id_to_text:
                    id_to_text[cid] = sa
        shared_sa = card.get("SpecialAbility", "")
        if shared_sa and cid not in id_to_text:
            id_to_text[cid] = shared_sa

    return id_to_text


def resolve_ability_text(
    card_id: str,
    side: str,
    entry: Dict[str, Any],
    text_index: Dict[str, str],
) -> str:
    """Resolves the raw ability text for a specific card side.

    Args:
        card_id: Canonical card identifier string.
        side: Side key ('top', 'bottom', or 'shared').
        entry: Ability record dictionary.
        text_index: Precomputed ability text lookup map.

    Returns:
        Clean ability text string, or empty string if not found.
    """
    raw_ab = entry.get("raw_ability")
    if isinstance(raw_ab, str) and raw_ab.strip():
        return raw_ab.strip()
    return text_index.get(f"{card_id}_{side}", text_index.get(card_id, ""))


def sanitize_selector(
    node: Dict[str, Any],
    ability_text: str,
    metrics: Counter[str],
) -> bool:
    """Sanitizes a single TargetSelector dictionary according to hardening rules.

    Args:
        node: TargetSelector dictionary state.
        ability_text: Ability text describing the card's rules.
        metrics: Running Counter recording modification statistics.

    Returns:
        True if any field in the selector was modified, otherwise False.
    """
    changed = False

    # 1. Stat-Filter extraction from identifiers
    raw_idents = node.get("identifiers")
    if isinstance(raw_idents, list) and raw_idents:
        remaining_idents: List[str] = []
        node_filters = list(node.get("stat_filters") or [])
        idents_modified = False

        for ident in raw_idents:
            parsed = parse_stat_filters(str(ident))
            if parsed:
                idents_modified = True
                metrics["stat_filters_migrated"] += len(parsed)
                for sf in parsed:
                    sf_dump = sf.model_dump(exclude_none=True)
                    if sf_dump not in node_filters:
                        node_filters.append(sf_dump)
            else:
                remaining_idents.append(ident)

        if idents_modified:
            node["identifiers"] = remaining_idents
            node["stat_filters"] = node_filters
            changed = True

    # 2. Discard-pile scope repair
    scopes = node.get("scope")
    if isinstance(scopes, list):
        t_low = ability_text.lower()
        if "discard pile" in t_low:
            has_deck_zone = bool(DECK_ZONE_RE.search(t_low))
            if "deck" in scopes:
                if not has_deck_zone:
                    node["scope"] = ["discard_pile" if s == "deck" else s for s in scopes]
                    node["scope"] = list(dict.fromkeys(node["scope"]))
                    metrics["discard_scope_replaced"] += 1
                    changed = True
                elif "discard_pile" not in scopes:
                    node["scope"].append("discard_pile")
                    node["scope"] = list(dict.fromkeys(node["scope"]))
                    metrics["discard_scope_added"] += 1
                    changed = True

    # 3. Private-zone owner correction
    new_scopes = node.get("scope")
    if isinstance(new_scopes, list) and any(s in PRIVATE_ZONES for s in new_scopes):
        if node.get("zone_owner") == "either":
            if not GENERIC_OWNER_RE.search(ability_text):
                node["zone_owner"] = "controller"
                metrics["zone_owner_controller"] += 1
                changed = True

    return changed


def walk_and_sanitize(
    node: Any,
    ability_text: str,
    metrics: Counter[str],
) -> bool:
    """Recursively walks an AST subtree and applies sanitation to all TargetSelectors.

    Args:
        node: AST node (dict, list, or primitive).
        ability_text: Ability text describing the card's rules.
        metrics: Running Counter recording modification statistics.

    Returns:
        True if any selector within the subtree was modified, otherwise False.
    """
    node_changed = False
    if isinstance(node, dict):
        if "scope" in node or "identifiers" in node:
            if sanitize_selector(node, ability_text, metrics):
                node_changed = True
        for val in node.values():
            if walk_and_sanitize(val, ability_text, metrics):
                node_changed = True
    elif isinstance(node, list):
        for item in node:
            if walk_and_sanitize(item, ability_text, metrics):
                node_changed = True
    return node_changed


def migrate_dataset(
    file_path: Path,
    text_index: Dict[str, str],
    is_ai: bool = False,
    dry_run: bool = False,
) -> Tuple[int, Counter[str]]:
    """Migrates and hardens a full ability dataset file in-place or dry-run.

    Args:
        file_path: Path to the target abilities JSON file.
        text_index: Precomputed ability text lookup map.
        is_ai: True if processing ai_generated_abilities format, False for raw format.
        dry_run: If True, skips writing changes back to disk.

    Returns:
        Tuple of (modified_card_count, metrics_counter).
    """
    print(f"\nProcessing dataset: {file_path}")
    with file_path.open("r", encoding="utf-8") as f:
        data: Dict[str, Any] = json.load(f)

    metrics: Counter[str] = Counter()
    modified_cards = 0

    for entry_key, entry_val in data.items():
        if not isinstance(entry_val, dict):
            continue

        card_modified = False
        if is_ai:
            cid = str(entry_val.get("card_id", entry_key.split("_")[0])).strip()
            side = entry_val.get("side", "top")
            ast = entry_val.get("ast", {})
            txt = resolve_ability_text(cid, side, entry_val, text_index)
            if walk_and_sanitize(ast, txt, metrics):
                CardSideLogic.model_validate(ast)
                card_modified = True
        else:
            cid = str(entry_val.get("card_identifier", entry_key)).strip()
            sides = entry_val.get("sides", {})
            for side_name, side_ast in sides.items():
                if isinstance(side_ast, dict):
                    txt = resolve_ability_text(cid, side_name, entry_val, text_index)
                    if walk_and_sanitize(side_ast, txt, metrics):
                        CardSideLogic.model_validate(side_ast)
                        card_modified = True

        if card_modified:
            modified_cards += 1

    if not dry_run and modified_cards > 0:
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Saved {modified_cards} modified cards to: {file_path}")
    else:
        print(f"[Dry-Run / No Changes] {modified_cards} cards modified in memory.")

    return modified_cards, metrics


def run_full_migration(dry_run: bool = False) -> None:
    """Executes the schema and parser hardening migration across both ability datasets.

    Args:
        dry_run: If True, evaluates transformations without persisting files.

    Returns:
        None.
    """
    raw_path = BASE_DIR / "data" / "card_abilities_raw.json"
    ai_path = BASE_DIR / "data" / "ai_generated_abilities.json"
    ext_path = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"

    print("Building ability text reference index from extended cards...")
    text_index = build_text_index(ext_path)
    print(f"Reference index ready with {len(text_index)} card text entries.")

    raw_mod, raw_metrics = migrate_dataset(raw_path, text_index, is_ai=False, dry_run=dry_run)
    ai_mod, ai_metrics = migrate_dataset(ai_path, text_index, is_ai=True, dry_run=dry_run)

    print("\n================ MIGRATION SUMMARY ================")
    print(f"card_abilities_raw.json:      {raw_mod} cards modified")
    for k, v in raw_metrics.items():
        print(f"  - {k}: {v}")
    print(f"ai_generated_abilities.json:  {ai_mod} cards modified")
    for k, v in ai_metrics.items():
        print(f"  - {k}: {v}")
    print("===================================================\n")


def main() -> None:
    """CLI entrypoint for running the hardening migration script."""
    parser = argparse.ArgumentParser(
        description="Migrate StatFilters, repair discard pile scopes, and fix private zone owners."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate migration without saving changes to disk.",
    )
    args = parser.parse_args()
    run_full_migration(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
