// server/src/commands/ResolveChronicleCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { CHRONICLE_ACTIONS } = require("../../../shared/effectChronicleConstants");
const logger = require("../utils/logger");

/**
 * Handles incoming client requests to resolve, pass, or pass-all items in the Effect Chronicle.
 */
class ResolveChronicleCommand extends BaseCommand {
  execute(message) {
    const { action, itemId } = message || {};

    if (!action) {
      logger.warn(
        `[ResolveChronicleCommand] Missing action from client '${this.client.sessionId}'.`
      );
      return;
    }

    switch (action) {
      case CHRONICLE_ACTIONS.EXECUTE:
        EffectChronicleService.executeItem(this.room, this.client, itemId);
        break;

      case CHRONICLE_ACTIONS.PASS:
        EffectChronicleService.passItem(this.room, this.client, itemId);
        break;

      case CHRONICLE_ACTIONS.PASS_ALL:
        EffectChronicleService.passAllItems(this.room, this.client);
        break;

      default:
        logger.warn(
          `[ResolveChronicleCommand] Unknown action '${action}' from client '${this.client.sessionId}'.`
        );
        break;
    }
  }
}

module.exports = { ResolveChronicleCommand };
