"""Dynamic value specification for card effects and targeting.

Represents fixed numbers, keywords like 'all', or dynamic expressions (X)
with calculation sources, multipliers, and upper limits per REG guidelines.
"""

from typing import Optional, Union, Literal
from pydantic import BaseModel, Field


class DynamicValueCalculation(BaseModel):
    """Configuration for dynamically calculated values (X).

    Attributes:
        source: The game state metric to count (e.g. 'count_cards', 'stat_value').
        scope: Game zone or entity pool to inspect.
        target_type: Optional target filter for counted cards.
        multiplier: Factor multiplied with raw count (default 1).
        limit: Optional maximum cap for the calculated value.
    """
    source: Literal["count_cards", "stat_value", "cards_drawn", "lost_souls_in_play"]
    scope: Optional[str] = None
    target_type: Optional[str] = None
    multiplier: int = 1
    limit: Optional[int] = None


class DynamicValue(BaseModel):
    """Union-style model holding either a fixed value or a dynamic calculation.

    Attributes:
        fixed_value: Fixed integer (e.g. 1, 2, 3) or string ('all').
        dynamic: Detailed calculation specification when value is dynamic (X).
    """
    fixed_value: Optional[Union[int, Literal["all"]]] = None
    dynamic: Optional[DynamicValueCalculation] = None

    @classmethod
    def from_int(cls, val: int) -> "DynamicValue":
        """Creates a fixed integer DynamicValue.

        Args:
            val: Numeric amount.

        Returns:
            DynamicValue: Populated model.
        """
        return cls(fixed_value=val)

    @classmethod
    def all_targets(cls) -> "DynamicValue":
        """Creates a representation for 'all' targets.

        Returns:
            DynamicValue: Populated model representing 'all'.
        """
        return cls(fixed_value="all")
