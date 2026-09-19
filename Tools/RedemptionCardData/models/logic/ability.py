"""Ability model representing an ability clause with connected effects.

Orchestrates activation modes, trigger events, conditions, costs, sequential
effects, and ability-specific modifiers per REG Section 'Abilities'.
"""

from __future__ import annotations
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from models.enums.activation_mode import ActivationMode
from models.logic.target_selector import TargetSelector
from models.logic.condition_expression import ConditionExpression
from models.logic.action_effect import ActionEffect
from models.logic.modifier import Modifier


class Ability(BaseModel):
    """Specification of a connected set of effects within a special ability.

    Attributes:
        ability_id: Unique string identifier for this ability clause.
        activation_mode: How and when this ability activates.
        is_optional: True if activation includes 'may' or is a player choice.
        is_preventable: O(1) flag indicating if ability can be prevented.
        is_interruptible: O(1) flag indicating if ability can be interrupted.
        is_negatable: O(1) flag indicating if ability can be negated.
        trigger_event: The event triggering this ability if activation is TRIGGERED.
        trigger_filter: Entity criteria filtering valid triggering events.
        conditions: List of prerequisite game-state checks.
        costs: List of sequential prerequisite actions that must be paid.
        effects: List of sequential effect actions resolving upon activation.
        modifiers: List of modifiers scoped specifically to this ability.
    """
    ability_id: str
    activation_mode: ActivationMode = ActivationMode.IMMEDIATE
    is_optional: bool = False
    is_preventable: bool = True
    is_interruptible: bool = True
    is_negatable: bool = True
    trigger_event: Optional[str] = None
    trigger_filter: Optional[TargetSelector] = None
    conditions: List[ConditionExpression] = Field(default_factory=list)
    costs: List[ActionEffect] = Field(default_factory=list)
    effects: List[ActionEffect] = Field(default_factory=list)
    modifiers: List[Modifier] = Field(default_factory=list)
    choice_group: Optional[str] = Field(default=None, description="Groups mutually exclusive modal choices.")

    @field_validator("activation_mode", mode="before")
    @classmethod
    def normalize_activation_mode(cls, value: Any) -> Any:
        """Normalizes LLM phrasing variations for activation mode.

        Args:
            value: Raw input value before enum validation.

        Returns:
            Canonical ActivationMode enum or original value.
        """
        if isinstance(value, str):
            clean = value.strip().lower().replace("-", "_").replace(" ", "_")
            if clean in ("manual_triggered", "manual", "manually"):
                return ActivationMode.MANUALLY_TRIGGERED
        return value

    @model_validator(mode="after")
    def validate_has_payload(self) -> Ability:
        """Ensures that an ability contains at least one effect or modifier."""
        if not self.effects and not self.modifiers:
            raise ValueError(
                f"Ability '{self.ability_id}' must contain at least one action effect (e.g. 'first strike', 'draw') "
                "or modifier. Empty effects are not allowed."
            )
        return self
