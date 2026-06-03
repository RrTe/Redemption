const { BaseCommand } = require("./BaseCommand");
const { moveCard, getZoneDisplayName } = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const logger = require("../utils/logger");

class MoveCardCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) {
      logger.error(
        `[MoveCardCommand] Player not found: ${this.client.sessionId}`,
      );
      return;
    }

    try {
      const result = moveCard(
        player,
        this.state,
        this.room.cardLookup,
        message.from,
        message.to,
        message.cardId ?? message.index ?? 0,
        message.count ?? 1,
        message.coords,
      );

      const movedCards = result.movedCards || [];
      const movedCardId = message.cardId ?? (movedCards[0]?.id || null);

      if (movedCardId) {
        const movedCard = this.room.cardLookup.get(movedCardId);

        // A. DETACH
        if (movedCard && movedCard.attachedTo) {
          movedCard.attachedTo = null;
        }

        // B. CARRY CHILDREN (Leaving field)
        const isLeavingField = [
          "deck",
          "discard",
          "hand",
          "banish",
          "reserve",
        ].includes(message.to);
        if (isLeavingField) {
          for (const otherCard of this.room.cardLookup.values()) {
            if (otherCard.attachedTo === movedCardId) {
              otherCard.attachedTo = null;
              const owner = this.state.players.get(otherCard.originalOwnerId);
              if (owner) {
                moveCard(
                  owner,
                  this.state,
                  this.room.cardLookup,
                  otherCard.zone,
                  message.to,
                  otherCard.id,
                  1,
                  null,
                );
              }
            }
          }
        }

        // C. ATTACH
        if (message.coords && message.coords.attachTo) {
          const targetCard = this.room.cardLookup.get(message.coords.attachTo);
          if (movedCard && targetCard) {
            movedCard.attachedTo = targetCard.id;
          }
        }
      }

      // Events & Logging
      // ✨ FIX: Only trigger draw animation when source is DECK
      if (message.from === ZONES.DECK && movedCards.length > 0) {
        this.client.send("cardsDrawn", {
          cardIds: movedCards.map((c) => c.id),
        });
      }

      // ✨ FIX: Use the descriptive log entry returned by cardService
      if (result.logEntry) {
        this.room.broadcastGameLog(result.logEntry);
      }
    } catch (err) {
      logger.error(`[MoveCardCommand] Error:`, err);
    }
  }
}

module.exports = { MoveCardCommand };
