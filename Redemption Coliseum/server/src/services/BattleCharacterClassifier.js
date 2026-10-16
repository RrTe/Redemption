// server/src/services/BattleCharacterClassifier.js
const { ActionType } = require("../../../shared/actions");
const { AbilityLookup } = require("../ast/AbilityLookup");

/**
 * Helper utility for classifying battle character types and filtering battle entrance abilities.
 */
class BattleCharacterClassifier {
  /**
   * Determines if a card is a Hero / Good Character.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if character is a Hero.
   */
  static isHero(card) {
    if (!card) return false;
    const inGameType = (card.inGameType || card.Type || "").toLowerCase();
    const inGameAlign = (card.inGameAlignment || card.Alignment || "").toLowerCase();

    if (inGameType.includes("hero")) return true;
    if (inGameAlign === "good" && (card.IsCharacter || inGameType.includes("character"))) {
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
    const inGameType = (card.inGameType || card.Type || "").toLowerCase();
    const inGameAlign = (card.inGameAlignment || card.Alignment || "").toLowerCase();

    if (inGameType.includes("evil character") || inGameType === "ec") return true;
    if (inGameAlign === "evil" && (card.IsCharacter || inGameType.includes("character"))) {
      return true;
    }
    return false;
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
