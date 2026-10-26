import { type RuleValidationResult, type RuleContext } from "./CombatRules";

export class MoveValidator {
  /**
   * Validates a card movement action against all game rules.
   */
  static validate(ctx: RuleContext): RuleValidationResult;
  static validate(
    card: any,
    state?: any,
    cardControllerId?: string,
    targetPlayerId?: string,
    fromZone?: string,
    toZone?: string,
    options?: any
  ): RuleValidationResult;
}
