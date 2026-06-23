from typing import Optional, Dict
from models.card_side import CardSide

# Fields that are side-specific and must NOT appear at card level.
# They are stored exclusively in CardSides (top / bottom / shared).
_SIDE_ONLY_FIELDS = {
    "Name", "Type", "CardTypes", "Alignment", "Alignments",
    "Brigade", "Brigades", "Strength", "Strengths",
    "Toughness", "Toughnesses", "Class", "Classes", "SpecialAbility",
}

# Fields that are always omitted from serialization regardless of value.
_INTERNAL_FIELDS = {"ParsedAbility"}

# Card-level fields that are suppressed when empty/falsy.
_SUPPRESS_IF_EMPTY = {"ORDIR", "Tags", "PlayablePhases", "Sound"}


class Card:
    def __init__(self, data: dict):
        # --- Card-level (non-side-specific) fields ---
        self.Set = data.get("Set", "")
        self.ImageFile = data.get("ImageFile", "")
        self.OfficialSet = data.get("OfficialSet", "")
        self.Identifier = data.get("Identifier", "")
        self.Rarity = data.get("Rarity", "")
        self.Reference = data.get("Reference", "")
        self.Legality = data.get("Legality", "")
        self.Testament = data.get("Testament", "")
        self.IsToken = data.get("IsToken", False)
        self.IsCharacter = data.get("IsCharacter", False)
        self.IsEnhancement = data.get("IsEnhancement", False)
        self.IsGospel = data.get("IsGospel", False)
        self.Sound = data.get("Sound", "")
        self.ORDIR = data.get("ORDIR", [])
        self.Tags = data.get("Tags", [])
        self.PlayablePhases = data.get("PlayablePhases", [])
        self.Meta = data.get("Meta", data.get("MetaInfo", {}))

        # CardSides is the single source of truth for all side-specific data.
        self.CardSides = data.get("CardSides", {})

    def to_dict(self) -> dict:
        """Serializes the Card, omitting empty/falsy optional fields.

        Side-only and internal fields are never included at card level.
        Fields in _SUPPRESS_IF_EMPTY are only included when non-empty.

        Returns:
            dict: Clean card representation for JSON serialization.
        """
        result = {}
        for k, v in self.__dict__.items():
            if k in _SIDE_ONLY_FIELDS or k in _INTERNAL_FIELDS:
                continue
            if k in _SUPPRESS_IF_EMPTY and not v:
                continue
            if v is None:
                continue
            result[k] = v
        return result
