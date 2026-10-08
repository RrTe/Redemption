/**
 * @module shared/CardRepository
 * Centralized O(1) HashMap Card Lookup Repository for client and server.
 */

const LEGACY_DUALS = {
  "Abram/Abraham": ["Abram", "Abraham"],
  "Saul/Paul": ["Saul", "Paul"],
  "Banks of the Nile/Pharaoh's Court": ["Banks of the Nile", "Pharaoh's Court"],
  "Magicians' Staves/Magicians' Snakes": ["Magicians' Staves", "Magicians' Snakes"],
};

/**
 * Splits a dual card name into top and bottom side names matching the pipeline logic.
 * Directly ported from Python pipeline (scripts/03_extend_cards.py:split_flip_name).
 *
 * @param {string} name Raw card name string.
 * @returns {[string, string]|null} Tuple of [top_name, bottom_name] or null.
 */
function splitFlipName(name) {
  if (!name || typeof name !== "string" || name.startsWith("Lost Soul")) {
    return null;
  }
  if (LEGACY_DUALS[name]) {
    return LEGACY_DUALS[name];
  }

  // Strip parentheses and brackets when verifying slash delimiter to ignore parenthesized slashes
  const base = name.replace(/[([][^)\]]*[)\]]/g, "").trim();
  const suffixMatch = name.match(/\s*(\([^)]+\)|\[[^\]]+\])$/);
  const suffix = suffixMatch ? suffixMatch[1].trim() : "";

  if (LEGACY_DUALS[base]) {
    const legacy = LEGACY_DUALS[base];
    return [`${legacy[0]} ${suffix}`.trim(), `${legacy[1]} ${suffix}`.trim()];
  }

  if (!base.includes(" / ")) {
    return null;
  }

  const cleanFull = suffixMatch ? name.substring(0, suffixMatch.index).trim() : name.trim();
  const parts = cleanFull.split(" / ").map((p) => p.trim());

  if (parts.length === 2) {
    const top = `${parts[0]} ${suffix}`.trim();
    const bot = `${parts[1]} ${suffix}`.trim();
    return [top, bot];
  }

  return null;
}

/**
 * Determines whether a card is genuinely dual-sided (flip or dual-alignment).
 * Directly ported from Python pipeline (scripts/03_extend_cards.py:is_dual_sided).
 *
 * @param {object|string} cardOrName Raw card object or name string.
 * @returns {boolean}
 */
function isDualSided(cardOrName) {
  if (!cardOrName) return false;
  if (typeof cardOrName === "object") {
    if (Array.isArray(cardOrName.sides) && cardOrName.sides.length > 1) return true;
    if (cardOrName.CardSides && cardOrName.CardSides.bottom) return true;
  }
  const name = typeof cardOrName === "string" ? cardOrName : (cardOrName.Name || "");
  if (!name || name.startsWith("Lost Soul")) return false;
  if (LEGACY_DUALS[name]) return true;

  const baseName = name.replace(/[([][^)\]]*[)\]]/g, "").trim();
  return baseName.includes("/") && !name.startsWith("Lost Soul");
}

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

      // Index individual side names and slash combinations for multi-sided cards
      if (Array.isArray(card.sides) && card.sides.length > 0) {
        for (let s = 0; s < card.sides.length; s++) {
          const side = card.sides[s];
          if (side && side.Name) {
            this.nameMap.set(String(side.Name).toLowerCase(), card);
          }
        }

        if (card.sides.length > 1 && card.sides[0]?.Name && card.sides[1]?.Name) {
          const side1 = String(card.sides[0].Name);
          const side2 = String(card.sides[1].Name);

          this.nameMap.set(`${side1} / ${side2}`.toLowerCase(), card);
          this.nameMap.set(`${side1} // ${side2}`.toLowerCase(), card);

          const setMatch = side1.match(/\s*(\([^)]+\)|\[[^\]]+\])$/);
          if (setMatch) {
            const side1Clean = side1.substring(0, setMatch.index).trim();
            this.nameMap.set(`${side1Clean} / ${side2}`.toLowerCase(), card);
            this.nameMap.set(`${side1Clean} // ${side2}`.toLowerCase(), card);
          }
        }
      }

      if (card.ImageFile) {
        this.imageMap.set(String(card.ImageFile), card);
      }
    }

    this.isInitialized = true;
  }

  /**
   * O(1) card retrieval by ID, Name, or ImageFile.
   * Also resolves dual-sided cards via pipeline split logic.
   * @param {String|Number} identifier 
   * @returns {Object|undefined}
   */
  static get(identifier) {
    if (identifier === undefined || identifier === null || identifier === "") return undefined;
    const str = String(identifier).trim();
    const result = (
      this.idMap.get(str) ||
      this.nameMap.get(str.toLowerCase()) ||
      this.imageMap.get(str)
    );
    if (result) return result;

    const split = splitFlipName(str);
    if (split) {
      const [topName, botName] = split;
      const topMatch = this.nameMap.get(topName.toLowerCase());
      if (topMatch) return topMatch;
      const botMatch = this.nameMap.get(botName.toLowerCase());
      if (botMatch) return botMatch;
    }

    return undefined;
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CardRepository,
    splitFlipName,
    isDualSided,
    LEGACY_DUALS,
  };
}

export { CardRepository, splitFlipName, isDualSided, LEGACY_DUALS };
