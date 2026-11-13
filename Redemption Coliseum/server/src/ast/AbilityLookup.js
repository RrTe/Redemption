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
    const isStarCard = Boolean(
      options.isStarCard ||
      (options.card && options.card.IsStarCard) ||
      this.isStarCardTemplate(templateId)
    );
    const isDual = Boolean(sides.top && sides.bottom);

    // Dedicated Star Phase resolution: only execute shared / star abilities
    if (actionType === ActionType.ACTIVATE_STAR_ABILITY) {
      const starAbilities = [];
      if (isDual && sides.shared && Array.isArray(sides.shared.abilities)) {
        starAbilities.push(
          ...sides.shared.abilities.filter((a) =>
            this.isStarAbility(a, { isStarCard })
          )
        );
      }
      const targetSide = isDual ? this._determineActiveSide(sides, options) : AST_CARD_SIDES.TOP;
      if (sides[targetSide] && Array.isArray(sides[targetSide].abilities)) {
        starAbilities.push(
          ...sides[targetSide].abilities.filter((a) =>
            this.isStarAbility(a, { isStarCard })
          )
        );
      }
      if (starAbilities.length > 0) {
        return this._expandMultiPileAbilities(starAbilities);
      }
      // Fallback for un-migrated single-sided or shared cards
      const fallbackStars = (!isDual && sides.top?.abilities)
        ? sides.top.abilities.filter((a) => this.isStarAbility(a))
        : (sides.shared?.abilities || []);
      return this._expandMultiPileAbilities(fallbackStars);
    }

    const abilities = [];

    // Add universally shared abilities for dual cards (excluding star abilities)
    if (isDual && sides.shared && Array.isArray(sides.shared.abilities)) {
      abilities.push(
        ...sides.shared.abilities.filter(
          (a) => !this.isStarAbility(a, { isStarCard })
        )
      );
    }

    // Determine active side: single-sided cards strictly use sides.top
    const targetSide = isDual ? this._determineActiveSide(sides, options) : AST_CARD_SIDES.TOP;
    if (sides[targetSide] && Array.isArray(sides[targetSide].abilities)) {
      abilities.push(
        ...sides[targetSide].abilities.filter(
          (a) => !this.isStarAbility(a, { isStarCard })
        )
      );
    } else if (!isDual && !sides.top && sides.shared && Array.isArray(sides.shared.abilities)) {
      // Graceful fallback for unmigrated single-sided cards possessing only sides.shared
      abilities.push(
        ...sides.shared.abilities.filter(
          (a) => !this.isStarAbility(a, { isStarCard })
        )
      );
    }

    return this._expandMultiPileAbilities(abilities);
  }

  /**
   * Expands any single-effect ability whose target scope consists exclusively of
   * multiple pile zones (e.g. ["discard_pile", "reserve_pile"] or ["deck", "reserve_pile"])
   * into distinct per-pile choice abilities sharing a choice_group, so that multi-pile
   * abilities (such as Samuel, the Anointer) present clean per-pile choice buttons
   * with individual viability pre-validation.
   *
   * @param {Array<object>} abilities Raw resolved AST abilities.
   * @returns {Array<object>} Expanded AST abilities.
   * @private
   */
  static _expandMultiPileAbilities(abilities) {
    if (!Array.isArray(abilities) || abilities.length === 0) return [];
    const PILE_SCOPES = new Set([
      "deck",
      "discard_pile",
      "discard",
      "reserve_pile",
      "reserve",
      "banish_pile",
      "banish",
      "artifact_pile",
      "artifact",
    ]);

    const expanded = [];
    for (const ability of abilities) {
      const effects = ability?.effects;
      const firstEffect = Array.isArray(effects) && effects.length === 1 ? effects[0] : null;
      const scopes = firstEffect?.target?.scope;

      if (
        firstEffect &&
        Array.isArray(scopes) &&
        scopes.length > 1 &&
        scopes.every((s) => PILE_SCOPES.has(String(s).toLowerCase()))
      ) {
        const choiceGroupId = ability.choice_group || `${ability.ability_id}_pile_choice`;
        for (const singleScope of scopes) {
          expanded.push({
            ...ability,
            ability_id: `${ability.ability_id}__scope_${singleScope}`,
            parent_ability_id: ability.ability_id,
            choice_group: choiceGroupId,
            effects: [
              {
                ...firstEffect,
                target: {
                  ...firstEffect.target,
                  scope: [singleScope],
                },
              },
            ],
          });
        }
      } else {
        expanded.push(ability);
      }
    }
    return expanded;
  }

  /**
   * Identifies whether an ability is a Star ability.
   * Star abilities are designated to trigger exclusively during the Star Phase (or starting draw).
   *
   * @param {object} ability AST ability node.
   * @param {object} [context] Context options (e.g. isStarCard).
   * @returns {boolean} True if the ability is a Star ability.
   */
  static isStarAbility(ability, _context = {}) {
    if (!ability) return false;
    if (ability.is_star === true || ability.isStar === true) return true;
    const event = (ability.trigger_event || "").toLowerCase();
    if (event === "star_phase" || event.includes("star")) return true;
    const id = (ability.ability_id || "").toLowerCase();
    if (id.includes("star")) return true;
    return false;
  }

  /**
   * Checks whether a template ID belongs to a Star card in the catalog.
   *
   * @param {string} templateId Card catalog ID.
   * @returns {boolean} True if card is a Star card.
   */
  static isStarCardTemplate(templateId) {
    if (!templateId) return false;
    try {
      const { CardRepository } = require("../../../shared/CardRepository");
      if (CardRepository) {
        if (!CardRepository.isInitialized) {
          const { cardDatabase } = require("../data/cardDatabase");
          CardRepository.initialize(cardDatabase);
        }
        const def = CardRepository.getById(templateId);
        if (def && (def.IsStarCard || (def.Class && def.Class.includes("Star")))) {
          return true;
        }
      }
    } catch (_e) {
      // Graceful fallback if CardRepository or database is unavailable
    }
    return false;
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
