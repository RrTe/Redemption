const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class UpdateCardStateCommand extends BaseCommand {
  execute(message) {
    const { cardId, updates } = message;
    if (!cardId || !updates) return;

    const card = this.room.cardLookup.get(cardId);
    if (!card) {
      logger.warn(`[UpdateCardStateCommand] Card ${cardId} not found.`, {
        clientId: this.client.sessionId,
      });
      return;
    }

    // Core logic for state updates
    for (const key in updates) {
      // ✨ FIX: Special handling for Colyseus MapSchema
      if (key === "counters" && typeof updates[key] === "object") {
        for (const counterKey in updates[key]) {
          card.counters.set(counterKey, updates[key][counterKey]);
        }
      } else if (Object.prototype.hasOwnProperty.call(card, key)) {
        // Generic schema property update
        card[key] = updates[key];
      }
    }
    logger.debug(`Card ${card.Name} (${cardId}) updated via Command`, {
      updates,
    });
  }
}

module.exports = { UpdateCardStateCommand };
