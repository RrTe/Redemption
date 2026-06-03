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

    const { selectedCards, toZone, coords, remainingPositions } = message;
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
    const validSelectedCards = selectedCards.filter((s) =>
      player.searchContext.cards.some((c) => c.id === s.id),
    );

    if (validSelectedCards.length !== selectedCards.length) {
      logger.error(`[ResolveSearchPileCommand] Invalid card selection.`);
      SearchHelper.resetContext(player, this.state);
      return;
    }

    // Perform moves via cardService
    for (const selection of validSelectedCards) {
      // ✨ FIX: Check if card is still in the fromZone before moving.
      const cardInstance = this.room.cardLookup.get(selection.id);
      if (!cardInstance || cardInstance.zone !== fromZone) {
        logger.warn(
          `[ResolveSearchPileCommand] Skipping card ${selection.id}: Not in zone ${fromZone} (actually in ${cardInstance?.zone})`,
        );
        continue;
      }

      moveCard(
        player, // ✨ FIX: The player performing the resolution is the acting player
        this.state,
        this.room.cardLookup,
        fromZone,
        toZone,
        selection.id,
        1,
        { ...coords, position: selection.position },
      );
    }

    // ✨ NEU: Verarbeite verbleibende/nicht-ausgewählte Karten für Look oder Reveal (wenn fromZone das Deck ist)
    const activeRemaining = remainingPositions || [];
    if (
      fromZone === ZONES.DECK &&
      !wasInteractive &&
      activeRemaining.length > 0
    ) {
      const positionMap = new Map(
        activeRemaining.map((cp) => [cp.id, cp.position]),
      );

      // Wir holen alle Karten aus dem Kontext, die NICHT ausgewählt wurden
      const unselectedCards = context.cards.filter(
        (c) => !validSelectedCards.some((s) => s.id === c.id),
      );

      // Zuerst "bottom" Karten ans Ende des Decks verschieben
      const bottomCards = unselectedCards.filter(
        (c) => positionMap.get(c.id) === "bottom",
      );
      for (const card of bottomCards) {
        // ✨ FIX: Only move back if still perceived as being in deck-look context
        if (card.zone !== fromZone) continue;

        moveCard(
          originalOwner,
          this.state,
          this.room.cardLookup,
          fromZone,
          fromZone,
          card.id,
          1,
          { position: "bottom" },
        );
      }

      // Dann "top" Karten in umgekehrter Reihenfolge wieder an den Anfang schieben
      const topCards = unselectedCards.filter(
        (c) => positionMap.get(c.id) !== "bottom",
      );
      for (const card of [...topCards].reverse()) {
        if (card.zone !== fromZone) continue;

        moveCard(
          originalOwner,
          this.state,
          this.room.cardLookup,
          fromZone,
          fromZone,
          card.id,
          1,
          { position: "top" },
        );
      }
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
    if (validSelectedCards && validSelectedCards.length > 0) {
      const cardNames = validSelectedCards.map((s) => {
        const c = this.room.cardLookup.get(s.id);
        return c ? c.Name : "Unknown";
      });
      this.room.broadcastGameLog(
        `${this.client.userData.playerName} selected ${cardNames.join(", ")} from ${fromZone} and moved to ${toZone}.`,
      );
    }

    // ✨ FIX: Stapel-Sperre aufheben! Entferne alle Einträge dieses Spielers aus activeActionPiles
    for (let [pileKey, sessionId] of this.state.activeActionPiles.entries()) {
      if (sessionId === this.client.sessionId) {
        this.state.activeActionPiles.delete(pileKey);
      }
    }

    SearchHelper.resetContext(player, this.state);
    this.state.revealedCards.clear();
  }
}

module.exports = { ResolveSearchPileCommand };
