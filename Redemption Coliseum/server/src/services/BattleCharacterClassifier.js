// server/src/services/BattleCharacterClassifier.js
const { ActionType } = require("../../../shared/actions");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { CARD_TYPES, ALIGNMENTS } = require("../../../shared/card-constants");

/**
 * Helper utility for classifying battle character types and filtering battle entrance abilities.
 */
class BattleCharacterClassifier {
  /**
   * Helper to normalize type or alignment values to lowercase string.
   *
   * @param {string|string[]} val Raw field value.
   * @returns {string} Lowercase string.
   */
  static _normalize(val) {
    if (Array.isArray(val)) return val.join(" ").toLowerCase();
    return typeof val === "string" ? val.toLowerCase() : "";
  }

  /**
   * Determines if a card is a Good Enhancement.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if card is a Good Enhancement.
   */
  static isGoodEnhancement(card) {
    if (!card) return false;
    const inGameType = this._normalize(card.inGameType || card.Type);
    const inGameAlign = this._normalize(card.inGameAlignment || card.Alignment);

    if (inGameType.includes("good enhancement") || inGameType === CARD_TYPES.GE.toLowerCase()) {
      return true;
    }
    if (inGameAlign === ALIGNMENTS.GOOD.toLowerCase() && (card.IsEnhancement || inGameType.includes("enhancement"))) {
      return true;
    }
    return false;
  }

  /**
   * Determines if a card is an Evil Enhancement.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if card is an Evil Enhancement.
   */
  static isEvilEnhancement(card) {
    if (!card) return false;
    const inGameType = this._normalize(card.inGameType || card.Type);
    const inGameAlign = this._normalize(card.inGameAlignment || card.Alignment);

    if (inGameType.includes("evil enhancement") || inGameType === CARD_TYPES.EE.toLowerCase()) {
      return true;
    }
    if (inGameAlign === ALIGNMENTS.EVIL.toLowerCase() && (card.IsEnhancement || inGameType.includes("enhancement"))) {
      return true;
    }
    return false;
  }

  /**
   * Determines if a card is a Hero / Good Character.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if character is a Hero.
   */
  static isHero(card) {
    if (!card) return false;
    if (this.isGoodEnhancement(card) || this.isEvilEnhancement(card)) return false;

    const inGameType = this._normalize(card.inGameType || card.Type);
    const inGameAlign = this._normalize(card.inGameAlignment || card.Alignment);

    if (inGameType.includes("hero")) return true;
    if (inGameAlign === ALIGNMENTS.GOOD.toLowerCase() && (card.IsCharacter || inGameType.includes("character"))) {
      return true;
    }
    return false;
  }

  /**
   * Determines if a card is an Evil Character.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if character is an Evil Character.
   */
  static isEvilCharacter(card) {
    if (!card) return false;
    if (this.isGoodEnhancement(card) || this.isEvilEnhancement(card)) return false;

    const inGameType = this._normalize(card.inGameType || card.Type);
    const inGameAlign = this._normalize(card.inGameAlignment || card.Alignment);

    if (inGameType.includes("evil character") || inGameType === CARD_TYPES.EC.toLowerCase() || inGameType === "ec") {
      return true;
    }
    if (inGameAlign === ALIGNMENTS.EVIL.toLowerCase() && (card.IsCharacter || inGameType.includes("character"))) {
      return true;
    }
    return false;
  }

  /**
   * Extracts and normalizes brigades from a card.
   *
   * @param {object} card Card instance.
   * @returns {string[]} Array of lowercase brigade names.
   */
  static getBrigades(card) {
    if (!card) return [];
    const raw = card.Brigade || card.Brigades || [];
    if (Array.isArray(raw)) {
      return raw
        .flatMap((b) => (typeof b === "string" ? b.split("/") : []))
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean);
    }
    if (typeof raw === "string") {
      return raw
        .split("/")
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Checks whether an enhancement can be used with a character based on brigade rules.
   * Matches if at least one brigade matches, or if the enhancement is multi-brigade,
   * or if either card lacks brigade definitions (fallback for mock cards or colorless).
   *
   * @param {object} enhancementCard Enhancement card instance.
   * @param {object} characterCard Character card instance.
   * @returns {boolean} True if brigades match or multi-brigade.
   */
  static canEnhancementMatchCharacter(enhancementCard, characterCard) {
    if (!enhancementCard || !characterCard) return false;

    const enhBrigades = this.getBrigades(enhancementCard);
    const charBrigades = this.getBrigades(characterCard);

    // If either card has no brigade specified (e.g. mock test cards or colorless), allow match
    if (enhBrigades.length === 0 || charBrigades.length === 0) {
      return true;
    }

    // If enhancement is multi-brigade or contains "multi", it matches
    if (enhBrigades.includes("multi") || enhBrigades.length > 1) {
      return true;
    }

    // At least one brigade must match
    return enhBrigades.some((b) => charBrigades.includes(b));
  }

  /**
   * Checks whether an ability should trigger upon battlefield entrance.
   *
   * @param {object} ability AST ability node.
   * @param {string} actionType Determined battle action type.
   * @param {object} [card] In-game card instance.
   * @returns {boolean} True if ability triggers on battle entry.
   */
  static isAbilityTriggeredOnBattleEntry(ability, actionType, card = null) {
    if (!ability) return false;

    // Star abilities NEVER trigger upon entering the battlefield
    if (AbilityLookup.isStarAbility(ability, { isStarCard: Boolean(card?.IsStarCard) })) {
      return false;
    }

    const mode = (ability.activation_mode || "").toLowerCase();
    const event = (ability.trigger_event || "").toLowerCase();

    // Immediate or untargeted event abilities fire on battle enter / play
    if (!event) {
      return mode === "immediate" || mode === "triggered";
    }

    if (actionType === ActionType.BLOCK_RESCUE) {
      return (
        event.startsWith("block") ||
        event.includes("blocking") ||
        event.includes("enters battle") ||
        event === "play" ||
        event === "played"
      );
    }

    if (actionType === ActionType.RESCUE_ATTEMPT) {
      return (
        event.includes("rescue_attempt") ||
        event.includes("enters battle") ||
        event.includes("attack") ||
        event === "play" ||
        event === "played"
      );
    }

    return false;
  }

  /**
   * Checks whether a Star card's special ability text contains additional battle-eligible headers.
   *
   * @param {string} text Card special ability text.
   * @returns {boolean} True if text contains non-Star section headers.
   */
  static hasBattleAbilityHeader(text) {
    return /\b(EC|HERO|CHARACTER|IF BLOCKING|WHEN BLOCKING)\b/i.test(text);
  }
}

module.exports = { BattleCharacterClassifier };
