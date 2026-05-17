const { BaseCommand } = require("./BaseCommand");
const { ZONES } = require("../../../shared/zones");
const {
  getZoneCollection,
  moveCard,
  shuffle,
} = require("../services/cardService");
const SearchHelper = require("../utils/SearchHelper");
const logger = require("../utils/logger");

class ResolveSearchPileCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player || player.status !== "searching") {
      logger.warn(`[ResolveSearchPileCommand] Player not in searching state.`);
      return;
    }

    const { selectedCardIds, toZone, coords } = message;
    const context = player.searchContext;
    const fromZone = context.zone;
    const originalOwnerId = context.originalOwnerId;
    const wasInteractive = context.isInteractive;
    const originalOwner = this.state.players.get(originalOwnerId);

    if (!originalOwner) {
      logger.error(
        `[ResolveSearchPileCommand] Original owner ${originalOwnerId} not found.`,
      );
      SearchHelper.resetContext(player, this.state);
      return;
    }

    // Validate card selection against context
    const validSelectedCards = selectedCardIds.filter((id) =>
      player.searchContext.cards.some((c) => c.id === id),
    );

    if (validSelectedCards.length !== selectedCardIds.length) {
      logger.error(`[ResolveSearchPileCommand] Invalid card selection.`);
      SearchHelper.resetContext(player, this.state);
      return;
    }

    // Perform moves via cardService
    for (const cardId of validSelectedCards) {
      moveCard(
        originalOwner,
        this.state,
        this.room.cardLookup,
        fromZone,
        toZone,
        cardId,
        1,
        coords,
      );
    }

    // Optional: Shuffle deck after interactive search
    if (fromZone === ZONES.DECK && wasInteractive) {
      const deckToShuffle = getZoneCollection(
        originalOwner,
        this.state,
        ZONES.DECK,
      );
      shuffle(deckToShuffle);
      this.room.broadcast("pileShuffled", {
        zone: ZONES.DECK,
        playerId: originalOwnerId,
      });
      this.room.broadcastGameLog(`${originalOwner.name}'s deck was shuffled.`);
    }

    // Log für Auswahl aus Dialog
    if (selectedCardIds && selectedCardIds.length > 0) {
      const cardNames = selectedCardIds.map((id) => {
        const c = this.room.cardLookup.get(id);
        return c ? c.Name : "Unknown";
      });
      this.room.broadcastGameLog(
        `${this.client.userData.playerName} selected ${cardNames.join(", ")} from ${fromZone} and moved to ${toZone}.`,
      );
    }

    SearchHelper.resetContext(player, this.state);
    this.state.revealedCards.clear();
  }
}

module.exports = { ResolveSearchPileCommand };
