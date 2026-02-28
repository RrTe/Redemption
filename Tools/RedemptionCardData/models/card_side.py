from typing import List, Optional
from models.enums.card_type import CardType
from models.enums.alignment import Alignment

class CardSide:
    def __init__(
        self,
        Name: Optional[str] = None,
        Type: Optional[CardType] = None,
        Alignment: Optional[Alignment] = None,
        Brigades: Optional[List[str]] = None,
        Strength: Optional[int] = None,
        Toughness: Optional[int] = None,
        SpecialAbility: Optional[str] = None,
        Classes: Optional[List[str]] = None
    ):
        self.Name = Name
        self.Type = Type
        self.Alignment = Alignment
        self.Brigades = Brigades or []
        self.Strength = Strength
        self.Toughness = Toughness
        self.SpecialAbility = SpecialAbility
        self.Classes = Classes or []

    def to_dict(self):
        return self.__dict__
