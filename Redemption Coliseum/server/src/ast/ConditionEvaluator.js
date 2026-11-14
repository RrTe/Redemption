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
        const { selector, value } = condition;
        // If condition specifies a card selector, evaluate matching cards against game state
        if (selector && typeof selector === "object") {
          const scopes = Array.isArray(selector.scope)
            ? selector.scope.map((s) => String(s || "").toLowerCase())
            : [];
          const actingPlayer =
            context.player ||
            (card?.controllerId ? room?.state?.players?.get?.(card.controllerId) : null);

          // Static "by <Source>" protection condition against an explicit source card
          if (
            context.sourceCard &&
            selector.zone_owner === "either" &&
            scopes.includes("in_play") &&
            (!operator || operator === "==") &&
            (value === 1 || value === true || value === undefined)
          ) {
            const matchesSource = TargetSelectionService.matchesFilter(context.sourceCard, selector, {
              room,
              sourceCard: card,
              card,
            });
            return matchesSource
              ? { valid: true }
              : { valid: false, reason: "Protection source filter did not match interrupting/negating card" };
          }

          // Static "if used by <Actor>" condition against an explicit bearer/actor card
          if (
            context.actorCard &&
            selector.zone_owner === "controller" &&
            scopes.includes("battle") &&
            (!operator || operator === "==") &&
            (value === 1 || value === true || value === undefined)
          ) {
            const matchesActor = TargetSelectionService.matchesFilter(context.actorCard, selector, {
              room,
              sourceCard: card,
              card,
            });
            return matchesActor
              ? { valid: true }
              : { valid: false, reason: "Actor card filter did not match bearer" };
          }

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
          if (!operator || operator === "==") {
            if (value === 0 || value === false) {
              valid = matchCount === 0;
            } else if (typeof value === "number" && value > 1) {
              valid = matchCount >= value;
            } else {
              // Covers value === 1, true, or undefined ("if <Entity> is in play/battle")
              valid = matchCount >= 1;
            }
          } else {
            valid = this._compareNumbers(matchCount, operator, targetValue);
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

      case "count_comparison": {
        const { selector, value } = condition;
        if (!selector || typeof selector !== "object") {
          return { valid: true };
        }
        const { actingPlayer } = this._resolvePlayers(room, card, context);
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
        const valid = this._compareNumbers(matchCount, operator || ">=", targetValue);
        if (!valid) {
          return {
            valid: false,
            reason: `Count comparison failed (found ${matchCount}, required ${operator || ">="} ${targetValue})`,
          };
        }
        return { valid: true };
      }

      case "hand_advantage": {
        const { selector, value } = condition;
        const { actingPlayer, opponentPlayer } = this._resolvePlayers(room, card, context);
        if (!actingPlayer || !opponentPlayer) {
          return { valid: false, reason: "Missing controller or opponent for hand/board advantage comparison" };
        }

        // Combined threshold check (e.g. "both hands > 4")
        if (selector?.zone_owner === "both" && typeof value === "number" && value > 1) {
          const eligible = TargetSelectionService.resolveEligibleTargets(
            room,
            actingPlayer,
            selector,
            { actionType: "condition_check", card }
          );
          const count = eligible?.eligibleCardIds ? eligible.eligibleCardIds.length : 0;
          const valid = this._compareNumbers(count, operator || ">", value);
          return valid
            ? { valid: true }
            : { valid: false, reason: `Combined count comparison failed (${count} ${operator || ">"} ${value})` };
        }

        const scopes = Array.isArray(selector?.scope)
          ? selector.scope.map((s) => String(s || "").toLowerCase())
          : ["hand"];
        const controllerCount = this._countPlayerZoneCards(room, actingPlayer, scopes);
        const opponentCount = this._countPlayerZoneCards(room, opponentPlayer, scopes);
        const diff = opponentCount - controllerCount;
        const valid = this._evaluateAdvantageDiff(diff, controllerCount, opponentCount, operator, value, selector);
        if (!valid) {
          return {
            valid: false,
            reason: `Advantage check failed (controller=${controllerCount}, opponent=${opponentCount})`,
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

  /**
   * Compares two numeric counts with standard AST relational operators.
   *
   * @private
   */
  static _compareNumbers(actual, operator, targetValue) {
    switch (operator) {
      case ">=":
        return actual >= targetValue;
      case "<=":
        return actual <= targetValue;
      case ">":
        return actual > targetValue;
      case "<":
        return actual < targetValue;
      case "!=":
        return actual !== targetValue;
      case "==":
      default:
        return actual === targetValue;
    }
  }

  /**
   * Resolves controller and opponent player objects from game room state.
   *
   * @private
   */
  static _resolvePlayers(room, card, context) {
    const controllerId = context.player?.sessionId || card?.controllerId || card?.ownerId;
    const playersMap = room?.state?.players;
    const actingPlayer =
      context.player ||
      (controllerId && playersMap?.get ? playersMap.get(controllerId) : null) ||
      null;
    let opponentPlayer = null;
    if (playersMap && typeof playersMap.forEach === "function") {
      playersMap.forEach((p, key) => {
        const pid = p?.sessionId || key;
        if (!opponentPlayer && actingPlayer && pid !== (actingPlayer.sessionId || controllerId)) {
          opponentPlayer = p;
        }
      });
    }
    return { actingPlayer, opponentPlayer };
  }

  /**
   * Counts cards belonging to a player across requested scopes ("hand" or "in_play").
   *
   * @private
   */
  static _countPlayerZoneCards(room, player, scopes) {
    if (scopes.includes("in_play")) {
      const pid = player?.sessionId || player?.id;
      const terrCount = Array.isArray(player?.territory) ? player.territory.length : 0;
      const bfCount = Array.isArray(room?.state?.battlefield)
        ? room.state.battlefield.filter((c) => (c?.controllerId || c?.ownerId) === pid).length
        : 0;
      return terrCount + bfCount;
    }
    return Array.isArray(player?.hand) ? player.hand.length : 0;
  }

  /**
   * Evaluates opponent-minus-controller card advantage differences across AST variants.
   *
   * @private
   */
  static _evaluateAdvantageDiff(diff, controllerCount, opponentCount, operator, value, selector) {
    const owner = selector?.zone_owner;
    if (operator === ">") {
      if (value === undefined || value === 0 || value === "opponent") {
        return owner === "controller" ? controllerCount > opponentCount : opponentCount > controllerCount;
      }
      return diff > Number(value);
    }
    if (operator === ">=") {
      return typeof value === "number" ? diff >= value : opponentCount >= controllerCount;
    }
    if (operator === "<") {
      if (value === undefined || value === 0) {
        return owner === "controller" ? controllerCount < opponentCount : opponentCount < controllerCount;
      }
      return diff < Number(value);
    }
    if (operator === "<=") {
      return typeof value === "number" ? diff <= value : opponentCount <= controllerCount;
    }
    if (operator === "==") {
      if (!selector && value === undefined) {
        return opponentCount === controllerCount;
      }
      if (value === "opponent" || value === 1 || owner === "opponent") {
        return opponentCount > controllerCount;
      }
      if (owner === "controller" && value === undefined) {
        return controllerCount > opponentCount;
      }
      return typeof value === "number" ? diff === value : opponentCount === controllerCount;
    }
    return false;
  }
}

module.exports = { ConditionEvaluator };
