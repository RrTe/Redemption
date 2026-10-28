// server/src/ast/handlers/ModifyNumbersHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleCalculator } = require("../../../../shared/BattleCalculator");
const { BattleService } = require("../../services/BattleService");
const logger = require("../../utils/logger");

/**
 * Handler for executing MODIFY_NUMBERS / MODIFY_STATS / INCREASE / DECREASE ability primitives.
 * Updates dynamic strength and toughness counters on cards and synchronizes battle numbers.
 */
class ModifyNumbersHandler {
  /**
   * Executes a modify numbers/stats effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional execution flags (e.g. explicit targetCardIds).
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }} Result.
   */
  static execute(context) {
    const { room, player, effect, item, options = {} } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const targetDef = effect?.target || {};

    // 1. Resolve stat modifier values
    const action = effect?.action || AST_ACTIONS.MODIFY_NUMBERS;
    let sDelta = typeof effect?.strength_mod === "number" ? effect.strength_mod : 0;
    let tDelta = typeof effect?.toughness_mod === "number" ? effect.toughness_mod : 0;

    if (action === AST_ACTIONS.DECREASE) {
      if (sDelta > 0) sDelta = -sDelta;
      if (tDelta > 0) tDelta = -tDelta;
    } else if (action === AST_ACTIONS.INCREASE) {
      if (sDelta < 0) sDelta = Math.abs(sDelta);
      if (tDelta < 0) tDelta = Math.abs(tDelta);
    }

    // 2. Resolve target cards
    const targets = this._resolveTargets(room, player, targetDef, sourceCard, options);

    if (targets.length === 0) {
      logger.info("[ModifyNumbersHandler] No targets found to modify stats.");
      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.MODIFY_NUMBERS,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          modifications: [],
        },
        logEntry: `${player.name} modifies numbers, but no eligible targets were found.`,
      };
    }

    // Broadcast action telegraph
    if (typeof room.broadcast === "function" && item?.cardId) {
      room.broadcast(AST_MESSAGES.ACTION_TELEGRAPH, {
        sourceCardId: item.cardId,
        targetCardIds: targets.map((t) => t.card.id),
        action: AST_ACTIONS.MODIFY_NUMBERS,
        durationMs: 500,
      });
    }

    const modifications = [];
    const logEntries = [];
    let battlefieldAffected = false;

    for (const { card, owner } of targets) {
      const prevStrMod = typeof card.counters?.get === "function"
        ? (card.counters.get("strength_mod") || 0)
        : (card.counters?.strength_mod || 0);
      const prevToughMod = typeof card.counters?.get === "function"
        ? (card.counters.get("toughness_mod") || 0)
        : (card.counters?.toughness_mod || 0);

      const newStrMod = prevStrMod + sDelta;
      const newToughMod = prevToughMod + tDelta;

      if (typeof card.counters?.set === "function") {
        card.counters.set("strength_mod", newStrMod);
        card.counters.set("toughness_mod", newToughMod);
      } else if (card.counters) {
        card.counters.strength_mod = newStrMod;
        card.counters.toughness_mod = newToughMod;
      }

      modifications.push({
        cardId: card.id,
        name: card.Name,
        strengthDelta: sDelta,
        toughnessDelta: tDelta,
        prevStrengthMod: prevStrMod,
        prevToughnessMod: prevToughMod,
        newStrengthMod: newStrMod,
        newToughnessMod: newToughMod,
      });

      const sSign = sDelta >= 0 ? `+${sDelta}` : `${sDelta}`;
      const tSign = tDelta >= 0 ? `+${tDelta}` : `${tDelta}`;
      logEntries.push(`${card.Name} numbers modified by ${sSign}/${tSign}.`);

      if (card.zone === ZONES.BATTLEFIELD) {
        battlefieldAffected = true;
      }

      // REG line 1815: If toughness of a character is decreased to 0 or less, it is discarded
      if (BattleCalculator.isCharacter(card)) {
        const stats = BattleCalculator.getCardStats(card);
        if (stats.toughness <= 0) {
          logger.info(`[ModifyNumbersHandler] ${card.Name} reduced to <= 0 toughness (${stats.toughness}). Discarding.`);
          moveCard(owner, room.state, room.cardLookup, card.zone, ZONES.DISCARD, card.id);
          logEntries.push(`${card.Name} was defeated due to zero toughness and discarded.`);
          battlefieldAffected = true;
        }
      }
    }

    if (battlefieldAffected) {
      BattleService.recalculate(room);
    }

    const snapshot = {
      action: AST_ACTIONS.MODIFY_NUMBERS,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      modifications,
    };

    return {
      success: true,
      snapshot,
      logEntry: logEntries.join(" "),
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
      { sourceCard, actionType: AST_ACTIONS.MODIFY_NUMBERS }
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

module.exports = { ModifyNumbersHandler };
