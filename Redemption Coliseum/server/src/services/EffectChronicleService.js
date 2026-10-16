// server/src/services/EffectChronicleService.js
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { ChronicleHistoryService } = require("./ChronicleHistoryService");
const GameLogService = require("./GameLogService");
const logger = require("../utils/logger");

/**
 * Service orchestrating the lifecycle and resolution of items in the Effect Chronicle.
 * Fully decoupled from specific phase engines via completion callbacks.
 */
class EffectChronicleService {
  /**
   * Enqueues cards into the Effect Chronicle.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {Array<object>} cards
   * @param {string} controllerId
   * @param {string} actionType
   * @param {object} [options]
   * @param {(room: any) => void} [options.onComplete]
   */
  static enqueueCards(room, cards, controllerId, actionType, options = {}) {
    if (!room.state.effectChronicle) {
      logger.error("[EffectChronicleService] room.state.effectChronicle is missing.");
      return;
    }

    const chronicle = room.state.effectChronicle;
    room._chronicleOnComplete = typeof options.onComplete === "function" ? options.onComplete : null;

    if (Array.isArray(cards)) {
      cards.forEach((card, index) => {
        const item = new ChronicleItem({
          id: `chronicle_${Date.now()}_${index}_${card.id || "card"}`,
          cardId: card.id || "",
          controllerId: controllerId,
          actionType: actionType || "",
          title: card.Name || card.name || "Card",
          description: card.SpecialAbility || card.specialAbility || "",
          status: CHRONICLE_STATUS.PENDING,
          order: chronicle.items.length + 1,
          abilityId: card.abilityId || options.abilityId || "",
          isOptional: Boolean(card.isOptional || options.isOptional || false),
        });
        chronicle.items.push(item);
      });
    }

    const isFirstActive = !chronicle.isResolving || chronicle.items.length === (cards?.length || 0);
    if (isFirstActive) chronicle.priorityPlayerId = controllerId;
    chronicle.isResolving = chronicle.items.length > 0;

    const player = room.state.players.get(controllerId);
    logger.info(`[EffectChronicleService] Enqueued ${cards?.length || 0} items for '${player?.name || "Player"}' (${controllerId}).`);

    if ((options.autoExecute || options.autoExecuteSupported) && chronicle.items.length > 0 && isFirstActive) {
      const client = room.clients?.find((c) => c.sessionId === controllerId) || { sessionId: controllerId };
      this.executeItem(room, client, chronicle.items[0].id, options);
    }
  }

  /**
   * Resolves/executes an item in the chronicle.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   * @param {string} [itemId]
   * @param {object} [options]
   * @returns {object | null}
   */
  static executeItem(room, client, itemId, options = {}) {
    const chronicle = room.state.effectChronicle;
    if (!chronicle || chronicle.items.length === 0) return null;

    if (client.sessionId !== chronicle.priorityPlayerId) {
      logger.warn(`[EffectChronicleService] Client '${client.sessionId}' attempted execute without priority.`);
      return null;
    }

    const index = itemId ? chronicle.items.findIndex(i => i.id === itemId) : 0;
    if (index === -1) return null;

    const item = chronicle.items[index];
    const player = room.state.players.get(client.sessionId);
    const playerName = player ? player.name : "Player";
    const abilityText = item.description ? `: "${item.description}"` : "";

    // ✨ AST Special Abilities Engine Execution Hook
    let astResult = null;
    if (room.abilityResolver && typeof room.abilityResolver.resolve === "function") {
      astResult = room.abilityResolver.resolve(item, options);
    }

    if (astResult && (astResult.awaitingTargetSelection || astResult.awaitingConfirmation)) {
      return {
        item,
        astResult,
        index,
        awaitingTargetSelection: Boolean(astResult.awaitingTargetSelection),
        awaitingConfirmation: Boolean(astResult.awaitingConfirmation),
      };
    }

    // Fast-Track guard: in draw sequence without autoExecute, unsupported cards stay as pending visual notes
    if (options.autoExecuteSupported && !options.autoExecute && (!astResult || !astResult.handled)) {
      return { item, astResult, index, unhandled: true };
    }

    if (astResult && astResult.handled) {
      if (astResult.logEntries && astResult.logEntries.length > 0) {
        astResult.logEntries.forEach(msg => this._log(room, msg));
      } else {
        this._log(room, `${playerName} executes ${item.title}${abilityText}.`);
      }
    } else {
      // Graceful Fallback: transparent chronicle log
      this._log(room, `${playerName} executes ${item.title}${abilityText}.`);
    }

    ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
    chronicle.items.splice(index, 1);
    this._reindexOrders(chronicle);

    if (chronicle.items.length === 0) {
      this.finishChronicle(room);
    } else if (options.autoExecute || options.autoExecuteSupported) {
      const nextItem = chronicle.items[0];
      chronicle.priorityPlayerId = nextItem.controllerId;
      const nextClient = room.clients?.find(c => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
      this.executeItem(room, nextClient, nextItem.id, options);
    }

    return { item, astResult, index };
  }

  /**
   * Skips/passes on a single item in the chronicle.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   * @param {string} [itemId]
   */
  static passItem(room, client, itemId) {
    const chronicle = room.state.effectChronicle;
    if (!chronicle || chronicle.items.length === 0) return;

    if (client.sessionId !== chronicle.priorityPlayerId) {
      logger.warn(`[EffectChronicleService] Client '${client.sessionId}' attempted pass without priority.`);
      return;
    }

    const index = itemId ? chronicle.items.findIndex(i => i.id === itemId) : 0;
    if (index === -1) return;

    const item = chronicle.items[index];
    const player = room.state.players.get(client.sessionId);
    const playerName = player ? player.name : "Player";

    this._log(room, `${playerName} passes on ${item.title}.`);
    ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.PASSED);
    chronicle.items.splice(index, 1);
    this._reindexOrders(chronicle);

    if (chronicle.items.length === 0) {
      this.finishChronicle(room);
    }
  }

  /**
   * Passes on all remaining items for the priority player.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   */
  static passAllItems(room, client) {
    const chronicle = room.state.effectChronicle;
    if (!chronicle || chronicle.items.length === 0) return;

    if (client.sessionId !== chronicle.priorityPlayerId) {
      logger.warn(`[EffectChronicleService] Client '${client.sessionId}' attempted passAll without priority.`);
      return;
    }

    const player = room.state.players.get(client.sessionId);
    const playerName = player ? player.name : "Player";

    this._log(
      room,
      `${playerName} passes on all remaining Chronicle effects.`
    );

    chronicle.items.forEach(i => ChronicleHistoryService.recordHistory(chronicle, i, CHRONICLE_STATUS.PASSED));
    chronicle.items.splice(0, chronicle.items.length);
    this.finishChronicle(room);
  }

  /**
   * Emits game log via room helper or fallback service.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {string} text
   * @private
   */
  static _log(room, text) {
    if (typeof room.broadcastGameLog === "function") {
      room.broadcastGameLog(text);
    } else {
      GameLogService.broadcastGameLog(room, text);
    }
  }

  /**
   * Finalizes chronicle resolution and triggers the registered completion callback.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static finishChronicle(room) {
    const chronicle = room.state.effectChronicle;
    if (chronicle) {
      chronicle.priorityPlayerId = "";
      chronicle.isResolving = false;
    }

    const onComplete = room._chronicleOnComplete;
    room._chronicleOnComplete = null;

    if (typeof onComplete === "function") {
      logger.info("[EffectChronicleService] Chronicle empty, invoking onComplete callback.");
      onComplete(room);
    }
  }

  /**
   * Re-indexes item order numbers sequentially.
   * @param {import('../state/EffectChronicleState').EffectChronicleState} chronicle
   * @private
   */
  static _reindexOrders(chronicle) {
    chronicle.items.forEach((item, idx) => {
      item.order = idx + 1;
    });
  }

  static purgeHistory(room) {
    ChronicleHistoryService.purgeHistory(room);
  }

  static hasPendingItems(room) {
    return Boolean(room.state.effectChronicle && room.state.effectChronicle.items.length > 0);
  }
}

module.exports = { EffectChronicleService };
