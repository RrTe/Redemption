// server/src/ast/AbilityResolver.js
const { AbilityLookup } = require("./AbilityLookup");
const { ConditionEvaluator } = require("./ConditionEvaluator");
const { AstEffectRunner } = require("./AstEffectRunner");
const { TargetSelectionService } = require("./TargetSelectionService");
const { AST_MESSAGES } = require("../../../shared/astConstants");
const logger = require("../utils/logger");

/**
 * High-level coordinator bridging EffectChronicle items to the AST execution engine.
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
   * @returns {{ handled: boolean, awaitingTargetSelection?: boolean, eligible?: object, snapshots?: object[], logEntries?: string[], reason?: string, fallbackText?: string }}
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

    const player = this.room.state.players.get(item.controllerId);
    if (!player) {
      return { handled: false, reason: "CONTROLLER_NOT_FOUND" };
    }

    // 1. Declined response
    if (options.accepted === false) {
      return {
        handled: true,
        snapshots: [],
        logEntries: [`${player.name} chooses not to activate ${card.Name || item.title}.`],
      };
    }

    const templateId = card.templateId;
    const hasLogic = templateId && AbilityLookup.hasLogic(templateId);

    // 2. Resolve side-specific abilities if AST logic exists
    let targetAbility = null;
    let firstEffect = null;

    if (hasLogic) {
      const abilities = AbilityLookup.resolveAbilities(templateId, {
        actionType: item.actionType,
        inGameType: card.inGameType,
        inGameAlignment: card.inGameAlignment,
      });

      if (abilities.length > 0) {
        targetAbility = (item.abilityId && abilities.find((a) => a.ability_id === item.abilityId))
          || abilities[0];

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

        firstEffect = targetAbility.effects?.[0];
      }
    }

    // 3. Optional ability confirmation check (both AST and Tabletop)
    const isStarActivation = item.actionType === "ACTIVATE_STAR_ABILITY";
    const isAlreadyAccepted = Boolean(item.isConfirmed || item.accepted || options.accepted === true);
    if (options.accepted === true) {
      item.isConfirmed = true;
    }
    const isOptional = Boolean(targetAbility?.is_optional || item.isOptional) && !isAlreadyAccepted;

    if (isOptional && options.accepted === undefined && !isStarActivation) {
      const promptText = firstEffect
        ? this._getOptionalPromptText(firstEffect, card, item)
        : `Activate the special ability of ${card.Name || item.title}?`;

      const client = this.room.clients.find((c) => c.sessionId === player.sessionId);
      if (client && typeof client.send === "function") {
        client.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
          abilityId: targetAbility?.ability_id || item.abilityId || "",
          itemId: item.id,
          cardId: card.id || item.cardId,
          cardTitle: card.Name || item.title,
          promptText,
          action: firstEffect?.action || "activate",
          cardImageFile: card.ImageFile || "",
          templateId: card.templateId || "",
        });
      }
      return {
        handled: true,
        awaitingConfirmation: true,
      };
    }

    // 4. If no AST logic or no targetAbility, trigger tabletop fallback
    if (!hasLogic || !targetAbility) {
      logger.info(
        `[AbilityResolver] No AST logic found for '${card.Name}' (${templateId}). Tabletop resolution.`
      );
      return { handled: false, reason: "NO_AST_LOGIC" };
    }

    // 5. Interactive targeting check: pause and request selection if required
    const hasExplicitTargets = Boolean(options.targetCardIds || options.targetPileId);
    const isSupportedAction = Boolean(firstEffect && AstEffectRunner._handlers[firstEffect.action]);

    if (isSupportedAction && firstEffect.target && !hasExplicitTargets) {
      const eligible = TargetSelectionService.resolveEligibleTargets(this.room, player, firstEffect.target);
      if (eligible.requiresSelection) {
        const client = this.room.clients.find((c) => c.sessionId === player.sessionId);
        if (client && typeof client.send === "function") {
          client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
            abilityId: targetAbility.ability_id,
            itemId: item.id,
            promptText: eligible.promptText,
            targetType: eligible.targetType,
            eligibleCardIds: eligible.eligibleCardIds,
            eligiblePiles: eligible.eligiblePiles,
            minTargets: eligible.minTargets,
            maxTargets: eligible.maxTargets,
            canCancel: eligible.canCancel,
          });
        }
        return {
          handled: true,
          awaitingTargetSelection: true,
          eligible,
        };
      }
    }

    // 6. Run effects through execution engine
    const runnerResult = AstEffectRunner.runAbility(targetAbility, {
      room: this.room,
      player,
      card,
      item,
      options,
    });

    if (runnerResult?.awaitingSpecialInitiative) {
      return {
        handled: true,
        awaitingSpecialInitiative: true,
      };
    }

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

  /**
   * Generates a readable prompt question for optional abilities.
   *
   * @private
   * @param {object} [effect] First effect in the ability definition.
   * @param {object} card Card object.
   * @param {object} item Chronicle item.
   * @returns {string} Prompt question.
   */
  _getOptionalPromptText(effect, card, item) {
    const cardName = card.Name || item.title || "this card";
    if (!effect) {
      return `Activate the optional ability of ${cardName}?`;
    }
    let count = effect.count ?? effect.target?.count ?? 1;
    if (typeof count === "object" && count !== null) {
      count = count.fixed_value ?? 1;
    }
    switch (effect.action) {
      case "draw":
        return `Draw ${count} card${count > 1 ? "s" : ""}?`;
      case "discard":
        return `Discard ${count} card${count > 1 ? "s" : ""}?`;
      case "look_and_choose":
        return `Search and choose from cards?`;
      default:
        return `Activate ${cardName}'s optional ability?`;
    }
  }
}

module.exports = { AbilityResolver };
