// server/src/services/BattleTriggerService.js
const { ZONES } = require("../../../shared/zones");
const { ActionType } = require("../../../shared/actions");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { AstEffectRunner } = require("../ast/AstEffectRunner");
const { ConditionEvaluator } = require("../ast/ConditionEvaluator");
const { EffectChronicleService } = require("./EffectChronicleService");
const { BattleCharacterClassifier } = require("./BattleCharacterClassifier");
const logger = require("../utils/logger");

/**
 * Service managing battlefield entrance and battle primitive triggers (Rescue Attempt & Block).
 * Evaluates triggers when characters enter the Field of Battle and delegates them to the Effect Chronicle.
 */
class BattleTriggerService {
  /**
   * Evaluates and dispatches battle entrance triggers when cards move to the battlefield.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room instance.
   * @param {object} player Player initiating the movement.
   * @param {Array<object>} movedCards Cards that were moved.
   * @param {object} message Original move message payload.
   * @returns {Array<object>} Results of trigger checks.
   */
  static onCardEnteredBattlefield(room, player, movedCards, message) {
    if (!Array.isArray(movedCards) || movedCards.length === 0) {
      return [];
    }
    if (message.from === ZONES.BATTLEFIELD || message.to !== ZONES.BATTLEFIELD) {
      return [];
    }

    const results = [];
    for (const card of movedCards) {
      const res = this.handleCardBattleEntry(room, player, card, message);
      if (res) results.push(res);
    }
    return results;
  }

  /**
   * Handles battle entry trigger for a single card.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active GameRoom instance.
   * @param {object} player Acting player.
   * @param {object} card Card instance entering the battlefield.
   * @param {object} message Movement message payload.
   * @returns {object | null} Execution summary or null if skipped.
   */
  static handleCardBattleEntry(room, player, card, message) {
    const isHeroChar = this.isHero(card);
    const isEvilChar = this.isEvilCharacter(card);

    if (!isHeroChar && !isEvilChar) {
      logger.debug(
        `[BattleTriggerService] Card '${card.Name}' (${card.id}) is not a battle character. Skipping.`
      );
      return null;
    }

    const actionType = isHeroChar
      ? ActionType.RESCUE_ATTEMPT
      : ActionType.BLOCK_RESCUE;
    const controllerId = card.controllerId || player?.sessionId;

    // 1. Try finding an automated AST battle entrance ability
    const astAbility = this.findBattleEntryAstAbility(room, player, card, actionType);
    if (astAbility) {
      logger.info(
        `[BattleTriggerService] Enqueueing AST '${card.Name}' (${astAbility.ability_id}) for '${actionType}'.`
      );

      const hasMayKeyword = /\bmay\b/i.test(card.SpecialAbility || card.specialAbility || "");
      const isSupported = this._isSupportedAstAbility(astAbility);
      const isOptional = Boolean(astAbility.is_optional || hasMayKeyword || !isSupported);

      EffectChronicleService.enqueueCards(
        room,
        [card],
        controllerId,
        actionType,
        {
          autoExecute: true,
          autoExecuteSupported: true,
          abilityId: astAbility.ability_id,
          isOptional,
        }
      );
      return {
        triggered: true,
        actionType,
        cardId: card.id,
        abilityId: astAbility.ability_id,
      };
    }

    // 2. Tabletop fallback: Check for non-star special abilities on the card
    const specialAbility = (card.SpecialAbility || card.specialAbility || "").trim();
    if (!specialAbility) {
      logger.debug(
        `[BattleTriggerService] Card '${card.Name}' (${card.id}) has no special ability. Skipping.`
      );
      return { triggered: false, reason: "NO_SPECIAL_ABILITY", cardId: card.id };
    }

    if (
      card.IsStarCard &&
      specialAbility.toUpperCase().startsWith("STAR:") &&
      !this._hasBattleAbilityHeader(specialAbility)
    ) {
      logger.debug(
        `[BattleTriggerService] Star card '${card.Name}' has only Star ability. Skipping battle entry.`
      );
      return { triggered: false, reason: "STAR_ABILITY_ONLY", cardId: card.id };
    }

    logger.info(
      `[BattleTriggerService] Enqueueing tabletop special ability for '${card.Name}' (${card.id}) for '${actionType}'.`
    );

    EffectChronicleService.enqueueCards(
      room,
      [card],
      controllerId,
      actionType,
      {
        autoExecute: true,
        autoExecuteSupported: true,
        abilityId: "",
        isOptional: true,
      }
    );

    return {
      triggered: true,
      actionType,
      cardId: card.id,
      tabletopFallback: true,
    };
  }

  /**
   * Finds a matching, conditional AST entrance ability for a card.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room.
   * @param {object} player Acting player.
   * @param {object} card In-game card.
   * @param {string} actionType Battle action type.
   * @returns {object | null} Valid AST ability or null.
   */
  static findBattleEntryAstAbility(room, player, card, actionType) {
    const templateId = card.templateId;
    if (!templateId || !AbilityLookup.hasLogic(templateId)) return null;

    const abilities = AbilityLookup.resolveAbilities(templateId, {
      actionType,
      inGameType: card.inGameType,
      inGameAlignment: card.inGameAlignment,
      isStarCard: card.IsStarCard,
      card,
    });
    if (!abilities || abilities.length === 0) return null;

    const matching = abilities.filter((a) =>
      this.isAbilityTriggeredOnBattleEntry(a, actionType, card)
    );
    if (matching.length === 0) return null;

    const validAbilities = matching.filter((ability) => {
      const evalResult = ConditionEvaluator.evaluate(ability.conditions, {
        room,
        player,
        card,
      });
      return evalResult.valid;
    });
    if (validAbilities.length === 0) return null;

    // Prioritize supported AST abilities (e.g. Draw) and optional abilities
    const supportedOptional = validAbilities.find(
      (a) => a.is_optional && this._isSupportedAstAbility(a)
    );
    if (supportedOptional) return supportedOptional;

    const supported = validAbilities.find((a) => this._isSupportedAstAbility(a));
    if (supported) return supported;

    const optional = validAbilities.find((a) => a.is_optional);
    if (optional) return optional;

    return validAbilities[0];
  }

  static _isSupportedAstAbility(ability) {
    const action = ability?.effects?.[0]?.action;
    return Boolean(action && AstEffectRunner._handlers[action]);
  }

  static isHero(card) {
    return BattleCharacterClassifier.isHero(card);
  }

  static isEvilCharacter(card) {
    return BattleCharacterClassifier.isEvilCharacter(card);
  }

  static isAbilityTriggeredOnBattleEntry(ability, actionType, card = null) {
    return BattleCharacterClassifier.isAbilityTriggeredOnBattleEntry(ability, actionType, card);
  }

  static _hasBattleAbilityHeader(text) {
    return BattleCharacterClassifier.hasBattleAbilityHeader(text);
  }
}

module.exports = { BattleTriggerService };
