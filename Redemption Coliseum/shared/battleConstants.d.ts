export type BattleStateReason =
  | "NO_BATTLE"
  | "UNBLOCKED"
  | "BLOCKER_UNOPPOSED"
  | "LOSING_NUMBERS"
  | "STALEMATE"
  | "MUTUAL_DESTRUCTION";

export declare const BATTLE_STATE_REASON: {
  readonly NO_BATTLE: "NO_BATTLE";
  readonly UNBLOCKED: "UNBLOCKED";
  readonly BLOCKER_UNOPPOSED: "BLOCKER_UNOPPOSED";
  readonly LOSING_NUMBERS: "LOSING_NUMBERS";
  readonly STALEMATE: "STALEMATE";
  readonly MUTUAL_DESTRUCTION: "MUTUAL_DESTRUCTION";
};

export declare const BATTLE_HUD_CONFIG: {
  readonly BADGE_WIDTH: number;
  readonly BADGE_HEIGHT: number;
  readonly INITIATIVE_WIDTH: number;
  readonly INITIATIVE_HEIGHT: number;
  readonly SLOT_GAP: number;
  readonly PANEL_PADDING: number;
  readonly BORDER_RADIUS: number;
  readonly RESCUER_COLOR: number;
  readonly BLOCKER_COLOR: number;
  readonly GOLD_HEX: string;
  readonly BLOCKER_HEX: string;
  readonly INITIATIVE_GLOW_COLOR: number;
  readonly STALEMATE_COLOR: number;
  readonly MUTUAL_COLOR: number;
  readonly BACKGROUND_COLOR: number;
  readonly BACKGROUND_ALPHA: number;
  readonly STROKE_WIDTH: number;
};
