const { BaseCommand } = require("./BaseCommand");
const { getZoneCollection } = require("../services/cardService");
const SearchHelper = require("../utils/SearchHelper");
const logger = require("../utils/logger");

class RequestRevealCardsCommand extends BaseCommand {
  execute(message) {
    const requestingPlayer = this.state.players.get(this.client.sessionId);
    const { zone, targetPlayerId, count, position = "top" } = message;
    const targetOwnerId = targetPlayerId || this.client.sessionId;

    const busyCheck = SearchHelper.isBusy(
      requestingPlayer,
      this.state,
      zone,
      targetOwnerId,
    );
    if (!requestingPlayer || busyCheck.busy) {
      logger.warn(
        `[RequestRevealCardsCommand] ${busyCheck.reason} (${this.client.sessionId})`,
      );
      this.client.send("gameError", { message: busyCheck.reason });
      return;
    }

    const targetPlayer = this.state.players.get(
      targetPlayerId || this.client.sessionId,
    );

    if (!targetPlayer) return;

    const pile = getZoneCollection(targetPlayer, this.state, zone);
    const cardsToReveal = SearchHelper.slicePile(pile, count, position);

    // 1. Public Reveal
    this.state.revealedCards.clear();
    cardsToReveal.forEach((card) =>
      this.state.revealedCards.push(card.clone()),
    );

    SearchHelper.setupContext(requestingPlayer, this.state, {
      zone,
      cards: cardsToReveal,
      isInteractive: false,
      originalOwnerId: targetPlayer.sessionId,
      actionTakerId: this.client.sessionId,
    });

    logger.info(
      `[RequestRevealCardsCommand] ${this.client.sessionId} revealed ${count} from ${zone}`,
    );

    this.client.send("presentPileSearchResult", {
      cards: cardsToReveal.map((c) => c.toJSON()),
      possibleActions: SearchHelper.getPossibleActions(zone),
    });
  }
}

module.exports = { RequestRevealCardsCommand };
