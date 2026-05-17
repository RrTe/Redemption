const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class ChangeRedeemedSoulsCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    const amount = Number(message.amount);
    if (isNaN(amount)) {
      logger.warn("[ChangeRedeemedSoulsCommand] Invalid amount", {
        clientId: this.client.sessionId,
        message,
      });
      return;
    }

    // Update souls logic moved here from service
    player.redeemedSouls += amount;
    if (player.redeemedSouls < 0) player.redeemedSouls = 0;

    logger.debug(
      `[ChangeRedeemedSoulsCommand] Player ${this.client.sessionId} changed redeemedSouls by ${amount}. New total: ${player.redeemedSouls}`,
    );

    // Check win condition (5 souls - standard Redemption rule is 7, but keeping your 5 for now)
    if (player.redeemedSouls >= 5) {
      const opponentId = Array.from(this.state.players.keys()).find(
        (id) => id !== this.client.sessionId,
      );
      this.room._endGame(this.client.sessionId, opponentId, "souls");
    }
  }
}

module.exports = { ChangeRedeemedSoulsCommand };
