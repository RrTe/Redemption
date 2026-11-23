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
        Classes: Optional[List[str]] = None,
        ORDIR: Optional[List[str]] = None,
        Gender: Optional[str] = None,
        IsGeneric: Optional[bool] = None,
        IsHuman: Optional[bool] = None,
        IsCloud: Optional[bool] = None,
        IsMeek: Optional[bool] = None,
    ):
        self.Name = Name
        self.Type = Type
        self.Alignment = Alignment
        self.Brigades = Brigades or []
        self.Strength = Strength
        self.Toughness = Toughness
        self.SpecialAbility = SpecialAbility
        self.Classes = Classes or []
        self.ORDIR = ORDIR or []
        self.Gender = Gender
        self.IsGeneric = IsGeneric
        self.IsHuman = IsHuman
        self.IsCloud = IsCloud
        self.IsMeek = IsMeek

    def to_dict(self) -> dict:
        """Serializes the CardSide, omitting None values and empty collections.

        Returns:
            dict: Compact representation with only populated fields.
        """
        return {
            k: v for k, v in self.__dict__.items()
            if v is not None and v != [] and v != {}
        }
