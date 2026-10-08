// server/src/ast/handlers/DrawHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS } = require("../../../../shared/astConstants");
const logger = require("../../utils/logger");

/**
 * Handler for executing DRAW ability primitives.
 * Interacts with cardService to handle drawing, hand limits, and Lost Soul diversion.
 */
class DrawHandler {
  /**
   * Executes a draw action effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }} Execution result with mutation snapshot.
   */
  static execute(context) {
    const { room, player, effect, item } = context;

    if (!room || !player) {
      return {
        success: false,
        snapshot: null,
        error: "Missing room or player context",
      };
    }

    // Extract count from AST target definition (default to 1)
    const count = typeof effect?.target?.count?.fixed_value === "number"
      ? effect.target.count.fixed_value
      : 1;

    // Map destination zone
    const destination = effect?.destination === "hand" ? ZONES.HAND : ZONES.HAND;

    logger.info(
      `[DrawHandler] Executing draw of ${count} card(s) for player '${player.name}' (${player.sessionId}).`
    );

    // Execute through cardService (handles hand limits and Lost Soul diversion)
    const result = moveCard(
      player,
      room.state,
      room.cardLookup,
      ZONES.DECK,
      destination,
      0,
      count
    );

    const movedCards = result?.movedCards || [];
    const divertedCards = result?.divertedCards || [];

    // Construct atomic mutation snapshot for rollbacks
    const snapshot = {
      action: AST_ACTIONS.DRAW,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      movedCardIds: movedCards.map((c) => c.id),
      divertedCardIds: divertedCards.map((c) => c.id),
      fromZone: ZONES.DECK,
      toZone: destination,
      count: movedCards.length,
    };

    return {
      success: true,
      snapshot,
      logEntry: result?.logEntry || "",
    };
  }
}

module.exports = { DrawHandler };
