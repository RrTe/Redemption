// server/src/ast/handlers/ModifyNumbersHandler.js
const { moveCard, getZoneCollection } = require("../../services/cardService");
const { MoveCardSnapshotHelper } = require("../../commands/MoveCardSnapshotHelper");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { parseTargetCount } = require("../TargetCountResolver");
const { SpecialInitiativeService } = require("../../services/SpecialInitiativeService");
const { ActionTelegraphService } = require("../../services/ActionTelegraphService");
const { BattleCalculator } = require("../../../../shared/BattleCalculator");
const { BattleService } = require("../../services/BattleService");
const { formatCardLink } = require("../../utils/gameLogFormatter");
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

    if (options.specialInitiativeDeclined) {
      if (room.state?.battle) {
        room.state.battle.specialInitiativePlayerId = "";
      }
      const discardedSnapshots = [];
      const logEntries = [];
      let battlefieldAffected = false;

      const defeatedTargets = targets.filter(({ card }) => {
        if (card.zone === ZONES.BATTLEFIELD && BattleCalculator.isCharacter(card)) {
          const stats = BattleCalculator.getCardStats(card);
          return stats.toughness <= 0;
        }
        return false;
      });

      ActionTelegraphService.send(room, {
        sourceCardId: item?.cardId,
        targetCardIds: defeatedTargets.map((t) => t.card.id),
        action: AST_ACTIONS.DISCARD,
        durationMs: 500,
      });

      for (const { card, owner } of defeatedTargets) {
        const snapEntry = this._discardDefeatedCard(room, card, owner);
        if (snapEntry) discardedSnapshots.push(snapEntry);
        logEntries.push(`${formatCardLink(card)} was defeated due to zero toughness and discarded.`);
        battlefieldAffected = true;
      }

      if (battlefieldAffected) {
        BattleService.recalculate(room);
      }

      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.MODIFY_NUMBERS,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          movedCards: discardedSnapshots,
          discardedCards: discardedSnapshots,
        },
        logEntry: logEntries.join(" ") || "Defeated characters discarded.",
      };
    }

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
    ActionTelegraphService.send(room, {
      sourceCardId: item?.cardId,
      targetCardIds: targets.map((t) => t.card.id),
      action: AST_ACTIONS.MODIFY_NUMBERS,
      durationMs: 500,
    });

    const modifications = [];
    const logEntries = [];
    let battlefieldAffected = false;

    for (const { card, owner } of targets) {
      const hadStrengthMod = typeof card.counters?.has === "function"
        ? card.counters.has("strength_mod")
        : Object.prototype.hasOwnProperty.call(card.counters || {}, "strength_mod");
      const hadToughnessMod = typeof card.counters?.has === "function"
        ? card.counters.has("toughness_mod")
        : Object.prototype.hasOwnProperty.call(card.counters || {}, "toughness_mod");
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
        hadStrengthMod,
        hadToughnessMod,
        prevStrengthMod: prevStrMod,
        prevToughnessMod: prevToughMod,
        newStrengthMod: newStrMod,
        newToughnessMod: newToughMod,
      });

      const sSign = sDelta >= 0 ? `+${sDelta}` : `${sDelta}`;
      const tSign = tDelta >= 0 ? `+${tDelta}` : `${tDelta}`;
      logEntries.push(`${formatCardLink(card)} numbers modified by ${sSign}/${tSign}.`);

      if (card.zone === ZONES.BATTLEFIELD) {
        battlefieldAffected = true;
      }
    }

    // REG line 1815: Check characters whose toughness drops to 0 or less
    const defeatedCombatants = [];
    const defeatedDiscards = [];
    for (const { card, owner } of targets) {
      if (BattleCalculator.isCharacter(card)) {
        const stats = BattleCalculator.getCardStats(card);
        if (stats.toughness <= 0) {
          if (card.zone === ZONES.BATTLEFIELD) {
            defeatedCombatants.push({ card, owner });
          } else {
            // Discard immediately if outside battlefield (e.g. territory)
            const snapEntry = this._discardDefeatedCard(room, card, owner);
            if (snapEntry) defeatedDiscards.push(snapEntry);
            logEntries.push(`${formatCardLink(card)} was defeated due to zero toughness and discarded.`);
          }
        }
      }
    }

    if (defeatedCombatants.length > 0) {
      // Check Special Initiative if removing these combatants clears all opponent characters in battle
      const siResult = SpecialInitiativeService.checkAndTrigger(
        room,
        player,
        defeatedCombatants,
        item,
        options,
        "defeated due to zero toughness"
      );
      if (siResult) {
        if (room._undoTxStack?.length > 0) {
          const { ChronicleRollbackService } = require("../../services/ChronicleRollbackService");
          ChronicleRollbackService.recordPartialSnapshot(room, {
            action: AST_ACTIONS.MODIFY_NUMBERS,
            timestamp: Date.now(),
            playerId: player.sessionId,
            cardId: item?.cardId || "",
            modifications,
            movedCards: defeatedDiscards,
            discardedCards: defeatedDiscards,
          });
        }
        if (battlefieldAffected) {
          BattleService.recalculate(room);
        }
        return siResult;
      }

      // If Special Initiative did not trigger (not last characters or not opponent), discard now:
      for (const { card, owner } of defeatedCombatants) {
        logger.info(`[ModifyNumbersHandler] ${card.Name} reduced to <= 0 toughness. Discarding.`);
        const snapEntry = this._discardDefeatedCard(room, card, owner);
        if (snapEntry) defeatedDiscards.push(snapEntry);
        logEntries.push(`${formatCardLink(card)} was defeated due to zero toughness and discarded.`);
        battlefieldAffected = true;
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
      movedCards: defeatedDiscards,
      discardedCards: defeatedDiscards,
    };

    return {
      success: true,
      snapshot,
      logEntry: logEntries.join(" "),
    };
  }

  /**
   * Captures a pre-discard snapshot and moves a zero-toughness character to Discard.
   *
   * @private
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} card Defeated character card.
   * @param {object} owner Controlling player fallback.
   * @returns {object | null} Movement snapshot descriptor.
   */
  static _discardDefeatedCard(room, card, owner) {
    if (!card) return null;
    const fromZone = card.zone;
    const previousControllerId = card.controllerId || owner?.sessionId;
    const currentCollection = getZoneCollection(owner, room.state, fromZone);
    const fromIndex = currentCollection?.findIndex
      ? currentCollection.findIndex((c) => c.id === card.id)
      : -1;
    const cardSnapshot = MoveCardSnapshotHelper.createSnapshot(card, fromZone, owner, fromIndex);

    const trueOwnerId = card.originalOwnerId || card.ownerId;
    const trueOwner = (trueOwnerId && room.state.players.get(trueOwnerId)) || owner;
    const result = moveCard(
      trueOwner,
      room.state,
      room.cardLookup,
      fromZone,
      ZONES.DISCARD,
      card.id,
      1,
      {},
      "",
      "",
      { isAbilityAction: true }
    );
    const movedOrDiverted =
      (result?.movedCards && result.movedCards[0]) ||
      (result?.divertedCards && result.divertedCards[0]);

    return {
      cardId: card.id,
      name: card.Name,
      fromZone,
      toZone: movedOrDiverted?.zone || ZONES.DISCARD,
      ownerId: trueOwner?.sessionId || previousControllerId,
      previousControllerId,
      fromIndex,
      cardSnapshot,
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
    const parsedCount = parseTargetCount(targetDef);
    const maxCount = parsedCount.isAll
      ? eligible.eligibleCardIds.length
      : parsedCount.maxCount;

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
