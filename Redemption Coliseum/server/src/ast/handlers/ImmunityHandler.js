// server/src/ast/handlers/ImmunityHandler.js
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleService } = require("../../services/BattleService");
const logger = require("../../utils/logger");

/**
 * Handler for executing IMMUNE, PROTECT, and SET_IMMUNITY ability primitives
 * in accordance with official Redemption REG v11.0.0 guidelines (page 52, line 1723ff).
 */
class ImmunityHandler {
  /**
   * Executes an immune/protect effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters.
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }}
   */
  static execute(context) {
    const { room, player, effect, item, options = {} } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const targetDef = effect?.target || {};

    // 1. Resolve targets
    const targets = this._resolveTargets(room, player, targetDef, sourceCard, options);

    if (targets.length === 0) {
      logger.info("[ImmunityHandler] No eligible targets found to grant immunity/protect.");
      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.SET_IMMUNITY,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          protectedCardIds: [],
        },
        logEntry: `${player.name} activates protection, but no eligible targets were found.`,
      };
    }

    // 2. Extract protection parameters
    const protectionDef = this._buildProtectionDef(effect);

    // Broadcast action telegraph
    if (typeof room.broadcast === "function" && item?.cardId) {
      room.broadcast(AST_MESSAGES.ACTION_TELEGRAPH, {
        sourceCardId: item.cardId,
        targetCardIds: targets.map((t) => t.card.id),
        action: AST_ACTIONS.SET_IMMUNITY,
        durationMs: 500,
      });
    }

    let battleRecalculateNeeded = false;
    const protectedCardIds = [];
    const logEntries = [];

    for (const { card } of targets) {
      card.isImmune = true;
      card.isProtected = true;
      card.protectionReason = effect.action || "immune";
      card._protection = {
        ...protectionDef,
        sourceCardId: item?.cardId || "",
      };

      protectedCardIds.push(card.id);
      logEntries.push(`${card.Name} gains immunity / protection.`);

      if (card.zone === ZONES.BATTLEFIELD) {
        battleRecalculateNeeded = true;
      }
    }

    if (battleRecalculateNeeded) {
      BattleService.recalculate(room);
    }

    const snapshot = {
      action: AST_ACTIONS.SET_IMMUNITY,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      protectedCardIds,
      protectionDef,
    };

    return {
      success: true,
      snapshot,
      logEntry: logEntries.join(" "),
    };
  }

  /**
   * Constructs the structured protection configuration from AST effect data.
   *
   * @private
   * @param {object} effect AST effect.
   * @returns {object} Structured protection definition.
   */
  static _buildProtectionDef(effect) {
    const rawProtectedFrom = effect?.protected_from || {};
    const targetDef = effect?.target || {};

    const brigades = [
      ...(Array.isArray(rawProtectedFrom.brigades) ? rawProtectedFrom.brigades : []),
      ...(Array.isArray(targetDef.identifiers) ? targetDef.identifiers.filter((id) => id.includes("Brigade")) : []),
    ];

    const alignments = [
      ...(Array.isArray(rawProtectedFrom.alignments) ? rawProtectedFrom.alignments : []),
      ...(targetDef.alignment ? [targetDef.alignment] : []),
    ];

    const actions = Array.isArray(rawProtectedFrom.actions) ? rawProtectedFrom.actions : [];
    const harm = Boolean(
      rawProtectedFrom.harm ||
      (effect.action || "").includes("harm") ||
      (targetDef.target_type || "").includes("harm") ||
      alignments.length > 0 ||
      brigades.length > 0
    );

    return {
      brigades,
      alignments,
      actions,
      harm,
      opponent: rawProtectedFrom.opponent !== false,
      duration: effect?.duration || "phase",
    };
  }

  /**
   * Resolves target cards matching AST criteria.
   *
   * @private
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {object} targetDef AST target definition.
   * @param {object} [sourceCard] Source card executing the effect.
   * @param {object} [options] Execution options.
   * @returns {Array<{ card: object, owner: object }>}
   */
  static _resolveTargets(room, actingPlayer, targetDef, sourceCard, options) {
    if (targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_SELF && sourceCard) {
      const owner = room.state.players.get(sourceCard.controllerId || sourceCard.ownerId) || actingPlayer;
      return [{ card: sourceCard, owner }];
    }

    const explicitIds = options.targetCardIds || [];
    if (explicitIds.length > 0) {
      const explicit = [];
      for (const id of explicitIds) {
        const c = room.cardLookup?.get(id);
        if (c) {
          const owner = room.state.players.get(c.controllerId || c.ownerId) || actingPlayer;
          explicit.push({ card: c, owner });
        }
      }
      return explicit;
    }

    const eligible = TargetSelectionService.resolveEligibleTargets(
      room,
      actingPlayer,
      targetDef,
      { sourceCard, actionType: AST_ACTIONS.SET_IMMUNITY }
    );

    const candidates = [];
    const maxCount = targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL
      ? eligible.eligibleCardIds.length
      : (typeof targetDef.count?.fixed_value === "number" ? targetDef.count.fixed_value : 1);

    for (const cardId of eligible.eligibleCardIds) {
      const c = room.cardLookup?.get(cardId);
      if (c) {
        const owner = room.state.players.get(c.controllerId || c.ownerId) || actingPlayer;
        candidates.push({ card: c, owner });
        if (candidates.length >= maxCount) break;
      }
    }

    return candidates;
  }
}

module.exports = { ImmunityHandler };
