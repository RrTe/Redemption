// shared/astConstants.d.ts

export declare const AST_ACTIONS: {
  readonly DRAW: "draw";
  readonly DISCARD: "discard";
  readonly SEARCH: "search";
  readonly NEGATE: "negate";
  readonly PLAY: "play";
};

export declare const AST_SELECTION_MODES: {
  readonly AUTOMATIC_NEXT: "automatic_next";
  readonly AUTOMATIC_ALL: "automatic_all";
  readonly MANUAL_CONTROLLER: "manual_controller";
};

export declare const AST_SCOPES: {
  readonly DECK: "deck";
  readonly IN_PLAY: "in_play";
  readonly HAND: "hand";
  readonly DISCARD_PILE: "discard_pile";
  readonly BATTLE: "battle";
};

export declare const AST_ZONE_OWNERS: {
  readonly CONTROLLER: "controller";
  readonly OPPONENT: "opponent";
  readonly EITHER: "either";
  readonly BOTH: "both";
};

export declare const AST_CARD_SIDES: {
  readonly SHARED: "shared";
  readonly TOP: "top";
  readonly BOTTOM: "bottom";
};

export declare const AST_ACTIVATION_MODES: {
  readonly IMMEDIATE: "immediate";
  readonly TRIGGERED: "triggered";
  readonly MANUALLY_TRIGGERED: "manually_triggered";
};

export declare const AST_ALIGNMENTS: {
  readonly GOOD: "good";
  readonly EVIL: "evil";
  readonly NEUTRAL: "neutral";
};

export type AstAction = typeof AST_ACTIONS[keyof typeof AST_ACTIONS];
export type AstSelectionMode = typeof AST_SELECTION_MODES[keyof typeof AST_SELECTION_MODES];
export type AstScope = typeof AST_SCOPES[keyof typeof AST_SCOPES];
export type AstZoneOwner = typeof AST_ZONE_OWNERS[keyof typeof AST_ZONE_OWNERS];
export type AstCardSide = typeof AST_CARD_SIDES[keyof typeof AST_CARD_SIDES];
export type AstActivationMode = typeof AST_ACTIVATION_MODES[keyof typeof AST_ACTIVATION_MODES];
export type AstAlignment = typeof AST_ALIGNMENTS[keyof typeof AST_ALIGNMENTS];
