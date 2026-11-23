"""Canonical state, timing, brigade-structure, and relational occupancy filters for TargetSelectors."""

from __future__ import annotations

from enum import Enum
from typing import Tuple


class StateFilter(str, Enum):
    """Canonical structural state and timing filters extracted from TargetSelector.identifiers."""

    # Combat and tactical role states
    ATTACKING = "attacking"
    BLOCKING = "blocking"
    RESCUING = "rescuing"
    OPPOSED = "opposed"
    UNBLOCKED = "unblocked"
    BLOCKED = "blocked"
    IN_BATTLE = "in_battle"
    NOT_IN_BATTLE = "not_in_battle"
    BANDED = "banded"
    LONE = "lone"

    # Card status and occupancy states
    ACTIVATED = "activated"
    INACTIVE = "inactive"
    CAPTURED = "captured"
    FACE_DOWN = "face_down"
    FACE_UP = "face_up"
    SET_ASIDE = "set_aside"
    EQUIPPED = "equipped"
    HOLDING_WEAPON = "holding_weapon"
    OCCUPIED = "occupied"
    UNOCCUPIED = "unoccupied"
    PROTECTED = "protected"
    IMMUNE = "immune"
    CONVERTED = "converted"
    POISONED = "poisoned"
    DISEASED = "diseased"
    REVEALED = "revealed"
    ABOUT_TO_BE_DISCARDED = "about_to_be_discarded"

    # Brigade composition states
    SINGLE_BRIGADE = "single_brigade"
    MULTI_BRIGADE = "multi_brigade"

    # Zone and attachment host relations
    ATTACHED_TO_SELF = "attached_to_self"
    HELD_BY_SELF = "held_by_self"
    IN_SAME_ZONE = "in_same_zone"

    # Turn and battle timing qualifiers
    PLAYED_THIS_TURN = "played_this_turn"
    PLAYED_THIS_BATTLE = "played_this_battle"
    DRAWN_THIS_TURN = "drawn_this_turn"
    ENTERED_BATTLE_THIS_TURN = "entered_battle_this_turn"
    FIRST_PLAYED_THIS_BATTLE = "first_played_this_battle"
    FIRST_PLAYED_THIS_TURN = "first_played_this_turn"
    NEXT_PLAYED = "next_played"
    LAST_PLAYED = "last_played"


CANONICAL_STATE_FILTERS: Tuple[str, ...] = tuple(e.value for e in StateFilter)
