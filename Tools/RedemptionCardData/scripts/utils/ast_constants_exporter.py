"""Exporter utility for canonical Redemption REG v11.1.0 AST constants."""

from __future__ import annotations
import json
from pathlib import Path

from models.enums.action_verb import (
    ABILITY_FILTER_ACTION_VERBS,
    CANONICAL_EFFECT_ACTION_VERBS,
)
from models.enums.activation_mode import ActivationMode
from models.enums.duration import Duration
from models.enums.selection_mode import SelectionMode
from models.enums.state_filter import CANONICAL_STATE_FILTERS
from models.enums.trigger_event import CANONICAL_TRIGGER_EVENTS
from models.enums.zone import Zone
from models.enums.modifier_type import ModifierType
from models.enums.condition_type import ConditionType
from models.enums.gender import TARGET_GENDERS
from models.logic.action_effect import BATTLE_RESTRICTIONS, TARGET_PHASES
from models.logic.dynamic_value import DYNAMIC_VALUE_SOURCES, STAT_MOD_OPERATIONS
from models.logic.relative_filter import (
    RELATIVE_FILTER_ATTRIBUTES,
    RELATIVE_FILTER_REFERENCES,
    RELATIVE_FILTER_RELATIONS,
)
from models.logic.target_decomposer import CANONICAL_CARD_TYPES

try:
    from utils.target_phase5b_helper import PRINTED_SELECTOR_IDENTIFIERS
except ImportError:
    from scripts.utils.target_phase5b_helper import PRINTED_SELECTOR_IDENTIFIERS


def export_ast_constants(output_path: Path) -> None:
    """Exports all official REG enums and valid AST values as a single source of truth JSON.

    Args:
        output_path: Destination path for the exported constants JSON file.
    """
    constants = {
        "version": "11.1.0",
        "action_verbs": list(CANONICAL_EFFECT_ACTION_VERBS),
        "ability_filter_actions": list(ABILITY_FILTER_ACTION_VERBS),
        "target_phases": list(TARGET_PHASES),
        "battle_restrictions": list(BATTLE_RESTRICTIONS),
        "stat_mod_operations": list(STAT_MOD_OPERATIONS),
        "dynamic_value_sources": list(DYNAMIC_VALUE_SOURCES),
        "activation_modes": [e.value for e in ActivationMode],
        "trigger_events": list(CANONICAL_TRIGGER_EVENTS),
        "durations": [e.value for e in Duration],
        "selection_modes": [e.value for e in SelectionMode],
        "zones": [e.value for e in Zone],
        "target_types": sorted(CANONICAL_CARD_TYPES),
        "genders": list(TARGET_GENDERS),
        "testaments": ["OT", "NT"],
        "card_classes": ["Warrior", "Weapon", "Territory"],
        "modifier_types": [e.value for e in ModifierType],
        "condition_types": [e.value for e in ConditionType],
        "dependencies": ["always", "if_previous_successful", "if_you_do", "if_you_cannot", "otherwise"],
        "zone_owners": ["controller", "opponent", "both", "either", "target_player"],
        "destination_positions": ["top", "bottom", "random", "as_is"],
        "dynamic_value_fields": ["fixed_value", "min_value", "max_value", "dynamic"],
        "stat_filter_stats": ["strength", "toughness", "both", "either"],
        "stat_filter_operators": [">=", "<=", "==", ">", "<", "!="],
        "state_filters": list(CANONICAL_STATE_FILTERS),
        "relative_filter_attributes": list(RELATIVE_FILTER_ATTRIBUTES),
        "relative_filter_relations": list(RELATIVE_FILTER_RELATIONS),
        "relative_filter_references": list(RELATIVE_FILTER_REFERENCES),
        "printed_selector_identifiers": list(PRINTED_SELECTOR_IDENTIFIERS),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(constants, f, indent=2, ensure_ascii=False)
