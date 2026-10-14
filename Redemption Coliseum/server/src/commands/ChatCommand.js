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

      if (!targetCard) {
        const { CardRepository } = require("../../../shared/CardRepository");
        const { cardDatabase } = require("../data/cardDatabase");
        const { CardFactory } = require("../factories/CardFactory");
        const { ZONES } = require("../../../shared/zones");

        if (!CardRepository.isInitialized) {
          CardRepository.initialize(cardDatabase);
        }
        let cardDef = CardRepository.get(query);
        if (!cardDef && Array.isArray(cardDatabase)) {
          cardDef = cardDatabase.find((c) => c.Name?.toLowerCase().includes(query.toLowerCase()));
        }
        if (cardDef) {
          const testId = `dev-test-${Date.now()}`;
          const player = this.state.players.get(this.client.sessionId);
          targetCard = CardFactory.createCard(
            cardDef,
            this.client.sessionId,
            testId,
            ZONES.TERRITORY,
            this.client.sessionId
          );
          if (player && player.territory) {
            player.territory.push(targetCard);
          }
          if (this.room.cardLookup) {
            this.room.cardLookup.set(targetCard.id, targetCard);
          }
        }
      }

      if (targetCard) {
        logger.info(`[ChatCommand/DEBUG] Manually enqueuing ${targetCard.Name} (${targetCard.templateId}).`);
        EffectChronicleService.enqueueCards(
          this.room,
          [targetCard],
          this.client.sessionId,
          ActionType.ACTIVATE_ABILITY,
          { autoExecuteSupported: true }
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