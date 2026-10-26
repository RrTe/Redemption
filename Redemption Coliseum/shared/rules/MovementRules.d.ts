import { type RuleValidationResult, type RuleContext, type RuleFunction } from "./CombatRules";

export class MovementRules {
  static isLostSoul(card: any): boolean;
  static lostSoulMovementRule(ctx: RuleContext): RuleValidationResult;
  static foreignPileRule(ctx: RuleContext): RuleValidationResult;
  static reserveFirstRoundRule(ctx: RuleContext): RuleValidationResult;
  static handLimitRule(ctx: RuleContext): RuleValidationResult;
  static validate(ctx: RuleContext): RuleValidationResult;
}

export const LostSoulMovementRule: RuleFunction;
export const ForeignPileRule: RuleFunction;
export const ReserveFirstRoundRule: RuleFunction;
export const HandLimitRule: RuleFunction;
