const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class UpdateRevealSelectionCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player || this.state.actionTakerId !== this.client.sessionId) {
      logger.warn(
        `[UpdateRevealSelectionCommand] Unauthorized or invalid selection update from ${this.client.sessionId}`,
      );
      return;
    }

    const { selectedCardIds } = message;
    if (!Array.isArray(selectedCardIds)) {
      return;
    }

    this.state.revealedSelectedCardIds.clear();
    selectedCardIds.forEach((id) => {
      if (typeof id === "string" && id.length > 0) {
        this.state.revealedSelectedCardIds.push(id);
      }
    });

    logger.debug(
      `[UpdateRevealSelectionCommand] Updated revealed selection for ${this.client.sessionId}: ${selectedCardIds.join(", ")}`,
    );
  }
}

module.exports = { UpdateRevealSelectionCommand };
