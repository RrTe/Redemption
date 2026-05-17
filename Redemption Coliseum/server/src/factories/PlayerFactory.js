const logger = require("../utils/logger");
const { PlayerState } = require("../state/PlayerState");
const { DeckService } = require("../services/DeckService");
const { CardFactory } = require("./CardFactory");
const { ZONES } = require("../../../shared/zones");
const { shuffle } = require("../services/cardService");

class PlayerFactory {
  /**
   * Orchestrates the creation of a new player and their starting cards.
   * @param {import('colyseus').Client} client
   * @param {Map} cardLookup Reference to the room's card lookup map
   * @returns {PlayerState} The fully initialized player state
   */
  static createPlayer(client, cardLookup) {
    const p = new PlayerState();
    const { mainDefs, reserveDefs } = DeckService.resolveDeck(client.userData.deck);

    // Metadata
    p.sessionId = client.sessionId;
    p.name = client.userData.playerName;
    p.deckName = client.userData.deckName;
    p.connected = true;

    // Instantiate cards
    this._initZone(client.sessionId, mainDefs, ZONES.DECK, p, cardLookup, "main");
    this._initZone(client.sessionId, reserveDefs, ZONES.RESERVE, p, cardLookup, "reserve");

    // Initial shuffle
    shuffle(p[ZONES.DECK]);
    shuffle(p[ZONES.RESERVE]);

    logger.info(`[PlayerFactory] Created state for ${p.name} (${client.sessionId})`);
    return p;
  }

  /**
   * @private
   */
  static _initZone(ownerId, defs, zoneName, playerState, cardLookup, idPrefix) {
    defs.forEach((cardData, idx) => {
      const instanceId = `${ownerId}-${idPrefix}${idx}`;
      const card = CardFactory.createCard(cardData, ownerId, instanceId, zoneName);
      
      // Add to player's zone and room's lookup
      playerState[zoneName].push(card);
      cardLookup.set(card.id, card);
    });
  }
}

module.exports = { PlayerFactory };