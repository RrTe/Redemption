import { BattleStateReason } from "./battleConstants";

export interface BattleSideStats {
  strength: number;
  toughness: number;
  characters: any[];
  enhancements: any[];
  totalCards: number;
}

export interface BattleEvaluationResult {
  rescuer: BattleSideStats;
  blocker: BattleSideStats;
  initiativePlayerId: string;
  stateReason: BattleStateReason;
  description: string;
}

export interface BattleEvaluationParams {
  battlefield: any[];
  activePlayerId: string;
  defenderPlayerId: string;
  lastBattleCardPlayerId?: string;
  currentPhase?: string;
}

export declare class BattleCalculator {
  static parseStat(val: string | number | undefined | null): number;
  static getCounterModifier(card: any, statKey: string): number;
  static getCardStats(card: any): { strength: number; toughness: number };
  static isCharacter(card: any): boolean;
  static calculateSide(battlefield: any[], sidePlayerId: string): BattleSideStats;
  static evaluateBattle(params: BattleEvaluationParams): BattleEvaluationResult;
}
