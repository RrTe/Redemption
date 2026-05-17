const { Card } = require("../state/Card");

class CardFactory {
  /**
   * Creates a new Card instance from database data.
   * @param {object} cardData Data from cardDatabase.
   * @param {string} ownerId Session ID of the original owner.
   * @param {string} instanceId Unique string for the card ID.
   * @param {string} zone Target zone.
   * @param {string} controllerId Optional controller ID (defaults to owner).
   * @returns {Card} The initialized Card instance.
   */
  static createCard(cardData, ownerId, instanceId, zone, controllerId = null) {
    const card = new Card();
    card.id = instanceId;
    card.originalOwnerId = ownerId;
    card.controllerId = controllerId || ownerId;
    card.zone = zone;

    // Map properties from DB, but protect the unique instance ID
    Object.entries(cardData).forEach(([key, value]) => {
      if (key !== "id") {
        card[key] = value;
      }
    });

    return card;
  }
}

module.exports = { CardFactory };