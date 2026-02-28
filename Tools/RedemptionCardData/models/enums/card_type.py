from enum import Enum

class CardType(str, Enum):
    Hero = "Hero"
    Evil_Character = "Evil Character"
    GE = "GE"  # Good Enhancement
    EE = "EE"  # Evil Enhancement
    Artifact = "Artifact"
    Site = "Site"
    Fortress = "Fortress"
    Dominant = "Dominant"
    Lost_Soul = "Lost Soul"
    Covenant = "Covenant"
    Curse = "Curse"
    City = "City"
    Character = "Character"
    Enhancement = "Enhancement"
    Hero_Token = "Hero Token"
    Evil_Character_Token = "Evil Character Token"
    Lost_Soul_Token = "Lost Soul Token"

# Gruppenerweiterung (bidirektional)
TYPE_GROUPS = {
    "Enhancement": {"GE", "EE"},
    "Character": {"Hero", "Evil Character", "Hero Token", "Evil Character Token"},
    "City": {"Fortress", "Site"},
}

# Vererbungslogik („IS A“)
TYPE_IS_A = {
    "Covenant": ["Artifact", "GE"],
    "Curse": ["Artifact", "EE"],
    "City": ["Site", "Fortress"],
    "Hero Token": ["Hero"],
    "Evil Character Token": ["Evil Character"],
    "Lost Soul Token": ["Lost Soul"],
}
