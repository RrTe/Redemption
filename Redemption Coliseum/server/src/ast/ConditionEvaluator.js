// server/src/ast/ConditionEvaluator.js
const { ZONES } = require("../../../shared/zones");
const { TargetSelectionService } = require("./TargetSelectionService");
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
        const { selector, operator, value } = condition;
        // If condition specifies a card selector, evaluate matching cards against game state
        if (selector && typeof selector === "object") {
          const actingPlayer =
            context.player ||
            (card?.controllerId ? room?.state?.players?.get?.(card.controllerId) : null);
          const eligible = TargetSelectionService.resolveEligibleTargets(
            room,
            actingPlayer,
            selector,
            { actionType: "condition_check", card }
          );
          const matchCount = eligible?.eligibleCardIds ? eligible.eligibleCardIds.length : 0;
          const targetValue =
            typeof value === "number"
              ? value
              : (selector.count?.fixed_value ?? 1);

          let valid = false;
          switch (operator) {
            case ">=":
              valid = matchCount >= targetValue;
              break;
            case "<=":
              valid = matchCount <= targetValue;
              break;
            case ">":
              valid = matchCount > targetValue;
              break;
            case "<":
              valid = matchCount < targetValue;
              break;
            case "!=":
              valid = matchCount !== (value ?? 0);
              break;
            case "==":
            default:
              valid = typeof value === "number" ? matchCount === value : matchCount >= 1;
              break;
          }

          if (!valid) {
            return {
              valid: false,
              reason: `Zone check selector condition failed (found ${matchCount}, required ${operator || "=="} ${targetValue})`,
            };
          }
          return { valid: true };
        }

        // Fallback: simple card zone check when no selector is specified
        const currentZone = card?.zone;
        const rawRequired = condition.zone || condition.value;
        const requiredZones = Array.isArray(rawRequired)
          ? rawRequired.map((r) => String(r || "").toLowerCase().trim())
          : (rawRequired ? [String(rawRequired).toLowerCase().trim()] : []);

        if (requiredZones.length === 0) {
          return { valid: true };
        }

        if (requiredZones.includes("in_play")) {
          const inPlayZones = [ZONES.TERRITORY, ZONES.BATTLEFIELD];
          if (!inPlayZones.includes(currentZone)) {
            return {
              valid: false,
              reason: `Zone mismatch. Current: ${currentZone}, Required: in_play`,
            };
          }
          return { valid: true };
        }

        if (
          requiredZones.some((z) => [ZONES.BATTLEFIELD, "field_of_battle", "battle"].includes(z))
        ) {
          if (currentZone !== ZONES.BATTLEFIELD) {
            return {
              valid: false,
              reason: `Zone mismatch. Current: ${currentZone}, Required: ${ZONES.BATTLEFIELD}`,
            };
          }
          return { valid: true };
        }

        const normCurrent = String(currentZone || "").toLowerCase();
        if (!requiredZones.some((z) => z === normCurrent || z.replace(/_pile$/, "") === normCurrent.replace(/_pile$/, ""))) {
          return {
            valid: false,
            reason: `Zone mismatch. Current: ${currentZone}, Required: ${requiredZones.join(", ")}`,
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
