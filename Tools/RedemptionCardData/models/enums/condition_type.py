from enum import Enum


class ConditionType(str, Enum):
    """Categorizes all legal precondition and advantage checks in Redemption."""
    ZONE_CHECK = "zone_check"
    COUNT_COMPARISON = "count_comparison"
    HAND_ADVANTAGE = "hand_advantage"
    BOARD_ADVANTAGE = "board_advantage"
    PLAY_ADVANTAGE = "play_advantage"
    LOST_SOUL_ADVANTAGE = "lost_soul_advantage"
    REDEEMED_SOUL_ADVANTAGE = "redeemed_soul_advantage"
    WAS_COST_PAID = "was_cost_paid"
    IS_TURN_OF = "is_turn_of"
