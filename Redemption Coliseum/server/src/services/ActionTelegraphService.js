// server/src/services/ActionTelegraphService.js
const { AST_MESSAGES } = require("../../../shared/astConstants");

/**
 * Service centralizing transmission and clearing of action telegraph visual events (targeting arrows).
 */
class ActionTelegraphService {
  /**
   * Broadcasts an action telegraph event to all connected clients in a game room.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active Colyseus room instance.
   * @param {object} params Telegraph configuration parameters.
   * @param {string} params.sourceCardId ID of the initiating card.
   * @param {string|string[]} [params.targetCardIds=[]] Target card IDs or single ID.
   * @param {string} [params.action] AST action name (e.g. discard, modify_numbers, band).
   * @param {string} [params.targetPileId] Optional explicit pile identifier.
   * @param {number} [params.durationMs=500] Duration before arrow auto-fades.
   * @param {boolean} [params.persistent=false] Whether arrows persist until cleared.
   * @param {boolean} [params.isSpecialInitiative=false] Flag indicating Special Initiative prompt.
   * @returns {void}
   */
  static send(room, {
    sourceCardId,
    targetCardIds = [],
    action,
    targetPileId,
    durationMs = 500,
    persistent = false,
    isSpecialInitiative = false,
  }) {
    if (!room || typeof room.broadcast !== "function" || !sourceCardId) {
      return;
    }

    const ids = Array.isArray(targetCardIds)
      ? targetCardIds
      : (targetCardIds ? [targetCardIds] : []);

    if (ids.length === 0 && !targetPileId) {
      return;
    }

    room.broadcast(AST_MESSAGES.ACTION_TELEGRAPH, {
      sourceCardId,
      targetCardIds: ids,
      targetPileId,
      action,
      durationMs,
      persistent,
      isSpecialInitiative,
    });
  }

  /**
   * Broadcasts a message to clear active or persistent telegraph targeting arrows.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active Colyseus room instance.
   * @param {object} [options={}] Optional parameters.
   * @param {string} [options.sourceCardId] Optional card ID associated with the telegraph.
   * @returns {void}
   */
  static clear(room, { sourceCardId } = {}) {
    if (!room || typeof room.broadcast !== "function") {
      return;
    }

    room.broadcast(AST_MESSAGES.CLEAR_ACTION_TELEGRAPH, {
      sourceCardId,
    });
  }
}

module.exports = { ActionTelegraphService };

