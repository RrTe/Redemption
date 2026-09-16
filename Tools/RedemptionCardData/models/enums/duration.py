from enum import Enum


class Duration(str, Enum):
    """Represents effect duration lifecycles defined in the Redemption REG."""
    INSTANT = "instant"
    UNTIL_END_OF_PHASE = "until_end_of_phase"
    UNTIL_END_OF_BATTLE = "until_end_of_battle"
    THIS_TURN = "this_turn"
    ONE_ROUND = "one_round"
    WHILE_CONDITION = "while_condition"
    PERMANENT = "permanent"
