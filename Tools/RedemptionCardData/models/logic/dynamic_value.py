"""Dynamic value specification for card effects, targeting counts, and stat modifiers.

Represents fixed numbers, keywords like 'all', bounded ranges, or dynamic expressions (X)
with calculation sources, arithmetic operations, signed multipliers, selector filters, and caps.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal, Optional, Union
from pydantic import BaseModel, field_validator

if TYPE_CHECKING:
    from models.logic.target_selector import TargetSelector

STAT_MOD_OPERATIONS = ("add", "multiply", "set")
StatModOperation = Literal["add", "multiply", "set"]

DYNAMIC_VALUE_SOURCES = (
    "count_cards",
    "count_brigades",
    "stat_value",
    "cards_drawn",
    "lost_souls_in_play",
    "self_stat",
    "target_stat",
    "chained_target_stats",
    "cost_target_stats",
    "card_x_identifier",
    "player_choice",
)
DynamicValueSource = Literal[
    "count_cards",
    "count_brigades",
    "stat_value",
    "cards_drawn",
    "lost_souls_in_play",
    "self_stat",
    "target_stat",
    "chained_target_stats",
    "cost_target_stats",
    "card_x_identifier",
    "player_choice",
]


class DynamicValueCalculation(BaseModel):
    """Configuration for dynamically calculated values (X) and stat formulas.

    Attributes:
        source: Game state metric or source value to evaluate.
        operation: Arithmetic application mode ('add', 'multiply', 'set').
        multiplier: Signed numeric factor (e.g. -1 for -X, 0.5 for half, 2 for double).
        fixed_value: Optional constant value (e.g. operation='set', fixed_value=1).
        offset: Optional additive offset applied after multiplication.
        limit: Optional upper cap for the calculated magnitude.
        selector: Full TargetSelector filter defining counted or referenced cards.
        ref_step: Optional prior step index for chained/cost stat references.
        scope: Legacy flat zone hint preserved for compatibility.
        target_type: Legacy flat target_type hint preserved for compatibility.
    """
    source: Optional[DynamicValueSource] = None
    operation: StatModOperation = "add"
    multiplier: Union[int, float] = 1
    fixed_value: Optional[int] = None
    offset: Optional[int] = None
    limit: Optional[int] = None
    selector: Optional["TargetSelector"] = None
    ref_step: Optional[int] = None
    scope: Optional[str] = None
    target_type: Optional[str] = None

    @field_validator("multiplier", mode="before")
    @classmethod
    def normalize_multiplier(cls, v: object) -> Union[int, float]:
        """Normalizes integer-valued floats to int while preserving fractional floats (e.g. 0.5)."""
        if v is None:
            return 1
        if isinstance(v, bool):
            return 1
        if isinstance(v, (int, float)):
            num = float(v)
            return int(num) if num.is_integer() else num
        if isinstance(v, str):
            num = float(v.strip())
            return int(num) if num.is_integer() else num
        return v  # type: ignore[return-value]


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
