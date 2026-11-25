// shared/astConstants.js

/**
 * Supported AST action types.
 */
export const AST_ACTIONS = /** @type {const} */ ({
  DRAW: "draw",
  DISCARD: "discard",
  SEARCH: "search",
  NEGATE: "negate",
  PLAY: "play",
  MODIFY_STATS: "modify_stats",
  BAND: "band",
  ADD_TO_BATTLE: "add to battle",
  IMMUNE: "immune",
  PROTECT: "protect",
  SET_IMMUNITY: "set_immunity",
  PARALYZE: "paralyze",
  RELEASE: "release",
  WITHDRAW: "withdraw",
  CHOOSE_OPPONENT: "choose opponent",
  PRESENT: "present",
  BOUNCE: "bounce",
  TOPDECK: "topdeck",
  UNDERDECK: "underdeck",
  BANISH: "banish",
  PLACE: "place",
  TAKE: "take",
  DEACTIVATE: "deactivate",
  BEGIN_A_NEW_PHASE: "begin a new phase",
});

/**
 * Directional stat-modification predicates allowed in ability filter lists (protection_filter / ability_target_actions).
 */
export const AST_DIRECTIONAL_FILTER_ACTIONS = /** @type {const} */ ({
  INCREASE: "increase",
  DECREASE: "decrease",
});

/**
 * Target phase identifiers for phase-switching AST effects (ActionEffect.target_phase).
 */
export const AST_TARGET_PHASES = /** @type {const} */ ({
  CURRENT: "current",
  DRAW_PHASE: "draw_phase",
  UPKEEP_PHASE: "upkeep_phase",
  PREPARATION_PHASE: "preparation_phase",
  BATTLE_PHASE: "battle_phase",
  DISCARD_PHASE: "discard_phase",
});

/**
 * Battle restriction identifiers (ActionEffect.battle_restriction).
 */
export const AST_BATTLE_RESTRICTIONS = /** @type {const} */ ({
  RESCUE_ATTEMPT: "rescue_attempt",
  BATTLE_CHALLENGE: "battle_challenge",
});

/**
 * Operations for DynamicValue computations.
 */
export const AST_STAT_MOD_OPERATIONS = /** @type {const} */ ({
  ADD: "add",
  MULTIPLY: "multiply",
  SET: "set",
});

/**
 * Value sources for DynamicValue computations.
 */
export const AST_DYNAMIC_VALUE_SOURCES = /** @type {const} */ ({
  COUNT_CARDS: "count_cards",
  COUNT_BRIGADES: "count_brigades",
  STAT_VALUE: "stat_value",
  CARDS_DRAWN: "cards_drawn",
  LOST_SOULS_IN_PLAY: "lost_souls_in_play",
  SELF_STAT: "self_stat",
  TARGET_STAT: "target_stat",
  CHAINED_TARGET_STATS: "chained_target_stats",
  COST_TARGET_STATS: "cost_target_stats",
  CARD_X_IDENTIFIER: "card_x_identifier",
  PLAYER_CHOICE: "player_choice",
});

/**
 * AST targeting selection modes.
 */
export const AST_SELECTION_MODES = /** @type {const} */ ({
  AUTOMATIC_NEXT: "automatic_next",
  AUTOMATIC_ALL: "automatic_all",
  AUTOMATIC_LAST: "automatic_last",
  AUTOMATIC_SELF: "automatic_self",
  MANUAL_CONTROLLER: "manual_controller",
  MANUAL_OPPONENT: "manual_opponent",
  CHAINED_TARGET: "chained_target",
  CONTEXT_REMAINDER: "context_remainder",
  RANDOM: "random",
});

/**
 * AST targeting scopes (source / destination zone scopes).
 */
export const AST_SCOPES = /** @type {const} */ ({
  BATTLE: "battle",
  TERRITORY: "territory",
  IN_PLAY: "in_play",
  HAND: "hand",
  DECK: "deck",
  DISCARD_PILE: "discard_pile",
  BANISH_PILE: "banish_pile",
  RESERVE_PILE: "reserve_pile",
  SET_ASIDE: "set_aside",
  LAND_OF_BONDAGE: "land_of_bondage",
  LAND_OF_REDEMPTION: "land_of_redemption",
  ARTIFACT_PILE: "artifact_pile",
  CONTEXT_SCOPE: "context_scope",
  ANY: "any",
});

/**
 * AST zone ownership filters.
 */
export const AST_ZONE_OWNERS = /** @type {const} */ ({
  CONTROLLER: "controller",
  OPPONENT: "opponent",
  EITHER: "either",
  BOTH: "both",
  TARGET_PLAYER: "target_player",
});

/**
 * AST card side identifiers.
 */
export const AST_CARD_SIDES = /** @type {const} */ ({
  SHARED: "shared",
  TOP: "top",
  BOTTOM: "bottom",
});

/**
 * AST ability activation modes.
 */
export const AST_ACTIVATION_MODES = /** @type {const} */ ({
  IMMEDIATE: "immediate",
  TRIGGERED: "triggered",
  MANUALLY_TRIGGERED: "manually_triggered",
  STATIC: "static",
});

/**
 * AST alignment identifiers.
 */
export const AST_ALIGNMENTS = /** @type {const} */ ({
  GOOD: "good",
  EVIL: "evil",
  NEUTRAL: "neutral",
});

/**
 * AST network message identifiers.
 */
export const AST_MESSAGES = /** @type {const} */ ({
  REQUEST_TARGET_SELECTION: "requestTargetSelection",
  SELECT_TARGET: "selectTarget",
  REQUEST_OPTIONAL_ABILITY: "requestOptionalAbility",
  RESPOND_OPTIONAL_ABILITY: "respondOptionalAbility",
  ACTION_TELEGRAPH: "actionTelegraph",
  CLEAR_ACTION_TELEGRAPH: "clearActionTelegraph",
  CANCEL_INTERACTION: "cancelInteraction",
});

/**
 * AST stat filter attribute identifiers.
 */
export const AST_STAT_FILTER_STATS = /** @type {const} */ ({
  STRENGTH: "strength",
  TOUGHNESS: "toughness",
  BOTH: "both",
  EITHER: "either",
});

/**
 * AST stat filter relational comparison operators.
 */
export const AST_STAT_FILTER_OPERATORS = /** @type {const} */ ({
  GTE: ">=",
  LTE: "<=",
  EQ: "==",
  GT: ">",
  LT: "<",
  NEQ: "!=",
});

/**
 * Allowed gender values on AST TargetSelector nodes (ast_constants.json).
 */
export const AST_GENDERS = /** @type {const} */ ({
  MALE: "male",
  FEMALE: "female",
});

/**
 * All valid character-side gender values per ORDIR 7.0.0 (cardHierarchy.json).
 */
export const CARD_GENDERS = /** @type {const} */ ({
  MALE: "male",
  FEMALE: "female",
  BOTH: "both",
  GENDERLESS: "genderless",
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AST_ACTIONS,
    AST_DIRECTIONAL_FILTER_ACTIONS,
    AST_TARGET_PHASES,
    AST_BATTLE_RESTRICTIONS,
    AST_STAT_MOD_OPERATIONS,
    AST_DYNAMIC_VALUE_SOURCES,
    AST_SELECTION_MODES,
    AST_SCOPES,
    AST_ZONE_OWNERS,
    AST_CARD_SIDES,
    AST_ACTIVATION_MODES,
    AST_ALIGNMENTS,
    AST_MESSAGES,
    AST_STAT_FILTER_STATS,
    AST_STAT_FILTER_OPERATORS,
    AST_GENDERS,
    CARD_GENDERS,
  };
}
