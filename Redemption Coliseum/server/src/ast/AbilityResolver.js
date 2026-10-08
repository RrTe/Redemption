// server/src/ast/AbilityResolver.js
const { AbilityLookup } = require("./AbilityLookup");
const { ConditionEvaluator } = require("./ConditionEvaluator");
const { AstEffectRunner } = require("./AstEffectRunner");
const logger = require("../utils/logger");

/**
 * High-level coordinator bridging EffectChronicle items to the AST execution engine.
 * Fully synchronous in Phase 1 to eliminate race conditions.
 */
class AbilityResolver {
  /**
   * @param {import('../rooms/GameRoom').GameRoom} room Game room instance.
   */
  constructor(room) {
    this.room = room;
  }

  /**
   * Resolves an enqueued ChronicleItem through the AST engine.
   *
   * @param {object} item ChronicleItem instance being resolved.
   * @param {object} [options] Execution options (e.g. targetCardIds).
   * @returns {{ handled: boolean, snapshots?: object[], logEntries?: string[], reason?: string, fallbackText?: string }}
   */
  resolve(item, options = {}) {
    if (!item) {
      return { handled: false, reason: "MISSING_ITEM" };
    }

    const card = this.room?.cardLookup?.get(item.cardId);
    if (!card || !card.templateId) {
      logger.info(
        `[AbilityResolver] Card not found or templateId missing for cardId '${item.cardId}'. Triggering fallback.`
      );
      return { handled: false, reason: "CARD_OR_TEMPLATE_NOT_FOUND" };
    }

    const templateId = card.templateId;
    if (!AbilityLookup.hasLogic(templateId)) {
      logger.info(
        `[AbilityResolver] No AST logic found for templateId '${templateId}'. Triggering fallback.`
      );
      return { handled: false, reason: "NO_AST_LOGIC" };
    }

    const player = this.room.state.players.get(item.controllerId);
    if (!player) {
      return { handled: false, reason: "CONTROLLER_NOT_FOUND" };
    }

    // Resolve side-specific abilities
    const abilities = AbilityLookup.resolveAbilities(templateId, {
      actionType: item.actionType,
      inGameType: card.inGameType,
      inGameAlignment: card.inGameAlignment,
    });

    if (abilities.length === 0) {
      logger.info(
        `[AbilityResolver] No matching abilities for templateId '${templateId}'. Triggering fallback.`
      );
      return { handled: false, reason: "NO_MATCHING_ABILITIES" };
    }

    // Select ability: matching abilityId or default to the first one
    const targetAbility = (item.abilityId && abilities.find((a) => a.ability_id === item.abilityId))
      || abilities[0];

    // Evaluate trigger conditions
    const evalResult = ConditionEvaluator.evaluate(targetAbility.conditions, {
      room: this.room,
      player,
      card,
    });

    if (!evalResult.valid) {
      logger.info(
        `[AbilityResolver] Conditions not met for '${item.title}': ${evalResult.reason}. Triggering fallback.`
      );
      return { handled: false, reason: "CONDITIONS_UNMET" };
    }

    // Run effects through execution engine
    const runnerResult = AstEffectRunner.runAbility(targetAbility, {
      room: this.room,
      player,
      card,
      item,
      options,
    });

    if (!runnerResult.handled) {
      return {
        handled: false,
        reason: runnerResult.reason || "UNSUPPORTED_ACTION",
      };
    }

    return {
      handled: true,
      snapshots: runnerResult.snapshots || [],
      logEntries: runnerResult.logEntries || [],
    };
  }
}

module.exports = { AbilityResolver };
