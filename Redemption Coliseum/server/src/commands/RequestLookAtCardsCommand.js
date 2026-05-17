const { BaseCommand } = require("./BaseCommand");
const { getZoneCollection } = require("../services/cardService");
const SearchHelper = require("../utils/SearchHelper");
const logger = require("../utils/logger");

class RequestLookAtCardsCommand extends BaseCommand {
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
        `[RequestLookAtCardsCommand] ${busyCheck.reason} (${this.client.sessionId})`,
      );
      this.client.send("gameError", { message: busyCheck.reason });
      return;
    }

    const targetPlayer = this.state.players.get(
      targetPlayerId || this.client.sessionId,
    );

    if (!targetPlayer) return;

    const pile = getZoneCollection(targetPlayer, this.state, zone);
    if (pile.length === 0) return;

    const cardsToLookAt = SearchHelper.slicePile(pile, count, position);

    SearchHelper.setupContext(requestingPlayer, this.state, {
      zone,
      cards: cardsToLookAt,
      isInteractive: false,
      originalOwnerId: targetPlayer.sessionId,
      actionTakerId: this.client.sessionId,
    });

    logger.info(
      `[RequestLookAtCardsCommand] ${this.client.sessionId} looking at ${count} from ${zone}`,
    );

    this.client.send("presentPileSearchResult", {
      cards: cardsToLookAt.map((c) => c.toJSON()),
      possibleActions: SearchHelper.getPossibleActions(zone),
    });
  }
}

module.exports = { RequestLookAtCardsCommand };
