/**
 * @module shared/CardRepository
 * Centralized O(1) HashMap Card Lookup Repository for client and server.
 */

class CardRepository {
  static idMap = new Map();
  static nameMap = new Map();
  static imageMap = new Map();
  static isInitialized = false;

  /**
   * Initializes or updates the central fast-lookup maps.
   * @param {Array<Object>} cardList Array of card objects
   */
  static initialize(cardList) {
    if (!Array.isArray(cardList)) return;

    this.idMap.clear();
    this.nameMap.clear();
    this.imageMap.clear();

    for (let i = 0; i < cardList.length; i++) {
      const card = cardList[i];
      if (!card) continue;

      if (card.id !== undefined && card.id !== null) {
        this.idMap.set(String(card.id), card);
      }

      if (card.Name) {
        this.nameMap.set(String(card.Name).toLowerCase(), card);
      }

      if (card.ImageFile) {
        this.imageMap.set(String(card.ImageFile), card);
      }
    }

    this.isInitialized = true;
  }

  /**
   * O(1) card retrieval by ID, Name, or ImageFile.
   * @param {String|Number} identifier 
   * @returns {Object|undefined}
   */
  static get(identifier) {
    if (identifier === undefined || identifier === null || identifier === '') return undefined;
    const str = String(identifier);
    return (
      this.idMap.get(str) ||
      this.nameMap.get(str.toLowerCase()) ||
      this.imageMap.get(str)
    );
  }

  /**
   * O(1) card retrieval by ID specifically.
   * @param {String|Number} id 
   * @returns {Object|undefined}
   */
  static getById(id) {
    if (id === undefined || id === null) return undefined;
    return this.idMap.get(String(id));
  }

  /**
   * O(1) card retrieval by Name specifically.
   * @param {String} name 
   * @returns {Object|undefined}
   */
  static getByName(name) {
    if (!name) return undefined;
    return this.nameMap.get(String(name).toLowerCase());
  }

  /**
   * O(1) batch card mapping for an array of card identifiers.
   * @param {Array<String|Number>} identifiers 
   * @returns {Array<Object>}
   */
  static getMany(identifiers) {
    if (!Array.isArray(identifiers)) return [];
    const results = [];
    for (let i = 0; i < identifiers.length; i++) {
      const card = this.get(identifiers[i]);
      if (card) {
        results.push(card);
      }
    }
    return results;
  }
}

export { CardRepository };
