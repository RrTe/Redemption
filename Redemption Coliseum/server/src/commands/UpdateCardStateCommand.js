const { BaseCommand } = require("./BaseCommand");
const { generateCardId } = require("../../../shared/utils");
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

    this.cardId = cardId;
    this.cardName = card.Name;
    this.imageFile = card.ImageFile;
    this.set = card.Set;
    this.previousState = {};

    // Core logic for state updates while capturing previous state for undo
    for (const key in updates) {
      if (key === "counters" && typeof updates[key] === "object") {
        this.previousState.counters = {};
        for (const counterKey in updates[key]) {
          this.previousState.counters[counterKey] =
            card.counters.get(counterKey) || 0;
          card.counters.set(counterKey, updates[key][counterKey]);
        }
      } else if (Object.prototype.hasOwnProperty.call(card, key)) {
        this.previousState[key] = card[key];
        card[key] = updates[key];
      }
    }

    this.canUndo = true;
    logger.debug(`Card ${card.Name} (${cardId}) updated via Command`, {
      updates,
    });
  }

  undo() {
    if (!this.cardId || !this.previousState) return;
    const card = this.room.cardLookup.get(this.cardId);
    if (!card) return;

    for (const key in this.previousState) {
      if (key === "counters" && typeof this.previousState[key] === "object") {
        for (const counterKey in this.previousState[key]) {
          card.counters.set(counterKey, this.previousState[key][counterKey]);
        }
      } else {
        card[key] = this.previousState[key];
      }
    }

    const player = this.state.players.get(this.client.sessionId);
    const templateId = generateCardId(this.imageFile, this.set, this.cardName);
    const logMsg = `[UNDO] ${player ? player.name : "Player"} reverted state of {{${templateId}|${this.cardName}}}.`;
    this.room.broadcastGameLog(logMsg);
  }
}

module.exports = { UpdateCardStateCommand };
