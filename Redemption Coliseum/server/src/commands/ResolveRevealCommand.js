const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class ResolveRevealCommand extends BaseCommand {
  execute() {
    this.state.revealedCards.clear();
    this.state.actionTakerId = "";
    logger.info(`[ResolveRevealCommand] Player ${this.client.sessionId} closed reveal dialog.`);
  }
}

module.exports = { ResolveRevealCommand };