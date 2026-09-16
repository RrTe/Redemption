"""Atomic action effect model defining sequential steps of an ability.

Models individual effect verbs (e.g. discard, interrupt, draw) with their
targets, destinations, durations, context scope creators, and dependencies.
"""

from typing import Optional, Literal, Any
from pydantic import BaseModel, field_validator
from models.enums.action_verb import ActionVerb
from models.enums.duration import Duration
from models.enums.zone import Zone
from models.logic.target_selector import TargetSelector


class ActionEffect(BaseModel):
    """Specification of an atomic effect action within an ability.

    Attributes:
        step: 1-indexed execution order sequence number.
        action: Specific REG action verb being executed.
        effect_type: Whether the effect completes instantly or remains ongoing.
        duration: Temporal boundary for ongoing or lingering effects.
        target: Target selector defining the entities acted upon.
        destination: Target zone if this action moves cards.
        destination_position: Placement in the target zone (top, bottom, etc.).
        strength_mod: Numeric modifier to strength for modify_stats actions.
        toughness_mod: Numeric modifier to toughness for modify_stats actions.
        creates_context_scope: True if look/reveal opens a temporary context.
        dependency: Prerequisite outcome of previous steps in the sequence.
    """
    step: int
    action: ActionVerb
    effect_type: Literal["instant", "ongoing"] = "instant"
    duration: Duration = Duration.INSTANT
    target: Optional[TargetSelector] = None
    destination: Optional[Zone] = None
    destination_position: Literal["top", "bottom", "random", "as_is"] = "as_is"
    strength_mod: Optional[int] = None
    toughness_mod: Optional[int] = None
    creates_context_scope: bool = False
    dependency: Literal[
        "always",
        "if_previous_successful",
        "if_you_do",
        "if_you_cannot",
        "otherwise"
    ] = "always"

    @field_validator("destination", mode="before")
    @classmethod
    def normalize_destination(cls, v: Any) -> Any:
        """Extracts zone string if LLM returns a dictionary object."""
        if isinstance(v, dict):
            return v.get("scope") or v.get("zone") or v.get("destination") or v.get("name")
        return v

    @field_validator("destination_position", mode="before")
    @classmethod
    def normalize_destination_position(cls, v: Any) -> Any:
        """Normalizes None destination_position to canonical 'as_is'."""
        if v is None:
            return "as_is"
        return v

    @field_validator("duration", mode="before")
    @classmethod
    def normalize_duration(cls, v: Any) -> Any:
        """Maps common duration synonyms to canonical Duration enum values."""
        if isinstance(v, str):
            clean = v.strip().lower()
            if clean in ("until_end_of_turn", "end_of_turn", "turn"):
                return Duration.THIS_TURN
            if clean in ("until_end_of_phase", "end_of_phase", "phase"):
                return Duration.UNTIL_END_OF_PHASE
            if clean in ("until_end_of_battle", "end_of_battle", "battle"):
                return Duration.UNTIL_END_OF_BATTLE
        return v
