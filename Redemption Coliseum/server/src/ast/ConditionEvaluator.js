// server/src/ast/ConditionEvaluator.js
const logger = require("../utils/logger");

/**
 * Pure evaluator for checking ability activation conditions against game state.
 */
class ConditionEvaluator {
  /**
   * Evaluates an array of conditions against game context.
   *
   * @param {Array<object>} conditions List of condition objects from AST.
   * @param {object} context Game evaluation context.
   * @param {import('../rooms/GameRoom').GameRoom} [context.room] Active game room.
   * @param {object} [context.player] Current acting player.
   * @param {object} [context.card] Active card instance.
   * @returns {{ valid: boolean, reason?: string, failedCondition?: object }} Result of condition evaluation.
   */
  static evaluate(conditions, context = {}) {
    // Empty conditions list means unconditional execution
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return { valid: true };
    }

    for (const condition of conditions) {
      const result = this._evaluateSingle(condition, context);
      if (!result.valid) {
        return {
          valid: false,
          reason: result.reason || "Condition failed",
          failedCondition: condition,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Evaluates a single condition object against context.
   *
   * @param {object} condition Single AST condition node.
   * @param {object} context Evaluation context.
   * @returns {{ valid: boolean, reason?: string }} Result for single condition.
   * @private
   */
  static _evaluateSingle(condition, context) {
    if (!condition || !condition.condition_type) {
      return { valid: true };
    }

    const { condition_type, operator } = condition;
    const { room, card } = context;

    switch (condition_type) {
      case "phase_check": {
        const currentPhase = room?.state?.currentPhase;
        const requiredPhase = condition.phase || condition.value;
        if (requiredPhase && currentPhase !== requiredPhase) {
          return {
            valid: false,
            reason: `Phase mismatch. Current: ${currentPhase}, Required: ${requiredPhase}`,
          };
        }
        return { valid: true };
      }

      case "zone_check": {
        const currentZone = card?.zone;
        const requiredZone = condition.zone || condition.value || condition.selector?.scope;
        if (requiredZone && currentZone !== requiredZone) {
          return {
            valid: false,
            reason: `Zone mismatch. Current: ${currentZone}, Required: ${requiredZone}`,
          };
        }
        return { valid: true };
      }

      default:
        logger.debug(
          `[ConditionEvaluator] Unhandled condition type '${condition_type}', passing conditionally.`
        );
        return { valid: true };
    }
  }
}

module.exports = { ConditionEvaluator };
