// server/src/ast/AbilityLookup.js
const path = require("path");
const fs = require("fs");
const { ActionType } = require("../../../shared/actions");
const { AST_CARD_SIDES } = require("../../../shared/astConstants");
const logger = require("../utils/logger");

/**
 * Singleton service for loading, caching, and querying card AST logic.
 * Provides O(1) in-memory retrieval of card ability data by templateId.
 */
class AbilityLookup {
  /** @type {Record<string, object> | null} */
  static _cardsLogic = null;

  /**
   * Initializes or retrieves the in-memory cards logic cache.
   *
   * @returns {Record<string, object>} The indexed cards logic dictionary.
   */
  static _loadData() {
    if (!this._cardsLogic) {
      try {
        const filePath = path.join(__dirname, "../../../shared/cards_logic.json");
        const raw = fs.readFileSync(filePath, "utf-8");
        this._cardsLogic = JSON.parse(raw);
        logger.info("[AbilityLookup] cards_logic.json loaded successfully.");
      } catch (err) {
        logger.error("[AbilityLookup] Failed to load cards_logic.json:", err);
        this._cardsLogic = {};
      }
    }
    return this._cardsLogic;
  }

  /**
   * Checks whether AST logic exists for a given template ID.
   *
   * @param {string} templateId Authoritative catalog template ID.
   * @returns {boolean} True if card logic exists in cache.
   */
  static hasLogic(templateId) {
    if (!templateId) return false;
    const data = this._loadData();
    return Boolean(data[templateId]);
  }

  /**
   * Retrieves raw AST card logic by authoritative template ID.
   *
   * @param {string} templateId Authoritative catalog template ID.
   * @returns {object | null} Card AST object or null if not found.
   */
  static getCardLogic(templateId) {
    if (!templateId) return null;
    const data = this._loadData();
    return data[templateId] || null;
  }

  /**
   * Resolves abilities for a card based on action type and active card side.
   *
   * @param {string} templateId Authoritative catalog template ID.
   * @param {object} [options] Context options for side and action discrimination.
   * @param {string} [options.actionType] Colyseus action type (e.g. ACTIVATE_STAR_ABILITY).
   * @param {string} [options.activeSide] Preferred side ('top', 'bottom', or 'shared').
   * @param {string} [options.inGameType] Current card in-game type.
   * @param {string} [options.inGameAlignment] Current card in-game alignment.
   * @returns {Array<object>} List of matching AST ability objects.
   */
  static resolveAbilities(templateId, options = {}) {
    const cardData = this.getCardLogic(templateId);
    if (!cardData || !cardData.sides) {
      return [];
    }

    const { sides } = cardData;
    const actionType = options.actionType || "";

    // Dedicated Star Phase resolution: only execute shared / star abilities
    if (actionType === ActionType.ACTIVATE_STAR_ABILITY) {
      if (sides.shared && Array.isArray(sides.shared.abilities)) {
        return sides.shared.abilities;
      }
      return [];
    }

    const abilities = [];

    // Add universally shared abilities
    if (sides.shared && Array.isArray(sides.shared.abilities)) {
      abilities.push(...sides.shared.abilities);
    }

    // Determine active side: explicit side or matching inGame alignment/type
    const targetSide = this._determineActiveSide(sides, options);
    if (sides[targetSide] && Array.isArray(sides[targetSide].abilities)) {
      abilities.push(...sides[targetSide].abilities);
    }

    return abilities;
  }

  /**
   * Determines active card side based on options and available sides.
   *
   * @param {object} sides Available sides in card logic.
   * @param {object} options Context options.
   * @returns {string} The active side name ('top' or 'bottom').
   * @private
   */
  static _determineActiveSide(sides, options) {
    if (options.activeSide && sides[options.activeSide]) {
      return options.activeSide;
    }
    if (options.inGameAlignment && sides.bottom) {
      // Dual-alignment cards: inspect alignment match if bottom exists
      const bottomAlignment = sides.bottom.alignment || "";
      if (bottomAlignment.toLowerCase() === options.inGameAlignment.toLowerCase()) {
        return AST_CARD_SIDES.BOTTOM;
      }
    }
    return AST_CARD_SIDES.TOP;
  }
}

module.exports = { AbilityLookup };
