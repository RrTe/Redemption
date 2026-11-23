"""Atomic action effect model defining sequential steps of an ability.

Models individual effect verbs (e.g. discard, interrupt, draw, modify_stats, deactivate)
with their targets, destinations, durations, phase targets, dynamic stat modifiers,
context scope creators, and dependencies.
"""

from typing import Optional, Literal, Any, Union
from pydantic import BaseModel, field_validator, model_validator
from models.enums.action_verb import ActionVerb
from models.enums.duration import Duration
from models.enums.selection_mode import SelectionMode
from models.enums.zone import Zone
from models.logic.dynamic_value import DynamicValue
from models.logic.target_selector import AUTOMATIC_SELF_IDENTIFIER_WHITELIST, TargetSelector
from models.logic.protection_filter import ProtectionFilter

TARGET_PHASES = (
    "current",
    "draw_phase",
    "upkeep_phase",
    "preparation_phase",
    "battle_phase",
    "discard_phase",
)
TargetPhase = Literal[
    "current",
    "draw_phase",
    "upkeep_phase",
    "preparation_phase",
    "battle_phase",
    "discard_phase",
]

BATTLE_RESTRICTIONS = ("rescue_attempt", "battle_challenge")
BattleRestriction = Literal["rescue_attempt", "battle_challenge"]


def _normalize_effect_action_value(v: Any) -> Any:
    """Normalizes action verb synonyms to canonical REG effect actions."""
    if isinstance(v, ActionVerb):
        raw = v.value
    elif isinstance(v, str):
        raw = v
    else:
        return v

    clean = raw.strip().lower().replace("-", " ").replace("_", " ")
    if clean in ("choose", "choose opponent", "choose blocker", "choose rescuer", "choose the blocker"):
        return ActionVerb.CHOOSE_OPPONENT
    if clean in ("create a token", "create token", "make a token", "spawn a token"):
        return ActionVerb.CREATE_TOKEN
    if clean in ("change hand size", "reduce hand size", "increase hand size", "set hand size"):
        return ActionVerb.CHANGE_HAND_SIZE
    if clean in ("cannot be ignored", "cannot ignore"):
        return ActionVerb.CANNOT_BE_IGNORED
    if clean in ("play an enhancement", "play enhancement", "play"):
        return ActionVerb.PLAY
    if clean in ("move", "move card", "relocate", "put"):
        return ActionVerb.PLACE
    if clean in ("return to hand", "remove to hand", "remove to owner's hand"):
        return ActionVerb.BOUNCE
    if clean in ("remove from the game", "remove from game"):
        return ActionVerb.BANISH
    if clean in ("deactivate", "deactivate an artifact", "deactivate artifact", "deactivate a curse", "deactivate curse"):
        return ActionVerb.DEACTIVATE
    if clean in ("increase", "decrease", "modify stats"):
        return ActionVerb.MODIFY_STATS
    return v


def _negate_positive_stat_mod(mod_val: Any) -> Any:
    """Converts positive integer stat values on legacy 'decrease' actions to negative."""
    if isinstance(mod_val, int) and not isinstance(mod_val, bool) and mod_val > 0:
        return -mod_val
    return mod_val


class ActionEffect(BaseModel):
    """Specification of an atomic effect action within an ability.

    Attributes:
        step: 1-indexed execution order sequence number.
        action: Specific REG action verb being executed.
        effect_type: Whether the effect completes instantly or remains ongoing.
        duration: Temporal boundary for ongoing or lingering effects.
        target: Target selector defining the entities acted upon.
        protection_filter: Structured protection causes for protect/immune effects.
        destination: Target zone if this action moves cards.
        destination_position: Placement in the target zone (top, bottom, etc.).
        target_phase: Target REG phase for 'begin a new phase' actions.
        battle_restriction: Optional restriction on restarted battle phase per REG.
        resumes_previous_phase: True when a restarted phase resumes the prior phase after ending.
        strength_mod: Fixed signed integer or DynamicValue modifier to strength.
        toughness_mod: Fixed signed integer or DynamicValue modifier to toughness.
        creates_context_scope: True if look/reveal opens a temporary context.
        dependency: Prerequisite outcome of previous steps in the sequence.
    """
    step: int
    action: ActionVerb
    effect_type: Literal["instant", "ongoing"] = "instant"
    duration: Duration = Duration.INSTANT
    target: Optional[TargetSelector] = None
    protection_filter: Optional[ProtectionFilter] = None
    destination: Optional[Zone] = None
    destination_position: Literal["top", "bottom", "random", "as_is"] = "as_is"
    target_phase: Optional[TargetPhase] = None
    battle_restriction: Optional[BattleRestriction] = None
    resumes_previous_phase: Optional[bool] = None
    strength_mod: Optional[Union[int, DynamicValue]] = None
    toughness_mod: Optional[Union[int, DynamicValue]] = None
    creates_context_scope: bool = False
    dependency: Literal[
        "always",
        "if_previous_successful",
        "if_you_do",
        "if_you_cannot",
        "otherwise"
    ] = "always"

    @model_validator(mode="before")
    @classmethod
    def normalize_effect_synonyms(cls, data: Any) -> Any:
        """Normalizes effect action synonyms and enforces signed mods on legacy 'decrease'."""
        if not isinstance(data, dict):
            return data

        raw_action = data.get("action")
        act_str = (
            raw_action.value
            if isinstance(raw_action, ActionVerb)
            else str(raw_action or "")
        ).strip().lower().replace("-", " ").replace("_", " ")

        if act_str == "decrease":
            updated = dict(data)
            if "strength_mod" in updated:
                updated["strength_mod"] = _negate_positive_stat_mod(updated["strength_mod"])
            if "toughness_mod" in updated:
                updated["toughness_mod"] = _negate_positive_stat_mod(updated["toughness_mod"])
            updated["action"] = ActionVerb.MODIFY_STATS
            return updated

        norm_action = _normalize_effect_action_value(raw_action)
        if norm_action != raw_action:
            updated = dict(data)
            updated["action"] = norm_action
            return updated

        return data

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

    @field_validator("action", mode="before")
    @classmethod
    def normalize_action(cls, v: Any) -> Any:
        """Normalizes action verb synonyms to canonical REG effect actions."""
        return _normalize_effect_action_value(v)

    @model_validator(mode="after")
    def normalize_automatic_self_identifiers(self) -> "ActionEffect":
        """Strips non-whitelist clause/verb fragments from automatic_self effect/cost targets."""
        if (
            self.target
            and self.target.selection_mode == SelectionMode.AUTOMATIC_SELF
            and self.target.identifiers
        ):
            self.target.identifiers = [
                ident for ident in self.target.identifiers
                if ident.strip().lower() in AUTOMATIC_SELF_IDENTIFIER_WHITELIST
            ]
        return self
