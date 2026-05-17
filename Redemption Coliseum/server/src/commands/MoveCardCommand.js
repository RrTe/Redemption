const { BaseCommand } = require("./BaseCommand");
const { moveCard } = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const logger = require("../utils/logger");

const isZonePublic = (zone) =>
  [
    ZONES.TERRITORY,
    ZONES.LAND_OF_BONDAGE,
    ZONES.BATTLEFIELD,
    ZONES.DISCARD,
    ZONES.BANISH,
    ZONES.LAND_OF_REDEMPTION,
  ].includes(zone);

class MoveCardCommand extends BaseCommand {
  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) {
      logger.error(`[MoveCardCommand] Player not found: ${this.client.sessionId}`);
      return;
    }

    try {
      const drawnCards = moveCard(
        player,
        this.state,
        this.room.cardLookup,
        message.from,
        message.to,
        message.cardId ?? message.index ?? 0,
        message.count ?? 1,
        message.coords
      );

      const movedCardId = message.cardId ?? (drawnCards && drawnCards[0] ? drawnCards[0].id : null);

      if (movedCardId) {
        const movedCard = this.room.cardLookup.get(movedCardId);

        // A. DETACH
        if (movedCard && movedCard.attachedTo) {
          movedCard.attachedTo = null;
        }

        // B. CARRY CHILDREN (Leaving field)
        const isLeavingField = ["deck", "discard", "hand", "banish", "reserve"].includes(message.to);
        if (isLeavingField) {
          for (const otherCard of this.room.cardLookup.values()) {
            if (otherCard.attachedTo === movedCardId) {
              otherCard.attachedTo = null;
              const owner = this.state.players.get(otherCard.originalOwnerId);
              if (owner) {
                moveCard(owner, this.state, this.room.cardLookup, otherCard.zone, message.to, otherCard.id, 1, null);
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
      if (drawnCards && drawnCards.length > 0) {
        this.client.send("cardsDrawn", { cardIds: drawnCards.map((c) => c.id) });
      }

      this._logMovement(message, drawnCards);
    } catch (err) {
      logger.error(`[MoveCardCommand] Error:`, err);
    }
  }

  _logMovement(message, drawnCards) {
    const actualCard = this.room.cardLookup.get(message.cardId) || (drawnCards && drawnCards[0]);
    const realCardName = actualCard ? actualCard.Name : "Card";
    const fromZone = message.from;
    const toZone = message.to;
    const playerName = this.client.userData.playerName;

    const isSourcePublic = isZonePublic(fromZone);
    const isDestPublic = isZonePublic(toZone);
    const showName = isSourcePublic || isDestPublic;
    const displayName = showName ? realCardName : "a card";

    let logText = "";
    if (fromZone === ZONES.DECK && toZone === ZONES.HAND) {
      logText = `${playerName} draws ${displayName}.`;
    } else if (
      fromZone === ZONES.HAND &&
      (toZone === ZONES.TERRITORY ||
        toZone === ZONES.LAND_OF_BONDAGE ||
        toZone === ZONES.BATTLEFIELD)
    ) {
      logText = `${playerName} plays ${displayName}.`;
    } else if (toZone === ZONES.DISCARD) {
      logText = `${playerName} discards ${displayName} from ${fromZone}.`;
    } else {
      logText = `${playerName} moves ${displayName} from ${fromZone} to ${toZone}.`;
    }
    
    this.room.broadcastGameLog(logText);
  }
}

module.exports = { MoveCardCommand };