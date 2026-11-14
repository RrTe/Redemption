"""Canonical gender types and character-side constants for Redemption cards."""

from __future__ import annotations

from enum import Enum
from typing import FrozenSet, Literal, Tuple

GenderType = Literal["male", "female", "both", "genderless"]
TargetGenderType = Literal["male", "female"]


class Gender(str, Enum):
    """Canonical gender values defined by ORDIR 7.0.0."""

    MALE = "male"
    FEMALE = "female"
    BOTH = "both"
    GENDERLESS = "genderless"


GENDERS: Tuple[str, ...] = ("male", "female", "both", "genderless")
TARGET_GENDERS: Tuple[str, ...] = ("male", "female")

CHARACTER_SIDE_TYPES: FrozenSet[str] = frozenset(
    {
        "Hero",
        "Evil Character",
        "Character",
        "Hero Token",
        "Evil Character Token",
        "DAC",
    }
)
