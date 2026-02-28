from typing import List, Optional, Dict
from models.meta import Meta
from models.enums.ordir import OrdirCategory
from models.enums.card_type import CardType
from models.enums.alignment import Alignment
from models.parsed_ability import ParsedAbility
from models.card_side import CardSide

class Card:
    def __init__(self, data: dict):
        self.Name = data.get("Name", "")
        self.Set = data.get("Set", "")
        self.ImageFile = data.get("ImageFile", "")
        self.OfficialSet = data.get("OfficialSet", "")
        self.CardTypes = data.get("CardTypes", [])
        self.ORDIR = data.get("ORDIR", [])
        self.Brigade = data.get("Brigade", "")
        self.Brigades = data.get("Brigades", {})
        self.Strength = data.get("Strength", "")
        self.Strengths = data.get("Strengths", {})
        self.Toughness = data.get("Toughness", "")
        self.Toughnesses = data.get("Toughnesses", {})
        self.Class = data.get("Class", "")
        self.Classes = data.get("Classes", [])
        self.Identifier = data.get("Identifier", "")
        self.SpecialAbility = data.get("SpecialAbility", "")
        self.ParsedAbility = data.get("ParsedAbility", {})
        self.Tags = data.get("Tags", [])
        self.PlayablePhases = data.get("PlayablePhases", [])
        self.Alignment = data.get("Alignment", "")
        self.Alignments = data.get("Alignments", {})
        self.Testament = data.get("Testament", "")
        self.Rarity = data.get("Rarity", "")
        self.Reference = data.get("Reference", "")
        self.Sound = data.get("Sound", "")
        self.Legality = data.get("Legality", "")
        self.MetaInfo = data.get("MetaInfo", {})
        self.IsToken = data.get("IsToken", False)
        self.CardSides = data.get("CardSides", {})

    def to_dict(self):
        return self.__dict__
