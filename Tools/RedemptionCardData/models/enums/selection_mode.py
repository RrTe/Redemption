from enum import Enum


class SelectionMode(str, Enum):
    """Specifies the decision agent and algorithmic targeting mode for an effect."""
    MANUAL_CONTROLLER = "manual_controller"
    MANUAL_OPPONENT = "manual_opponent"
    AUTOMATIC_ALL = "automatic_all"
    AUTOMATIC_NEXT = "automatic_next"
    AUTOMATIC_LAST = "automatic_last"
    AUTOMATIC_SELF = "automatic_self"
    CHAINED_TARGET = "chained_target"
    CONTEXT_REMAINDER = "context_remainder"
    RANDOM = "random"
