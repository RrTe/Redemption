const { BaseCommand } = require("./BaseCommand");
const { moveCard } = require("../services/cardService");
const SearchHelper = require("../utils/SearchHelper");
const logger = require("../utils/logger");

class ResolveRevealCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) {
      logger.warn(
        `[ResolveRevealCommand] Player not found: ${this.client.sessionId}`,
      );
      return;
    }

    // cardPositions: [{ id, position: "top" | "bottom" }] — sent by the client dialog.
    // If a card is missing from the list, it defaults to "top".
    const cardPositions = message?.cardPositions ?? [];
    const positionMap = new Map(
      cardPositions.map((cp) => [cp.id, cp.position]),
    );

    const context = player.searchContext;
    if (!context || !context.cards) {
      logger.warn(
        `[ResolveRevealCommand] No search context found for ${this.client.sessionId}`,
      );
      this._cleanup(player);
      return;
    }

    const originalOwner = this.state.players.get(context.originalOwnerId);
    if (!originalOwner) {
      logger.warn(
        `[ResolveRevealCommand] Original owner ${context.originalOwnerId} not found.`,
      );
      this._cleanup(player);
      return;
    }

    // Move each revealed card back into the deck at the chosen position.
    // We process "bottom" cards first so that the top-card order is preserved:
    // bottom-bound cards go to the end, top-bound cards get unshifted to the front.
    const bottomCards = context.cards.filter(
      (c) => positionMap.get(c.id) === "bottom",
    );
    const topCards = context.cards.filter(
      (c) => positionMap.get(c.id) !== "bottom",
    );

    // First, put "bottom" cards back (push to end of array)
    for (const card of bottomCards) {
      moveCard(
        originalOwner,
        this.state,
        this.room.cardLookup,
        context.zone,
        context.zone, // from deck back to deck
        card.id,
        1,
        { position: "bottom" },
      );
    }

    // Then, put "top" cards back in reverse order so the original order is maintained at the top
    for (const card of [...topCards].reverse()) {
      moveCard(
        originalOwner,
        this.state,
        this.room.cardLookup,
        context.zone,
        context.zone, // from deck back to deck
        card.id,
        1,
        { position: "top" },
      );
    }

    // Log placement counts to GameLog
    this.room.broadcastGameLog(
      `${player.name} placed ${topCards.length} card(s) on top and ${bottomCards.length} card(s) at the bottom of the deck.`,
    );

    // ✨ SYNC FIX: Refresh Deck view on client
    this.client.send("pileUpdated", { zone: context.zone });

    logger.info(
      `[ResolveRevealCommand] ${this.client.sessionId} resolved reveal: ` +
        `${topCards.length} top, ${bottomCards.length} bottom.`,
    );

    this._cleanup(player);
  }

  /** Clears the action lock, revealed-cards list, and search context. */
  _cleanup(player) {
    // Clear the public revealed-cards array.
    this.state.revealedCards.clear();
    this.state.revealedSelectedCardIds.clear();

    // Remove pile lock for this player.
    for (const [pileKey, sessionId] of this.state.activeActionPiles.entries()) {
      if (sessionId === this.client.sessionId) {
        this.state.activeActionPiles.delete(pileKey);
      }
    }

    this.state.actionTakerId = "";

    // Reset the search context so the player is no longer "searching".
    SearchHelper.resetContext(player, this.state);
    this.room.broadcast("revealedCardsCleared", {});
  }
}

module.exports = { ResolveRevealCommand };
