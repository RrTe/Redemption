const { BaseCommand } = require("./BaseCommand");
const { CardFactory } = require("../factories/CardFactory");
const { ZONES } = require("../../../shared/zones");
const { cardDatabase } = require("../data/cardDatabase");
const logger = require("../utils/logger");

class CreateTokenCommand extends BaseCommand {
  execute(message) {
    const { cardId, zone, ownerId } = message;
    const targetPlayerId = ownerId || this.client.sessionId;
    const player = this.state.players.get(targetPlayerId);
    
    if (!player) return;

    const cardDef = cardDatabase.find((c) => c.Name === cardId);
    if (!cardDef) {
      logger.warn(`[CreateTokenCommand] Card definition not found for: ${cardId}`);
      return;
    }

    const tokenId = `${this.client.sessionId}-token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const card = CardFactory.createCard(cardDef, targetPlayerId, tokenId, zone || ZONES.TERRITORY, this.client.sessionId);

    player[card.zone].push(card);
    this.room.cardLookup.set(card.id, card);
    this.room.broadcastGameLog(`${this.client.userData.playerName} created token ${card.Name}.`);
  }
}

module.exports = { CreateTokenCommand };