// server/src/services/BattleTriggerService.js
const { ZONES } = require("../../../shared/zones");
const { ActionType } = require("../../../shared/actions");
const { AST_ACTIVATION_MODES } = require("../../../shared/astConstants");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { AstEffectRunner } = require("../ast/AstEffectRunner");
const { ConditionEvaluator } = require("../ast/ConditionEvaluator");
const { EffectLabelFormatter } = require("../ast/EffectLabelFormatter");
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
    const isArena = Boolean(room?.state?.isArenaMode ?? room?.state?.isSandboxMode);
    if (isArena) {
      logger.debug(
        "[BattleTriggerService] Arena mode active: skipping automatic battle entry triggers."
      );
      return [];
    }
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
    if (!card || card.isFaceDown) return null;
    const isHeroChar = this.isHero(card);
    const isEvilChar = this.isEvilCharacter(card);
    const isGoodEnh = this.isGoodEnhancement(card);
    const isEvilEnh = this.isEvilEnhancement(card);

    if (!isHeroChar && !isEvilChar && !isGoodEnh && !isEvilEnh) {
      logger.debug(
        `[BattleTriggerService] Card '${card.Name}' (${card.id}) is neither a battle character nor an enhancement. Skipping.`
      );
      return null;
    }

    let actionType;
    if (isHeroChar) {
      actionType = ActionType.RESCUE_ATTEMPT;
    } else if (isEvilChar) {
      actionType = ActionType.BLOCK_RESCUE;
    } else if (isGoodEnh) {
      actionType = ActionType.PLAY_GOOD_ENHANCEMENT;
    } else {
      actionType = ActionType.PLAY_EVIL_ENHANCEMENT;
    }
    const controllerId = card.controllerId || player?.sessionId;
    card._lastCostPaid = false;

    // 1. Try finding automated AST battle entrance abilities in printed order
    const astEntries = this.findBattleEntryAstAbilities(room, player, card, actionType);
    if (astEntries.length > 0) {
      return this._enqueueBattleAbilities(room, card, controllerId, actionType, astEntries);
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
        effectLabel: EffectLabelFormatter.formatTabletopFallbackLabel(card, actionType),
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
   * Finds all matching, conditional AST entrance abilities for a card in printed order,
   * preserving choice_groups as unified single entries.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room.
   * @param {object} player Acting player.
   * @param {object} card In-game card.
   * @param {string} actionType Battle action type.
   * @returns {Array<{ ability: object, abilityId: string, choiceGroup: string, isSupported: boolean, isChoice: boolean, isOptional: boolean }>} Ordered enqueue descriptors.
   */
  static findBattleEntryAstAbilities(room, player, card, actionType) {
    const templateId = card?.templateId;
    if (!templateId || !AbilityLookup.hasLogic(templateId)) return [];

    const abilities = AbilityLookup.resolveAbilities(templateId, {
      actionType,
      inGameType: card.inGameType,
      inGameAlignment: card.inGameAlignment,
      isStarCard: card.IsStarCard,
      card,
    });
    if (!abilities || abilities.length === 0) return [];

    const matching = abilities.filter((a) =>
      this.isAbilityTriggeredOnBattleEntry(a, actionType, card)
    );
    if (matching.length === 0) return [];

    const entries = [];
    const seenChoiceGroups = new Set();
    const isMultiAbilityCard = matching.length > 1;

    for (const ability of matching) {
      if (ability.choice_group) {
        if (seenChoiceGroups.has(ability.choice_group)) continue;
        seenChoiceGroups.add(ability.choice_group);

        const groupAbilities = abilities.filter(
          (a) => a.choice_group === ability.choice_group
        );
        const anyConditionMet = groupAbilities.some(
          (a) => ConditionEvaluator.evaluate(a.conditions, { room, player, card }).valid
        );
        if (!anyConditionMet) continue;

        entries.push({
          ability: groupAbilities[0],
          groupAbilities,
          abilityId: "",
          choiceGroup: ability.choice_group,
          isSupported: groupAbilities.some((a) => this._isSupportedAstAbility(a)),
          isChoice: true,
          isOptional: groupAbilities.some((a) => Boolean(a.is_optional)),
        });
        continue;
      }

      const evalResult = ConditionEvaluator.evaluate(ability.conditions, {
        room,
        player,
        card,
      });
      if (!evalResult.valid) {
        // Defer was_cost_paid evaluation to execution time if an earlier ability on this card may fulfill the cost
        const failedCostCheck =
          evalResult.failedCondition?.condition_type === "was_cost_paid" && entries.length > 0;
        if (!failedCostCheck) continue;
      }

      const flags = this._resolveAbilityFlags(card, ability, {
        ignoreTextMayFallback: isMultiAbilityCard,
      });
      entries.push({
        ability,
        abilityId: flags.isChoice ? "" : ability.ability_id,
        choiceGroup: "",
        ...flags,
      });
    }

    return entries;
  }

  /**
   * Finds a matching, conditional AST entrance ability for a card (backwards-compatible single selector).
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room.
   * @param {object} player Acting player.
   * @param {object} card In-game card.
   * @param {string} actionType Battle action type.
   * @returns {object | null} Valid AST ability or null.
   */
  static findBattleEntryAstAbility(room, player, card, actionType) {
    const entries = this.findBattleEntryAstAbilities(room, player, card, actionType);
    if (entries.length === 0) return null;

    const validAbilities = entries.map((e) => e.ability);

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

  /**
   * Enqueues one or more resolved AST battle-entry descriptors for a card in order.
   *
   * @private
   */
  static _enqueueBattleAbilities(room, card, controllerId, actionType, entries) {
    const firstAbilityId = entries[0]?.ability?.ability_id || "";
    const abilityIds = entries.map((e) => e.ability?.ability_id).filter(Boolean);

    logger.info(
      `[BattleTriggerService] Enqueueing ${entries.length} AST ability/abilities for '${card.Name}' (${abilityIds.join(", ")}) for '${actionType}'.`
    );

    const queueItems = [];
    const timestamp = Date.now();
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      if (entry.isChoice) {
        queueItems.push({
          card,
          abilityId: entry.abilityId,
          effectStepIndex: -1,
          effectLabel: EffectLabelFormatter.formatChoiceGroupLabel(
            entry.groupAbilities || (entry.ability ? [entry.ability] : []),
            card
          ),
          isOptional: entry.isOptional,
          choiceGroup: entry.choiceGroup,
        });
        continue;
      }

      const sortedEffects = Array.isArray(entry.ability?.effects)
        ? [...entry.ability.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
        : [];
      if (sortedEffects.length > 0) {
        const groupId = `grp_${timestamp}_${idx}_${card.id || "c"}_${entry.abilityId || "ab"}`;
        for (let stepIdx = 0; stepIdx < sortedEffects.length; stepIdx++) {
          queueItems.push({
            card,
            abilityId: entry.abilityId,
            effectStepIndex: stepIdx,
            effectLabel: EffectLabelFormatter.formatSingleEffectLabel(sortedEffects[stepIdx], card),
            isOptional: stepIdx === 0 ? entry.isOptional : false,
            choiceGroup: "",
            abilityGroupId: groupId,
          });
        }
      } else {
        queueItems.push({
          card,
          abilityId: entry.abilityId,
          effectStepIndex: -1,
          effectLabel: EffectLabelFormatter.formatTabletopFallbackLabel(card, actionType),
          isOptional: entry.isOptional,
          choiceGroup: entry.choiceGroup,
        });
      }
    }

    EffectChronicleService.enqueueCards(
      room,
      queueItems,
      controllerId,
      actionType,
      {
        autoExecute: true,
        autoExecuteSupported: true,
      }
    );

    return {
      triggered: true,
      actionType,
      cardId: card.id,
      abilityId: firstAbilityId,
      abilityIds,
    };
  }

  static _isSupportedAstAbility(ability) {
    const action = ability?.effects?.[0]?.action;
    return Boolean(action && AstEffectRunner._handlers[action]);
  }

  static isDominant(card) {
    return BattleCharacterClassifier.isDominant(card);
  }

  /**
   * Handles ability triggering when a Dominant card is played from hand.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room instance.
   * @param {object} player Acting player.
   * @param {object} card In-game Dominant card.
   * @param {object} message Original move message.
   * @returns {object | null} Execution summary or null if skipped.
   */
  static onDominantPlayed(room, player, card, message) {
    const isArena = Boolean(room?.state?.isArenaMode ?? room?.state?.isSandboxMode);
    if (isArena) return null;
    if (!card || card.isFaceDown || !BattleCharacterClassifier.isDominant(card)) return null;

    const actionType = ActionType.ACTIVATE_ABILITY;
    const controllerId = card.controllerId || player?.sessionId;
    card._lastCostPaid = false;

    // 1. Try finding automated AST abilities for the Dominant
    const astEntries = this.findBattleEntryAstAbilities(room, player, card, actionType);
    if (astEntries.length > 0) {
      return this._enqueueBattleAbilities(room, card, controllerId, actionType, astEntries);
    }

    // 2. Tabletop fallback for Dominants with abilities
    const specialAbility = (card.SpecialAbility || card.specialAbility || "").trim();
    if (specialAbility) {
      logger.info(
        `[BattleTriggerService] Enqueueing tabletop special ability for Dominant '${card.Name}' (${card.id}) for '${actionType}'.`
      );
      EffectChronicleService.enqueueCards(
        room,
        [card],
        controllerId,
        actionType,
        {
          autoExecute: true,
          autoExecuteSupported: false,
          abilityId: "",
          effectLabel: EffectLabelFormatter.formatTabletopFallbackLabel(card, actionType),
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

    return null;
  }

  /**
   * Resolves ability support, choice-group membership, and optionality.
   * Excludes negative "may not" prohibitions from triggering the "may" optionality heuristic.
   *
   * @param {Object} card
   * @param {Object} astAbility
   * @param {Object} [options={}]
   * @param {boolean} [options.ignoreTextMayFallback=false] Skip whole-card text "may" heuristic on multi-ability cards.
   * @returns {{ isSupported: boolean, isChoice: boolean, isOptional: boolean }}
   */
  static _resolveAbilityFlags(card, astAbility, { ignoreTextMayFallback = false } = {}) {
    const specialAbilityText = card.SpecialAbility || card.specialAbility || "";
    const hasMayKeyword = !ignoreTextMayFallback && /\bmay\b(?!\s+not\b)/i.test(specialAbilityText);
    const isSupported = this._isSupportedAstAbility(astAbility);
    const isChoice = Boolean(astAbility.choice_group);
    const isStaticMandatory =
      astAbility.activation_mode === AST_ACTIVATION_MODES.STATIC &&
      astAbility.is_optional !== true &&
      !isChoice &&
      isSupported;
    const isOptional = isStaticMandatory
      ? false
      : Boolean(astAbility.is_optional || hasMayKeyword || isChoice || !isSupported);
    return { isSupported, isChoice, isOptional };
  }

  static isHero(card) {
    return BattleCharacterClassifier.isHero(card);
  }

  static isEvilCharacter(card) {
    return BattleCharacterClassifier.isEvilCharacter(card);
  }

  static isGoodEnhancement(card) {
    return BattleCharacterClassifier.isGoodEnhancement(card);
  }

  static isEvilEnhancement(card) {
    return BattleCharacterClassifier.isEvilEnhancement(card);
  }

  static isLastCharacterInBattle(battlefield, targetCard, ownerId) {
    return BattleCharacterClassifier.isLastCharacterInBattle(battlefield, targetCard, ownerId);
  }

  static isAbilityTriggeredOnBattleEntry(ability, actionType, card = null) {
    return BattleCharacterClassifier.isAbilityTriggeredOnBattleEntry(ability, actionType, card);
  }

  static _hasBattleAbilityHeader(text) {
    return BattleCharacterClassifier.hasBattleAbilityHeader(text);
  }
}

module.exports = { BattleTriggerService };
