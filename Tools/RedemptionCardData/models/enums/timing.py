from enum import Enum

class Timing(str, Enum):
    INSTANT = "instant"
    NEXT = "next"
    THIS_TURN = "this turn"
    ON_PLAY = "on play"
    ON_BLOCK = "on block"
    ON_ATTACK = "on attack"
    UNKNOWN = "unknown"
