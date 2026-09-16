"""Condition expression model for precondition and advantage checks.

Evaluates game-state criteria (e.g. 'if in battle', 'hand advantage')
before abilities activate or effects resolve.
"""

from typing import Optional, Union, Literal
from pydantic import BaseModel
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
