"""Condition expression model for precondition and advantage checks.

Evaluates game-state criteria (e.g. 'if in battle', 'hand advantage')
before abilities activate or effects resolve.
"""

from typing import Any, Optional, Union, Literal
from pydantic import BaseModel, field_validator
from models.enums.condition_type import ConditionType
from models.logic.target_selector import TargetSelector


class ConditionExpression(BaseModel):
    """Declarative specification of a condition that must be met.

    Attributes:
        condition_type: The category of check (zone check, advantage, etc.).
        selector: TargetSelector defining the cards/zones to inspect.
        operator: Relational operator for comparison ('==', '>=', etc.).
        value: The target value to compare against (count, player id, etc.).
    """
    condition_type: ConditionType
    selector: Optional[TargetSelector] = None
    operator: Literal["==", "!=", ">", ">=", "<", "<="] = "=="
    value: Optional[Union[int, str, bool]] = None

    @field_validator("operator", mode="before")
    @classmethod
    def normalize_operator(cls, value: Any) -> str:
        """Defaults missing or null operators from LLM outputs to '=='.

        Args:
            value: Raw operator value before validation.

        Returns:
            Valid relational operator string.
        """
        if value is None or (isinstance(value, str) and not value.strip()):
            return "=="
        return str(value).strip()
