"""Top-level card logic node mapping card sides to abilities and modifiers.

Serves as the root AST representation for cards evaluated by the rules engine,
mirroring the CardSides architecture in models/card.py.
"""

from typing import Dict, List
from pydantic import BaseModel, Field
from models.logic.modifier import Modifier
from models.logic.ability import Ability


class CardSideLogic(BaseModel):
    """Encapsulates all logic associated with a single card side.

    Attributes:
        modifiers: Side-wide modifiers applying to all or subsets of abilities.
        abilities: List of sequential or triggered abilities on this card side.
    """
    modifiers: List[Modifier] = Field(default_factory=list)
    abilities: List[Ability] = Field(default_factory=list)

    def propagate_side_modifiers(self) -> None:
        """Applies side-level protection modifiers directly to each ability's flags.

        Flips is_negatable, is_interruptible, and is_preventable on each ability
        if a corresponding 'this_side' modifier is present.
        """
        for mod in self.modifiers:
            if mod.applies_to in ("this_side", "all_abilities"):
                if mod.modifier_type.value == "cannot_be_negated":
                    for ab in self.abilities:
                        ab.is_negatable = False
                elif mod.modifier_type.value == "cannot_be_interrupted":
                    for ab in self.abilities:
                        ab.is_interruptible = False
                elif mod.modifier_type.value == "cannot_be_prevented":
                    for ab in self.abilities:
                        ab.is_preventable = False


class CardLogic(BaseModel):
    """Top-level logic entry for an individual physical Redemption card.

    Attributes:
        card_identifier: Unique identifier matching carddata.json / extended data.
        sides: Mapping of side name ('shared', 'top', 'bottom') to side logic.
    """
    card_identifier: str
    sides: Dict[str, CardSideLogic] = Field(default_factory=dict)
