// server/src/commands/ChatCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ActionType } = require("../../../shared/actions");
const logger = require("../utils/logger");

class ChatCommand extends BaseCommand {
  execute(message) {
    const text = message?.text || "";

    // DEV-ONLY: DEBUG CHRONICLE TESTING HOOK (Strictly disabled in production)
    if (process.env.NODE_ENV !== "production" && text.startsWith("/test ")) {
      const query = text.replace("/test ", "").trim();
      let targetCard = null;

      // Locate card by ID, templateId, or name substring in room
      for (const card of (this.room.cardLookup?.values() || [])) {
        if (
          card.id === query ||
          card.templateId === query ||
          card.Name?.toLowerCase().includes(query.toLowerCase())
        ) {
          targetCard = card;
          break;
        }
      }

      if (targetCard) {
        logger.info(`[ChatCommand/DEBUG] Manually enqueuing ${targetCard.Name} (${targetCard.templateId}).`);
        EffectChronicleService.enqueueCards(
          this.room,
          [targetCard],
          this.client.sessionId,
          ActionType.ACTIVATE_ABILITY
        );
        this.room.broadcastGameLog(`[DEV] Enqueued ${targetCard.Name} into Effect Chronicle.`);
        return;
      }
    }

    const msg = {
      type: "chat",
      sender: this.client.userData?.playerName || "Player",
      text,
      sessionId: this.client.sessionId,
    };
    this.room.chatHistory.push(msg);
    this.room.broadcast("chat", msg);
  }
}

module.exports = { ChatCommand };