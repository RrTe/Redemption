const logger = require("../utils/logger");
const { cardDatabase } = require("../data/cardDatabase");
const { shuffle } = require("./cardService");
const { hash, generateCardId } = require("../../../shared/utils");
const { CardRepository } = require("../../../shared/CardRepository.js");

class DeckService {
  /**
   * Initializes the card database with consistent hash IDs.
   */
  static initDatabase() {
    cardDatabase.forEach((c) => {
      if (!c.id) {
        if (typeof generateCardId === "function") {
          c.id = generateCardId(c.ImageFile, c.Set, c.Name);
        } else {
          const key = (c.ImageFile || "") + (c.Set || "") + (c.Name || "");
          c.id = Buffer.from(key).toString("base64");
        }
      }
    });
    CardRepository.initialize(cardDatabase);
    logger.info(`[DeckService] Card database & CardRepository initialized with ${cardDatabase.length} entries.`);
  }

  /**
   * Resolves a requested deck object into card definitions.
   * @param {object} requestedDeck { main: string[], reserve: string[] }
   * @returns {object} { mainDefs: object[], reserveDefs: object[] }
   */
  static resolveDeck(requestedDeck) {
    let mainDefs = [];
    let reserveDefs = [];

    if (requestedDeck?.main?.length > 0) {
      mainDefs = this._lookupCards(requestedDeck.main);
      if (requestedDeck.reserve) {
        reserveDefs = this._lookupCards(requestedDeck.reserve);
      }
    }

    // Fallback: Random Deck if main is empty
    if (mainDefs.length === 0) {
      logger.info("[DeckService] No valid deck provided. Generating random deck.");
      const shuffledDatabase = [...cardDatabase];
      shuffle(shuffledDatabase);
      mainDefs = shuffledDatabase.slice(0, 50);
    }

    return { mainDefs, reserveDefs };
  }

  /**
   * Helper to find card definitions by name or ID.
   * @private
   */
  static _lookupCards(identifiers) {
    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
    const defs = [];
    identifiers.forEach((id) => {
      const cardDef = CardRepository.get(id);
      if (cardDef) {
        defs.push(cardDef);
      } else {
        logger.warn(`[DeckService] Card definition not found for: ${id}`);
      }
    });
    return defs;
  }
}

module.exports = { DeckService };