from enum import Enum

class TargetType(str, Enum):
    HERO = "hero"
    EVIL_CHARACTER = "evil character"
    GOOD_CHARACTER = "good character"
    CHARACTER = "character"
    ENHANCEMENT = "enhancement"
    DEMON = "demon"
    SITE = "site"
    ARTIFACT = "artifact"
    CARD = "card"
    LOST_SOUL = "lost soul"
    DECK = "deck"
    HAND = "hand"
    UNKNOWN = "unknown"
