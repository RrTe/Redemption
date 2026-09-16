"""Target selector model for identifying effect targets in Redemption CCG.

Supports algorithmic decision modes, ownership checks, zone scopes,
attribute filters, dynamic counts, and chained target references.
"""

from typing import Any, List, Optional, Literal
from pydantic import BaseModel, Field, field_validator
from models.enums.zone import Zone
from models.enums.selection_mode import SelectionMode
from models.logic.dynamic_value import DynamicValue


class TargetSelector(BaseModel):
    """Specification of what entities or cards an effect acts upon.

    Attributes:
        selection_mode: Decision mechanism (manual, automatic, chained, etc.).
        zone_owner: Owner of the target zone ('controller', 'opponent', etc.).
        scope: Target zone per REG definitions.
        target_type: Primary classification (e.g. 'hero', 'evil_character').
        brigades: Required brigade affiliations (empty if any).
        alignment: Required alignment ('good', 'evil', 'neutral').
        identifiers: Required identifiers or subtypes (e.g. 'Angel', 'Demon').
        card_titles: Specific card names if targeting named cards.
        count: Amount of targets to select.
        ref_step: Reference step index if selection_mode is CHAINED_TARGET.
    """
    selection_mode: SelectionMode = SelectionMode.AUTOMATIC_ALL
    zone_owner: Literal["controller", "opponent", "both", "either", "target_player"] = "controller"
    scope: Zone = Zone.BATTLE
    target_type: Optional[str] = None
    brigades: List[str] = Field(default_factory=list)
    alignment: Optional[str] = None
    identifiers: List[str] = Field(default_factory=list)
    card_titles: List[str] = Field(default_factory=list)
    target_card_ids: List[str] = Field(default_factory=list)
    count: Optional[DynamicValue] = None
    ref_step: Optional[int] = None

    @field_validator("zone_owner", mode="before")
    @classmethod
    def normalize_zone_owner(cls, value: Any) -> Any:
        """Normalizes LLM output variations for zone_owner.

        Args:
            value: Raw value before validation.

        Returns:
            Canonical zone owner string or original value.
        """
        if isinstance(value, str):
            clean = value.strip().lower()
            if clean in ("context_scope", "context", "none", "null"):
                return "controller"
            if clean in ("any", "either"):
                return "either"
            if clean in ("all", "both"):
                return "both"
        return value

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_scope(cls, value: Any) -> Any:
        """Normalizes common zone alias names from LLMs.

        Args:
            value: Raw scope value before validation.

        Returns:
            Canonical Zone string or Zone enum instance.
        """
        if isinstance(value, str):
            clean = value.strip().lower()
            if clean in ("reserve", "reserve_pile"):
                return Zone.RESERVE_PILE
            if clean in ("play", "field", "field_of_play"):
                return Zone.IN_PLAY
        return value
