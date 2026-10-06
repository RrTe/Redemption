"""Exporter utility for canonical Redemption REG v11.0.0 AST constants."""

from __future__ import annotations
import json
from pathlib import Path

from models.enums.action_verb import ActionVerb
from models.enums.activation_mode import ActivationMode
from models.enums.duration import Duration
from models.enums.selection_mode import SelectionMode
from models.enums.zone import Zone
from models.enums.modifier_type import ModifierType
from models.enums.condition_type import ConditionType


def export_ast_constants(output_path: Path) -> None:
    """Exports all official REG enums and valid AST values as a single source of truth JSON.

    Args:
        output_path: Destination path for the exported constants JSON file.
    """
    constants = {
        "version": "11.0.0",
        "action_verbs": sorted([e.value for e in ActionVerb if e != ActionVerb.UNKNOWN]),
        "activation_modes": [e.value for e in ActivationMode],
        "durations": [e.value for e in Duration],
        "selection_modes": [e.value for e in SelectionMode],
        "zones": [e.value for e in Zone],
        "modifier_types": [e.value for e in ModifierType],
        "condition_types": [e.value for e in ConditionType],
        "dependencies": ["always", "if_previous_successful", "if_you_do", "if_you_cannot", "otherwise"],
        "zone_owners": ["controller", "opponent", "both", "either", "target_player"],
        "destination_positions": ["top", "bottom", "random", "as_is"]
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(constants, f, indent=2, ensure_ascii=False)
