"""Modifier model representing non-ability meta rules in Redemption CCG.

Includes usage limits, replacement effects ('instead'), and protection
clauses ('cannot be negated/interrupted/prevented') per REG guidelines.
"""

from typing import Optional, Literal, Any
from pydantic import BaseModel, model_validator
from models.enums.modifier_type import ModifierType


class LimitParams(BaseModel):
    """Specification of usage limits for abilities and modifiers.

    Attributes:
        count: Maximum number of allowable activations.
        per: Scope boundary ('turn', 'battle', 'round', 'game').
    """
    count: int = 1
    per: Literal["turn", "battle", "round", "game"] = "battle"


class ReplacementParams(BaseModel):
    """Specification of 'instead' replacement mechanics.

    Attributes:
        trigger_event: The original event to intercept (e.g. 'on_discard').
        replace_with_action: The substituted action (e.g. 'underdeck').
    """
    trigger_event: str
    replace_with_action: str


class Modifier(BaseModel):
    """Represents a modifier that alters the behavior of cards or abilities.

    Attributes:
        modifier_type: The REG modifier category.
        applies_to: Scope of what is affected ('this_side', 'this_ability', etc.).
        limit_params: Optional configuration when modifier_type is LIMIT.
        replacement_params: Optional configuration when modifier_type is INSTEAD.
    """
    modifier_type: ModifierType
    applies_to: str = "this_ability"
    limit_params: Optional[LimitParams] = None
    replacement_params: Optional[ReplacementParams] = None

    @model_validator(mode="before")
    @classmethod
    def parse_raw_modifier(cls, v: Any) -> Any:
        """Parses raw text strings into structured Modifier objects."""
        if isinstance(v, str):
            text = v.lower().strip()
            if "negat" in text:
                return {"modifier_type": ModifierType.CANNOT_BE_NEGATED, "applies_to": "this_ability"}
            if "interrupt" in text:
                return {"modifier_type": ModifierType.CANNOT_BE_INTERRUPTED, "applies_to": "this_ability"}
            if "prevent" in text:
                return {"modifier_type": ModifierType.CANNOT_BE_PREVENTED, "applies_to": "this_ability"}
            if "per turn" in text or "once per turn" in text:
                return {"modifier_type": ModifierType.LIMIT, "applies_to": "this_ability", "limit_params": {"count": 1, "per": "turn"}}
            if "per battle" in text or "once per battle" in text:
                return {"modifier_type": ModifierType.LIMIT, "applies_to": "this_ability", "limit_params": {"count": 1, "per": "battle"}}
            return {"modifier_type": ModifierType.CANNOT_BE_NEGATED, "applies_to": "this_ability"}
        return v
