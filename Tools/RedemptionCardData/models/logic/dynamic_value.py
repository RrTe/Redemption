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
    """Union-style model holding a fixed value, a bounded range, or a dynamic calculation.

    Attributes:
        fixed_value: Fixed integer (e.g. 1, 2, 3) or string ('all').
        min_value: Minimum selectable target count (e.g. 0 for 'up to N', 1 for '1 or 2').
        max_value: Maximum selectable target count (e.g. N for 'up to N').
        dynamic: Detailed calculation specification when value is dynamic (X).
    """
    fixed_value: Optional[Union[int, Literal["all"]]] = None
    min_value: Optional[int] = None
    max_value: Optional[int] = None
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
    def up_to(cls, max_val: int, min_val: int = 0) -> "DynamicValue":
        """Creates a bounded range DynamicValue for 'up to N' semantics.

        Args:
            max_val: Upper bound N.
            min_val: Lower bound (defaults to 0 per REG 'up to N' semantics).

        Returns:
            DynamicValue: Populated range model with min_value and max_value.
        """
        return cls(min_value=min_val, max_value=max_val)

    @classmethod
    def from_range(cls, min_val: int, max_val: int) -> "DynamicValue":
        """Creates an explicit bounded range DynamicValue (e.g. '1 or 2', '1 to 3').

        Args:
            min_val: Minimum count required.
            max_val: Maximum count allowed.

        Returns:
            DynamicValue: Populated range model.
        """
        return cls(min_value=min_val, max_value=max_val)

    @classmethod
    def all_targets(cls) -> "DynamicValue":
        """Creates a representation for 'all' targets.

        Returns:
            DynamicValue: Populated model representing 'all'.
        """
        return cls(fixed_value="all")

    @classmethod
    def from_variable(cls, var_name: str = "X", limit: Optional[int] = None) -> "DynamicValue":
        """Creates a dynamic variable (X) DynamicValue.

        Args:
            var_name: Variable token (e.g. 'X').
            limit: Optional upper limit cap.

        Returns:
            DynamicValue: Populated dynamic calculation model.
        """
        return cls(dynamic=DynamicValueCalculation(source="count_cards", limit=limit))
