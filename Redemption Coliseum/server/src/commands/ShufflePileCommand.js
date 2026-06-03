const { BaseCommand } = require("./BaseCommand");
const { shuffle, getZoneDisplayName } = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const logger = require("../utils/logger");

class ShufflePileCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    const zone = message.zone;

    if (player && (zone === "deck" || zone === "reserve")) {
      const pile = player[zone];
      if (pile && pile.length > 1) {
        shuffle(pile);
        this.room.broadcast("pileShuffled", {
          zone: zone,
          playerId: this.client.sessionId,
        });
        this.room.broadcastGameLog(
          `${this.client.userData.playerName} shuffled their ${getZoneDisplayName(zone)}.`,
        );
      }
    }
  }
}

module.exports = { ShufflePileCommand };
