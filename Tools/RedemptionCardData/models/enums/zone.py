from enum import Enum


class Zone(str, Enum):
    """Represents all official and temporary game zones in Redemption CCG."""
    BATTLE = "battle"
    TERRITORY = "territory"
    IN_PLAY = "in_play"
    HAND = "hand"
    DECK = "deck"
    DISCARD_PILE = "discard_pile"
    BANISH_PILE = "banish_pile"
    LAND_OF_BONDAGE = "land_of_bondage"
    LAND_OF_REDEMPTION = "land_of_redemption"
    ARTIFACT_PILE = "artifact_pile"
    SET_ASIDE = "set_aside"
    RESERVE_PILE = "reserve_pile"
    CONTEXT_SCOPE = "context_scope"
