"""Exporter utility for the canonical Redemption CCG card type hierarchy.

Serializes CardType definitions, bidirectional TYPE_GROUPS, and TYPE_IS_A
inheritance mappings into a deterministic JSON structure (cardHierarchy.json)
for use by the Redemption Coliseum game engine and AST target resolution.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List

from models.enums.card_type import CardType, TYPE_GROUPS, TYPE_IS_A
from models.enums.gender import GENDERS

# Canonical ordering for group members to guarantee deterministic JSON output
# while preserving the logical domain order expected by the game engine.
_CANONICAL_GROUP_ORDER: Dict[str, List[str]] = {
    "Enhancement": ["GE", "EE"],
    "Character": ["Hero", "Evil Character", "Hero Token", "Evil Character Token"],
    "City": ["Fortress", "Site"],
}


def build_card_hierarchy_payload() -> Dict[str, Any]:
    """Builds the JSON-serializable card hierarchy dictionary from canonical enums.

    Converts set-based TYPE_GROUPS into deterministically ordered lists so that
    repeated pipeline runs produce byte-identical JSON outputs.

    Args:
        None

    Returns:
        Dict[str, Any]: Dictionary containing 'card_types', 'type_groups', and 'type_is_a'.
    """
    card_types: List[str] = [ct.value for ct in CardType]

    type_groups: Dict[str, List[str]] = {}
    for group_name, members_set in TYPE_GROUPS.items():
        if group_name in _CANONICAL_GROUP_ORDER:
            ordered = [m for m in _CANONICAL_GROUP_ORDER[group_name] if m in members_set]
            remaining = sorted(members_set - set(ordered))
            type_groups[group_name] = ordered + remaining
        else:
            type_groups[group_name] = sorted(members_set)

    type_is_a: Dict[str, List[str]] = {
        subtype: list(parents) for subtype, parents in TYPE_IS_A.items()
    }

    return {
        "card_types": card_types,
        "type_groups": type_groups,
        "type_is_a": type_is_a,
        "genders": list(GENDERS),
    }


def export_card_hierarchy(output_path: Path) -> Dict[str, Any]:
    """Exports the canonical card type hierarchy to a JSON file.

    Args:
        output_path: Destination file path (e.g., data/dist/cardHierarchy.json).

    Returns:
        Dict[str, Any]: The exported hierarchy payload.
    """
    payload = build_card_hierarchy_payload()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return payload

