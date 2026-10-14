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
});

/**
 * AST targeting selection modes.
 */
export const AST_SELECTION_MODES = /** @type {const} */ ({
  AUTOMATIC_NEXT: "automatic_next",
  AUTOMATIC_ALL: "automatic_all",
  MANUAL_CONTROLLER: "manual_controller",
});

/**
 * AST targeting scopes (source / destination zone scopes).
 */
export const AST_SCOPES = /** @type {const} */ ({
  DECK: "deck",
  IN_PLAY: "in_play",
  HAND: "hand",
  DISCARD_PILE: "discard_pile",
  BATTLE: "battle",
});

/**
 * AST zone ownership filters.
 */
export const AST_ZONE_OWNERS = /** @type {const} */ ({
  CONTROLLER: "controller",
  OPPONENT: "opponent",
  EITHER: "either",
  BOTH: "both",
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
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AST_ACTIONS,
    AST_SELECTION_MODES,
    AST_SCOPES,
    AST_ZONE_OWNERS,
    AST_CARD_SIDES,
    AST_ACTIVATION_MODES,
    AST_ALIGNMENTS,
    AST_MESSAGES,
  };
}
