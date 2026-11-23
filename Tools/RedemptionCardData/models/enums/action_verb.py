from enum import Enum


class ActionVerb(str, Enum):
    """Complete enumeration of official action verbs defined in the Redemption REG."""
    ACTIVATE_ABILITY = "activate an ability"
    ACTIVATE_ARTIFACT = "activate an artifact"
    ADD_TO_BATTLE = "add to battle"
    BAND = "band"
    BANISH = "banish"
    BEGIN_NEW_PHASE = "begin a new phase"
    BOUNCE = "bounce"
    CANNOT_BE_IGNORED = "cannot be ignored"
    CAPTURE = "capture"
    CHANGE_HAND_SIZE = "change hand size"
    CHOOSE_OPPONENT = "choose opponent"
    CONVERT = "convert"
    COPY = "copy"
    CREATE_TOKEN = "create a token"
    DEACTIVATE = "deactivate"
    DECREASE = "decrease"
    DISCARD = "discard"
    DISEASE = "disease"
    DRAW = "draw"
    END_BATTLE = "end the battle"
    EQUIP = "equip"
    EXCHANGE = "exchange"
    FIRST_STRIKE = "first strike"
    GAIN = "gain"
    GIVE = "give"
    HEAL = "heal"
    HOLD = "hold"
    IGNORE = "ignore"
    IMMUNE = "immune"
    INCREASE = "increase"
    INTERRUPT = "interrupt"
    LOOK = "look"
    MODIFY_STATS = "modify_stats"
    NEGATE = "negate"
    PARALYZE = "paralyze"
    PLACE = "place"
    PLAY = "play"
    PLAY_ENHANCEMENT = "play an enhancement"
    POISON = "poison"
    PRESENT = "present"
    PREVENT = "prevent"
    PROTECT = "protect"
    REDIRECT = "redirect"
    RELEASE = "release"
    REMOVE_FROM_GAME = "remove from the game"
    REPEAT = "repeat"
    RESCUE = "rescue"
    RESERVE = "reserve"
    RESTRICT = "restrict"
    RESURRECT = "resurrect"
    RETURN_TO_HAND = "return to hand"
    REVEAL = "reveal"
    SEARCH = "search"
    SET_ASIDE = "set-aside"
    SHUFFLE = "shuffle"
    SIDE_BATTLE = "side battle"
    SITE_ACCESS = "site access"
    TAKE = "take"
    TAUNT = "taunt"
    TOPDECK = "topdeck"
    TOSS = "toss"
    TRANSFER = "transfer"
    UNDERDECK = "underdeck"
    USE_OTHER_ENHANCEMENTS = "use other enhancements"
    WITHDRAW = "withdraw"
    UNKNOWN = "unknown"


NON_CANONICAL_EFFECT_ACTIONS = frozenset({
    ActionVerb.UNKNOWN,
    ActionVerb.RETURN_TO_HAND,
    ActionVerb.REMOVE_FROM_GAME,
    ActionVerb.INCREASE,
    ActionVerb.DECREASE,
})

CANONICAL_EFFECT_ACTION_VERBS = tuple(
    sorted(e.value for e in ActionVerb if e not in NON_CANONICAL_EFFECT_ACTIONS)
)

ABILITY_FILTER_ACTION_VERBS = tuple(
    sorted(
        e.value
        for e in ActionVerb
        if e not in {
            ActionVerb.UNKNOWN,
            ActionVerb.RETURN_TO_HAND,
            ActionVerb.REMOVE_FROM_GAME,
        }
    )
)

_ABILITY_FILTER_ACTION_ALIASES = {
    "activate": ActionVerb.ACTIVATE_ABILITY,
    "activate ability": ActionVerb.ACTIVATE_ABILITY,
    "activate artifact": ActionVerb.ACTIVATE_ARTIFACT,
    "banding": ActionVerb.BAND,
    "banish": ActionVerb.BANISH,
    "bounce": ActionVerb.BOUNCE,
    "capture": ActionVerb.CAPTURE,
    "conversion": ActionVerb.CONVERT,
    "convert": ActionVerb.CONVERT,
    "deactivate": ActionVerb.DEACTIVATE,
    "decrease": ActionVerb.DECREASE,
    "discard": ActionVerb.DISCARD,
    "draw": ActionVerb.DRAW,
    "drawing": ActionVerb.DRAW,
    "end battle": ActionVerb.END_BATTLE,
    "end the battle": ActionVerb.END_BATTLE,
    "first strike": ActionVerb.FIRST_STRIKE,
    "heal": ActionVerb.HEAL,
    "healing": ActionVerb.HEAL,
    "ignore": ActionVerb.IGNORE,
    "ignoring": ActionVerb.IGNORE,
    "immune": ActionVerb.IMMUNE,
    "immunity": ActionVerb.IMMUNE,
    "increase": ActionVerb.INCREASE,
    "interrupt": ActionVerb.INTERRUPT,
    "look": ActionVerb.LOOK,
    "negate": ActionVerb.NEGATE,
    "negation": ActionVerb.NEGATE,
    "paralyze": ActionVerb.PARALYZE,
    "place": ActionVerb.PLACE,
    "play": ActionVerb.PLAY,
    "playing": ActionVerb.PLAY,
    "play an enhancement": ActionVerb.PLAY,
    "poison": ActionVerb.POISON,
    "prevent": ActionVerb.PREVENT,
    "protect": ActionVerb.PROTECT,
    "redirect": ActionVerb.REDIRECT,
    "release": ActionVerb.RELEASE,
    "remove from game": ActionVerb.BANISH,
    "remove from the game": ActionVerb.BANISH,
    "removal from game": ActionVerb.BANISH,
    "removal from the game": ActionVerb.BANISH,
    "repeat": ActionVerb.REPEAT,
    "repel": ActionVerb.WITHDRAW,
    "rescue": ActionVerb.RESCUE,
    "reserve": ActionVerb.RESERVE,
    "restrict": ActionVerb.RESTRICT,
    "resurrect": ActionVerb.RESURRECT,
    "return to hand": ActionVerb.BOUNCE,
    "reveal": ActionVerb.REVEAL,
    "search": ActionVerb.SEARCH,
    "searching": ActionVerb.SEARCH,
    "set-aside": ActionVerb.SET_ASIDE,
    "set aside": ActionVerb.SET_ASIDE,
    "shuffle": ActionVerb.SHUFFLE,
    "side battle": ActionVerb.SIDE_BATTLE,
    "site access": ActionVerb.SITE_ACCESS,
    "take": ActionVerb.TAKE,
    "topdeck": ActionVerb.TOPDECK,
    "toss": ActionVerb.TOSS,
    "transfer": ActionVerb.TRANSFER,
    "underdeck": ActionVerb.UNDERDECK,
    "withdraw": ActionVerb.WITHDRAW,
}


def normalize_ability_filter_action(value: object) -> ActionVerb:
    """Normalizes an ability-filter action string or enum to a canonical ActionVerb.

    Preserves directional predicates ('decrease', 'increase') and rejects 'unknown'.

    Args:
        value: Raw action string or ActionVerb enum instance.

    Returns:
        Canonical ActionVerb member.

    Raises:
        ValueError: If the value is 'unknown' or cannot be mapped to ActionVerb.
    """
    if isinstance(value, ActionVerb):
        cleaned = value.value.strip().lower()
    elif isinstance(value, str):
        cleaned = value.strip().lower()
    else:
        raise ValueError(f"Unsupported ability filter action type: {type(value).__name__}")

    if cleaned == ActionVerb.UNKNOWN.value:
        raise ValueError("'unknown' is not allowed in ability action filter fields.")

    if cleaned in _ABILITY_FILTER_ACTION_ALIASES:
        return _ABILITY_FILTER_ACTION_ALIASES[cleaned]

    if cleaned in ActionVerb._value2member_map_:
        member = ActionVerb(cleaned)
        if member == ActionVerb.RETURN_TO_HAND:
            return ActionVerb.BOUNCE
        if member == ActionVerb.REMOVE_FROM_GAME:
            return ActionVerb.BANISH
        if member == ActionVerb.UNKNOWN:
            raise ValueError("'unknown' is not allowed in ability action filter fields.")
        return member

    raise ValueError(f"Unknown ability filter action: {value!r}")
