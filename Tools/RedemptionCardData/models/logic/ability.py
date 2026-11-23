"""Ability model representing an ability clause with connected effects.

Orchestrates activation modes, trigger events, conditions, costs, sequential
effects, and ability-specific modifiers per REG Section 'Abilities'.
"""

from __future__ import annotations
from typing import Any, List, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator
from models.enums.activation_mode import ActivationMode
from models.enums.trigger_event import TriggerEvent
from models.logic.target_selector import TargetSelector
from models.logic.condition_expression import ConditionExpression
from models.logic.action_effect import ActionEffect
from models.logic.modifier import Modifier


class Ability(BaseModel):
    """Specification of a connected set of effects within a special ability.

    Attributes:
        ability_id: Unique string identifier for this ability clause.
        is_star: True when this clause belongs to a Star ability side.
        activation_mode: How and when this ability activates.
        is_optional: True if activation includes 'may' or is a player choice.
        is_preventable: O(1) flag indicating if ability can be prevented.
        is_interruptible: O(1) flag indicating if ability can be interrupted.
        is_negatable: O(1) flag indicating if ability can be negated.
        trigger_event: Atomic TriggerEvent (or list of TriggerEvents) if triggered.
        trigger_subject: Entity affected by or performing the trigger event.
        trigger_source: Causing card/ability or origin zone/zone filter of the event.
        conditions: List of prerequisite game-state checks.
        costs: List of sequential prerequisite actions that must be paid.
        effects: List of sequential effect actions resolving upon activation.
        modifiers: List of modifiers scoped specifically to this ability.
    """
    ability_id: str
    is_star: bool = False
    activation_mode: ActivationMode = ActivationMode.IMMEDIATE
    is_optional: bool = False
    is_preventable: bool = True
    is_interruptible: bool = True
    is_negatable: bool = True
    trigger_event: Optional[Union[TriggerEvent, List[TriggerEvent]]] = None
    trigger_subject: Optional[TargetSelector] = None
    trigger_source: Optional[TargetSelector] = None
    conditions: List[ConditionExpression] = Field(default_factory=list)
    costs: List[ActionEffect] = Field(default_factory=list)
    effects: List[ActionEffect] = Field(default_factory=list)
    modifiers: List[Modifier] = Field(default_factory=list)
    choice_group: Optional[str] = Field(default=None, description="Groups mutually exclusive modal choices.")

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_trigger_fields(cls, data: Any) -> Any:
        """Maps legacy trigger_filter payloads onto trigger_subject and normalizes star triggers."""
        if not isinstance(data, dict):
            return data
        out = dict(data)
        legacy_tf = out.pop("trigger_filter", None)
        if legacy_tf is not None and out.get("trigger_subject") is None:
            out["trigger_subject"] = legacy_tf
        return out

    @field_validator("trigger_event", mode="before")
    @classmethod
    def normalize_trigger_event(cls, value: Any) -> Any:
        """Normalizes star aliases and deduplicates trigger_event lists before enum validation.

        Args:
            value: Raw trigger_event string, enum, list, or None.

        Returns:
            Canonical TriggerEvent value, list of TriggerEvent values, or None.
        """
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return None
            if cleaned.lower() == "star":
                return TriggerEvent.STAR_PHASE.value
            return cleaned
        if isinstance(value, (list, tuple)):
            deduped: List[Any] = []
            for item in value:
                if item is None:
                    continue
                if isinstance(item, str):
                    cleaned = item.strip()
                    if not cleaned:
                        continue
                    item_val: Any = TriggerEvent.STAR_PHASE.value if cleaned.lower() == "star" else cleaned
                else:
                    item_val = item
                if item_val not in deduped:
                    deduped.append(item_val)
            if not deduped:
                return None
            return deduped[0] if len(deduped) == 1 else deduped
        return value

    @field_validator("choice_group", mode="before")
    @classmethod
    def normalize_choice_group(cls, value: Any) -> Optional[str]:
        """Normalizes empty or whitespace-only choice_group values to None.

        Args:
            value: Raw choice_group input value.

        Returns:
            Stripped non-empty group identifier or None.
        """
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return str(value).strip() or None

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
        """Ensures that an ability contains at least one effect or modifier and normalizes Star flags."""
        if not self.effects and not self.modifiers:
            raise ValueError(
                f"Ability '{self.ability_id}' must contain at least one action effect (e.g. 'first strike', 'draw') "
                "or modifier. Empty effects are not allowed."
            )
        has_star_trig = self.trigger_event == TriggerEvent.STAR_PHASE or (
            isinstance(self.trigger_event, list) and TriggerEvent.STAR_PHASE in self.trigger_event
        )
        if (
            self.is_star
            or has_star_trig
            or self.ability_id.lower().startswith("star_")
            or self.ability_id.lower() == "star"
        ):
            self.is_star = True
            if not self.trigger_event:
                self.trigger_event = TriggerEvent.STAR_PHASE
            if not self.ability_id.lower().startswith("star_"):
                self.ability_id = f"star_{self.ability_id}"
            if self.activation_mode != ActivationMode.TRIGGERED:
                self.activation_mode = ActivationMode.TRIGGERED
        return self
