// shared/astConstants.d.ts

export declare const AST_ACTIONS: {
  readonly DRAW: "draw";
  readonly DISCARD: "discard";
  readonly SEARCH: "search";
  readonly NEGATE: "negate";
  readonly PLAY: "play";
  readonly MODIFY_NUMBERS: "modify_numbers";
  readonly MODIFY_STATS: "modify_stats";
  readonly INCREASE: "increase";
  readonly DECREASE: "decrease";
  readonly BAND: "band";
  readonly ADD_TO_BATTLE: "add to battle";
  readonly IMMUNE: "immune";
  readonly PROTECT: "protect";
  readonly SET_IMMUNITY: "set_immunity";
};

export declare const AST_SELECTION_MODES: {
  readonly AUTOMATIC_NEXT: "automatic_next";
  readonly AUTOMATIC_ALL: "automatic_all";
  readonly AUTOMATIC_SELF: "automatic_self";
  readonly MANUAL_CONTROLLER: "manual_controller";
  readonly MANUAL_OPPONENT: "manual_opponent";
};

export declare const AST_SCOPES: {
  readonly BATTLE: "battle";
  readonly TERRITORY: "territory";
  readonly IN_PLAY: "in_play";
  readonly HAND: "hand";
  readonly DECK: "deck";
  readonly DISCARD_PILE: "discard_pile";
  readonly BANISH_PILE: "banish_pile";
  readonly RESERVE_PILE: "reserve_pile";
  readonly SET_ASIDE: "set_aside";
  readonly LAND_OF_BONDAGE: "land_of_bondage";
  readonly LAND_OF_REDEMPTION: "land_of_redemption";
  readonly ARTIFACT_PILE: "artifact_pile";
  readonly ANY: "any";
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

export declare const AST_MESSAGES: {
  readonly REQUEST_TARGET_SELECTION: "requestTargetSelection";
  readonly SELECT_TARGET: "selectTarget";
  readonly REQUEST_OPTIONAL_ABILITY: "requestOptionalAbility";
  readonly RESPOND_OPTIONAL_ABILITY: "respondOptionalAbility";
  readonly ACTION_TELEGRAPH: "actionTelegraph";
  readonly CLEAR_ACTION_TELEGRAPH: "clearActionTelegraph";
};

export declare const AST_STAT_FILTER_STATS: {
  readonly STRENGTH: "strength";
  readonly TOUGHNESS: "toughness";
  readonly BOTH: "both";
  readonly EITHER: "either";
};

export declare const AST_STAT_FILTER_OPERATORS: {
  readonly GTE: ">=";
  readonly LTE: "<=";
  readonly EQ: "==";
  readonly GT: ">";
  readonly LT: "<";
  readonly NEQ: "!=";
};

export type AstAction = typeof AST_ACTIONS[keyof typeof AST_ACTIONS];
export type AstSelectionMode = typeof AST_SELECTION_MODES[keyof typeof AST_SELECTION_MODES];
export type AstScope = typeof AST_SCOPES[keyof typeof AST_SCOPES];
export type AstZoneOwner = typeof AST_ZONE_OWNERS[keyof typeof AST_ZONE_OWNERS];
export type AstCardSide = typeof AST_CARD_SIDES[keyof typeof AST_CARD_SIDES];
export type AstActivationMode = typeof AST_ACTIVATION_MODES[keyof typeof AST_ACTIVATION_MODES];
export type AstAlignment = typeof AST_ALIGNMENTS[keyof typeof AST_ALIGNMENTS];
export type AstMessage = typeof AST_MESSAGES[keyof typeof AST_MESSAGES];
export type AstStatFilterStat = typeof AST_STAT_FILTER_STATS[keyof typeof AST_STAT_FILTER_STATS];
export type AstStatFilterOperator = typeof AST_STAT_FILTER_OPERATORS[keyof typeof AST_STAT_FILTER_OPERATORS];

export interface StatFilter {
  stat: AstStatFilterStat;
  operator?: AstStatFilterOperator;
  value?: number | null;
  variable?: string | null;
}
