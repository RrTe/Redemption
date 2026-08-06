const { BaseCommand } = require("./BaseCommand");
const { CardFactory } = require("../factories/CardFactory");
const { ZONES } = require("../../../shared/zones");
const { cardDatabase } = require("../data/cardDatabase");
const { CardRepository } = require("../../../shared/CardRepository.js");
const logger = require("../utils/logger");

class CreateTokenCommand extends BaseCommand {
  execute(message) {
    const { cardId, zone, ownerId } = message;
    const targetPlayerId = ownerId || this.client.sessionId;
    const player = this.state.players.get(targetPlayerId);
    
    if (!player) return;

    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
    const cardDef = CardRepository.get(cardId);
    if (!cardDef) {
      logger.warn(`[CreateTokenCommand] Card definition not found for: ${cardId}`);
      return;
    }

    const tokenId = `${this.client.sessionId}-token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const card = CardFactory.createCard(cardDef, targetPlayerId, tokenId, zone || ZONES.TERRITORY, this.client.sessionId);
    card.isToken = true; // ✨ Kennzeichnet die Karte als Token für die Auflösungs-Logik

    player[card.zone].push(card);
    this.room.cardLookup.set(card.id, card);
    this.room.broadcastGameLog(`${this.client.userData.playerName} created token {{${cardDef.id}|${card.Name}}}.`);
  }
}

module.exports = { CreateTokenCommand };