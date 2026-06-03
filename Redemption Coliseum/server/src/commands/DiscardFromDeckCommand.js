const { BaseCommand } = require("./BaseCommand");
const {
  moveCard,
  getZoneCollection,
  getZoneDisplayName,
} = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const logger = require("../utils/logger");

class DiscardFromDeckCommand extends BaseCommand {
  execute(message) {
    const { count, position, targetPlayerId } = message;
    const actingPlayer = this.state.players.get(this.client.sessionId);
    const targetPlayer = this.state.players.get(
      targetPlayerId || this.client.sessionId,
    );

    if (!targetPlayer || !actingPlayer) return;

    const deck = getZoneCollection(targetPlayer, this.state, ZONES.DECK);
    if (deck.length < count) return;

    const cardsToDiscard =
      position === "top" ? deck.slice(0, count) : deck.slice(-count);

    for (const card of cardsToDiscard) {
      moveCard(
        targetPlayer,
        this.state,
        this.room.cardLookup,
        ZONES.DECK,
        ZONES.DISCARD,
        card.id,
      );
    }
    this.room.broadcastGameLog(
      `${actingPlayer.name} discards ${count} card(s) from ${targetPlayer.name}'s ${getZoneDisplayName(ZONES.DECK)}.`,
    );
  }
}

module.exports = { DiscardFromDeckCommand };
