// shared/astConstants.d.ts

export declare const AST_ACTIONS: {
  readonly DRAW: "draw";
  readonly DISCARD: "discard";
  readonly SEARCH: "search";
  readonly NEGATE: "negate";
  readonly PLAY: "play";
  readonly MODIFY_STATS: "modify_stats";
  readonly BAND: "band";
  readonly ADD_TO_BATTLE: "add to battle";
  readonly IMMUNE: "immune";
  readonly PROTECT: "protect";
  readonly SET_IMMUNITY: "set_immunity";
  readonly PARALYZE: "paralyze";
  readonly RELEASE: "release";
  readonly WITHDRAW: "withdraw";
  readonly CHOOSE_OPPONENT: "choose opponent";
  readonly PRESENT: "present";
  readonly BOUNCE: "bounce";
  readonly TOPDECK: "topdeck";
  readonly UNDERDECK: "underdeck";
  readonly BANISH: "banish";
  readonly PLACE: "place";
  readonly TAKE: "take";
  readonly DEACTIVATE: "deactivate";
  readonly BEGIN_A_NEW_PHASE: "begin a new phase";
};

export declare const AST_DIRECTIONAL_FILTER_ACTIONS: {
  readonly INCREASE: "increase";
  readonly DECREASE: "decrease";
};

export declare const AST_TARGET_PHASES: {
  readonly CURRENT: "current";
  readonly DRAW_PHASE: "draw_phase";
  readonly UPKEEP_PHASE: "upkeep_phase";
  readonly PREPARATION_PHASE: "preparation_phase";
  readonly BATTLE_PHASE: "battle_phase";
  readonly DISCARD_PHASE: "discard_phase";
};

export declare const AST_BATTLE_RESTRICTIONS: {
  readonly RESCUE_ATTEMPT: "rescue_attempt";
  readonly BATTLE_CHALLENGE: "battle_challenge";
};

export declare const AST_STAT_MOD_OPERATIONS: {
  readonly ADD: "add";
  readonly MULTIPLY: "multiply";
  readonly SET: "set";
};

export declare const AST_DYNAMIC_VALUE_SOURCES: {
  readonly COUNT_CARDS: "count_cards";
  readonly COUNT_BRIGADES: "count_brigades";
  readonly STAT_VALUE: "stat_value";
  readonly CARDS_DRAWN: "cards_drawn";
  readonly LOST_SOULS_IN_PLAY: "lost_souls_in_play";
  readonly SELF_STAT: "self_stat";
  readonly TARGET_STAT: "target_stat";
  readonly CHAINED_TARGET_STATS: "chained_target_stats";
  readonly COST_TARGET_STATS: "cost_target_stats";
  readonly CARD_X_IDENTIFIER: "card_x_identifier";
  readonly PLAYER_CHOICE: "player_choice";
};

export declare const AST_SELECTION_MODES: {
  readonly AUTOMATIC_NEXT: "automatic_next";
  readonly AUTOMATIC_ALL: "automatic_all";
  readonly AUTOMATIC_LAST: "automatic_last";
  readonly AUTOMATIC_SELF: "automatic_self";
  readonly MANUAL_CONTROLLER: "manual_controller";
  readonly MANUAL_OPPONENT: "manual_opponent";
  readonly CHAINED_TARGET: "chained_target";
  readonly CONTEXT_REMAINDER: "context_remainder";
  readonly RANDOM: "random";
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
  readonly CONTEXT_SCOPE: "context_scope";
  readonly ANY: "any";
};

export declare const AST_ZONE_OWNERS: {
  readonly CONTROLLER: "controller";
  readonly OPPONENT: "opponent";
  readonly EITHER: "either";
  readonly BOTH: "both";
  readonly TARGET_PLAYER: "target_player";
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
  readonly STATIC: "static";
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
  readonly CANCEL_INTERACTION: "cancelInteraction";
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

export declare const AST_GENDERS: {
  readonly MALE: "male";
  readonly FEMALE: "female";
};

export declare const CARD_GENDERS: {
  readonly MALE: "male";
  readonly FEMALE: "female";
  readonly BOTH: "both";
  readonly GENDERLESS: "genderless";
};

export type AstAction = typeof AST_ACTIONS[keyof typeof AST_ACTIONS];
export type AstDirectionalFilterAction = typeof AST_DIRECTIONAL_FILTER_ACTIONS[keyof typeof AST_DIRECTIONAL_FILTER_ACTIONS];
export type AstTargetPhase = typeof AST_TARGET_PHASES[keyof typeof AST_TARGET_PHASES];
export type AstBattleRestriction = typeof AST_BATTLE_RESTRICTIONS[keyof typeof AST_BATTLE_RESTRICTIONS];
export type AstStatModOperation = typeof AST_STAT_MOD_OPERATIONS[keyof typeof AST_STAT_MOD_OPERATIONS];
export type AstDynamicValueSource = typeof AST_DYNAMIC_VALUE_SOURCES[keyof typeof AST_DYNAMIC_VALUE_SOURCES];
export type AstSelectionMode = typeof AST_SELECTION_MODES[keyof typeof AST_SELECTION_MODES];
export type AstScope = typeof AST_SCOPES[keyof typeof AST_SCOPES];
export type AstZoneOwner = typeof AST_ZONE_OWNERS[keyof typeof AST_ZONE_OWNERS];
export type AstCardSide = typeof AST_CARD_SIDES[keyof typeof AST_CARD_SIDES];
export type AstActivationMode = typeof AST_ACTIVATION_MODES[keyof typeof AST_ACTIVATION_MODES];
export type AstAlignment = typeof AST_ALIGNMENTS[keyof typeof AST_ALIGNMENTS];
export type AstMessage = typeof AST_MESSAGES[keyof typeof AST_MESSAGES];
export type AstStatFilterStat = typeof AST_STAT_FILTER_STATS[keyof typeof AST_STAT_FILTER_STATS];
export type AstStatFilterOperator = typeof AST_STAT_FILTER_OPERATORS[keyof typeof AST_STAT_FILTER_OPERATORS];
export type AstGender = typeof AST_GENDERS[keyof typeof AST_GENDERS];
export type CardGender = typeof CARD_GENDERS[keyof typeof CARD_GENDERS];

export interface StatFilter {
  stat: AstStatFilterStat;
  operator?: AstStatFilterOperator;
  value?: number | null;
  variable?: string | null;
}
