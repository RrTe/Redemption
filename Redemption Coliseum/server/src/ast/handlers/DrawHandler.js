// server/src/ast/handlers/DrawHandler.js
const { moveCard } = require("../../services/cardService");
const { MoveCardSnapshotHelper } = require("../../commands/MoveCardSnapshotHelper");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS } = require("../../../../shared/astConstants");
const { parseTargetCount } = require("../TargetCountResolver");
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

    // Extract finite draw count from AST target definition (defaults to 1)
    const count = parseTargetCount(effect?.target).finiteCount;

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

    // Notify client to trigger card draw animation for cards successfully drawn to hand
    if (destination === ZONES.HAND && movedCards.length > 0 && room?.clients) {
      const client = room.clients.find((c) => c.sessionId === player.sessionId);
      if (client && typeof client.send === "function") {
        client.send("cardsDrawn", {
          cardIds: movedCards.map((c) => c.id),
        });
      }
    }

    // Construct atomic mutation snapshot preserving exact chronological drawOrder
    const drawOrder = Array.isArray(result?.drawOrder) && result.drawOrder.length > 0
      ? result.drawOrder
      : [
          ...movedCards.map((c) => ({ card: c, toZone: destination, isDiverted: false })),
          ...divertedCards.map((c) => ({ card: c, toZone: ZONES.LAND_OF_BONDAGE, isDiverted: true })),
        ];

    const movedCardsList = drawOrder.map((entry) => ({
      cardId: entry.card.id,
      name: entry.card.Name,
      fromZone: ZONES.DECK,
      toZone: entry.toZone,
      ownerId: player.sessionId,
      wasLostSoulDiversion: Boolean(entry.isDiverted),
      fromIndex: 0,
      cardSnapshot: MoveCardSnapshotHelper.createDeckSnapshot(entry.card, player),
    }));

    const snapshot = {
      action: AST_ACTIONS.DRAW,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      movedCards: movedCardsList,
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
