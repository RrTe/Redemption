// server/src/ast/AstEffectRunner.js
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { DrawHandler } = require("./handlers/DrawHandler");
const { DiscardHandler } = require("./handlers/DiscardHandler");
const { ModifyNumbersHandler } = require("./handlers/ModifyNumbersHandler");
const { BandHandler } = require("./handlers/BandHandler");
const { ImmunityHandler } = require("./handlers/ImmunityHandler");
const logger = require("../utils/logger");

/**
 * Execution runner for AST abilities.
 * Routes individual effect steps to atomic handlers or triggers graceful fallbacks.
 */
class AstEffectRunner {
  /**
   * Action handler registry.
   */
  static _handlers = {
    [AST_ACTIONS.DRAW]: DrawHandler,
    [AST_ACTIONS.DISCARD]: DiscardHandler,
    [AST_ACTIONS.MODIFY_NUMBERS]: ModifyNumbersHandler,
    [AST_ACTIONS.MODIFY_STATS]: ModifyNumbersHandler,
    [AST_ACTIONS.INCREASE]: ModifyNumbersHandler,
    [AST_ACTIONS.DECREASE]: ModifyNumbersHandler,
    [AST_ACTIONS.BAND]: BandHandler,
    [AST_ACTIONS.ADD_TO_BATTLE]: BandHandler,
    [AST_ACTIONS.IMMUNE]: ImmunityHandler,
    [AST_ACTIONS.PROTECT]: ImmunityHandler,
    [AST_ACTIONS.SET_IMMUNITY]: ImmunityHandler,
  };

  /**
   * Runs an ability by dispatching its effect steps in sequence.
   *
   * @param {object} ability AST ability node.
   * @param {object} context Execution context.
   * @param {import('../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters.
   * @returns {{ handled: boolean, snapshots?: object[], logEntries?: string[], reason?: string, unsupportedAction?: string }}
   */
  static runAbility(ability, context) {
    if (!ability || !Array.isArray(ability.effects) || ability.effects.length === 0) {
      return {
        handled: false,
        reason: "EMPTY_EFFECTS",
      };
    }

    const snapshots = [];
    const logEntries = [];

    // Sort effects by step order if present
    const sortedEffects = [...ability.effects].sort((a, b) => (a.step || 1) - (b.step || 1));

    for (const effect of sortedEffects) {
      const action = effect.action;
      const handler = this._handlers[action];

      if (!handler) {
        logger.info(
          `[AstEffectRunner] Action '${action}' is not supported in Phase 1. Triggering fallback.`
        );
        return {
          handled: false,
          reason: "UNSUPPORTED_ACTION",
          unsupportedAction: action,
        };
      }

      const result = handler.execute({
        ...context,
        effect,
      });

      if (result?.awaitingSpecialInitiative) {
        return {
          handled: true,
          awaitingSpecialInitiative: true,
          targetCard: result.targetCard,
          targetOwner: result.targetOwner,
        };
      }

      if (result?.awaitingTargetSelection) {
        return {
          handled: true,
          awaitingTargetSelection: true,
          eligible: result.eligible,
        };
      }

      if (!result || !result.success) {
        logger.warn(
          `[AstEffectRunner] Handler failed for action '${action}': ${result?.error}`
        );
        return {
          handled: false,
          reason: "HANDLER_ERROR",
          error: result?.error,
        };
      }

      if (result.snapshot) {
        snapshots.push(result.snapshot);
      }
      if (result.logEntry) {
        logEntries.push(result.logEntry);
      }
    }

    return {
      handled: true,
      snapshots,
      logEntries,
    };
  }
}

module.exports = { AstEffectRunner };
