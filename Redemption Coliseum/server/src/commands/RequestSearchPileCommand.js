const { BaseCommand } = require("./BaseCommand");
const {
  getZoneCollection,
  getZoneDisplayName,
} = require("../services/cardService");
const SearchHelper = require("../utils/SearchHelper");
const logger = require("../utils/logger");

class RequestSearchPileCommand extends BaseCommand {
  execute(message) {
    const requestingPlayer = this.state.players.get(this.client.sessionId);
    const { zone, targetPlayerId } = message;

    // ✨ WICHTIG: targetOwnerId muss absolut eindeutig sein
    const targetOwnerId = targetPlayerId || this.client.sessionId;

    const busyCheck = SearchHelper.isBusy(
      requestingPlayer,
      this.state,
      zone,
      targetOwnerId,
    );
    if (!requestingPlayer || busyCheck.busy) {
      logger.warn(
        `[RequestSearchPileCommand] ${busyCheck.reason} (${this.client.sessionId})`,
      );
      this.client.send("gameError", { message: busyCheck.reason });
      return;
    }

    const targetPlayer = this.state.players.get(targetOwnerId);

    if (!targetPlayer) {
      logger.warn(
        `[RequestSearchPileCommand] Target player ${targetOwnerId} not found.`,
      );
      return;
    }

    const pileToSearch = getZoneCollection(targetPlayer, this.state, zone);

    if (pileToSearch.length === 0) {
      logger.info(`[RequestSearchPileCommand] Pile ${zone} is empty.`);
      return;
    }

    SearchHelper.setupContext(requestingPlayer, this.state, {
      zone,
      cards: pileToSearch,
      isInteractive: true,
      originalOwnerId: targetPlayer.sessionId,
      actionTakerId: this.client.sessionId,
    });

    const isOpponent = targetPlayer.sessionId !== this.client.sessionId;
    const zoneName = getZoneDisplayName(zone, isOpponent);
    this.room.broadcastGameLog(
      `${this.client.userData.playerName} is searching ${zoneName}.`,
    );

    // Send result to the requesting client
    this.client.send("presentPileSearchResult", {
      cards: Array.from(pileToSearch).map((c) => c.toJSON()),
      zone: zone,
      actionType: "search",
      possibleActions: SearchHelper.getPossibleActions(zone),
    });
  }
}

module.exports = { RequestSearchPileCommand };
