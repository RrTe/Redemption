from models.enums.alignment import Alignment

# Typen mit festem Alignment
TYPE_ALIGNMENT_MAP = {
    "Artifact": Alignment.Neutral,
    "Covenant": Alignment.Good,
    "Curse": Alignment.Evil,
    "Fortress": None,
    "Site": Alignment.Neutral,
    "Hero": Alignment.Good,
    "Evil Character": Alignment.Evil,
    "Lost Soul": Alignment.Neutral,
    "Hero Token": Alignment.Good,
    "Evil Character Token": Alignment.Evil,
    "Lost Soul Token": Alignment.Neutral,
    "EE": Alignment.Evil,
    "GE": Alignment.Good,
    "Dominant": None
}

# Typen, die Brigaden haben dürfen
TYPES_WITH_BRIGADES = {
    "Hero",
    "Evil Character",
    "Hero Token",
    "Evil Character Token",
    "GE",
    "EE",
    "Covenant",
    "Curse"
}

# Typen, die Stärke/Widerstand haben dürfen
TYPES_WITH_STATS = {
    "Hero",
    "Evil Character",
    "Hero Token",
    "Evil Character Token",
    "GE",
    "EE",
    "Covenant",
    "Curse"
}

# Standard card type and side concept aliases used in Special Ability text
CARD_TYPE_ABILITY_ALIASES = {
    "Hero": ["HERO", "H", "HERO CHARACTER"],
    "Evil Character": ["EC", "EVIL CHARACTER", "EVIL CHAR"],
    "GE": ["GE", "GOOD ENHANCEMENT"],
    "EE": ["EE", "EVIL ENHANCEMENT"],
    "Artifact": ["ARTIFACT", "ART", "A"],
    "Covenant": ["COVENANT", "COV"],
    "Curse": ["CURSE"],
    "Fortress": ["FORTRESS", "FORT", "F"],
    "Site": ["SITE"],
    "City": ["CITY"],
    "Dominant": ["DOMINANT", "DOM"],
    "Lost Soul": ["LOST SOUL", "LS"],
    "Good": ["GOOD"],
    "Evil": ["EVIL"],
    "Neutral": ["NEUTRAL"],
    "top": ["TOP"],
    "bottom": ["BOTTOM"],
    "STAR": ["STAR"]
}

