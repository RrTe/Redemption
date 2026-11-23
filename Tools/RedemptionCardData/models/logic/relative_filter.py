"""Structured relative attribute comparison filter model for TargetSelectors."""

from __future__ import annotations

from typing import Literal, Tuple, Union
from pydantic import BaseModel, Field

RELATIVE_FILTER_ATTRIBUTES: Tuple[str, ...] = (
    "gender",
    "brigade",
    "alignment",
    "strength",
    "toughness",
    "testament",
    "type",
    "controller",
    "title",
    "book",
    "church",
)

RELATIVE_FILTER_RELATIONS: Tuple[str, ...] = (
    "same",
    "different",
    "opposite",
    "<",
    "<=",
    "==",
    "!=",
    ">",
    ">=",
)

RELATIVE_FILTER_REFERENCES: Tuple[str, ...] = (
    "self",
    "actor",
    "chained_target",
    "selected",
    "bearer",
    "trigger_subject",
)

RelativeAttributeType = Literal[
    "gender",
    "brigade",
    "alignment",
    "strength",
    "toughness",
    "testament",
    "type",
    "controller",
    "title",
    "book",
    "church",
]

RelativeRelationType = Literal[
    "same",
    "different",
    "opposite",
    "<",
    "<=",
    "==",
    "!=",
    ">",
    ">=",
]

RelativeReferenceLiteral = Literal[
    "self",
    "actor",
    "chained_target",
    "selected",
    "bearer",
    "trigger_subject",
]


class RelativeRefStep(BaseModel):
    """Step-indexed reference target for a relative attribute comparison.

    Attributes:
        ref_step: 1-based step index of the prior effect/cost step to compare against.
    """

    ref_step: int = Field(..., ge=1)


class RelativeFilter(BaseModel):
    """Structured relative attribute comparison between a candidate card and a reference.

    Attributes:
        attribute: Card attribute being compared (e.g. 'brigade', 'alignment', 'gender').
        relation: Comparison relation ('same', 'different', 'opposite', or numeric operator).
        reference: Anchor entity ('self', 'actor', 'chained_target', 'selected', or RelativeRefStep).
    """

    attribute: RelativeAttributeType
    relation: RelativeRelationType
    reference: Union[RelativeReferenceLiteral, RelativeRefStep] = "self"
