// server/src/ast/AbilityResolver.js
const { AbilityLookup } = require("./AbilityLookup");
const { ConditionEvaluator } = require("./ConditionEvaluator");
const { AstEffectRunner } = require("./AstEffectRunner");
const { TargetSelectionService } = require("./TargetSelectionService");
const { AST_MESSAGES, AST_ACTIONS } = require("../../../shared/astConstants");
const { ActionType } = require("../../../shared/actions");
const { ZONES } = require("../../../shared/zones");
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
    const fallbackBand = card ? AbilityResolver.getFallbackBandAbility(card) : null;
    if (!card || (!card.templateId && !fallbackBand)) {
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
    const hasLogic = Boolean(templateId && AbilityLookup.hasLogic(templateId));

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

    const isBattleContext =
      card.zone === ZONES.BATTLEFIELD ||
      item.actionType === ActionType.RESCUE_ATTEMPT ||
      item.actionType === ActionType.BLOCK_RESCUE;

    if (
      (!targetAbility || !firstEffect || !AstEffectRunner._handlers[firstEffect.action]) &&
      isBattleContext &&
      fallbackBand
    ) {
      targetAbility = fallbackBand;
      firstEffect = fallbackBand.effects[0];
    }

    const isFallbackBand = targetAbility?.ability_id === "fallback_band";

    // 3. Optional ability confirmation check (both AST and Tabletop)
    const isStarActivation =
      item.actionType === "ACTIVATE_STAR_ABILITY" ||
      item.actionType === ActionType?.ACTIVATE_STAR_ABILITY ||
      Boolean(item.isDeclared) ||
      Boolean(options.isDeclared) ||
      Boolean(card?.IsStarCard) ||
      Boolean(card?.Class && card.Class.includes("Star"));

    const isAlreadyAccepted =
      Boolean(item.isConfirmed || item.accepted || item.isDeclared || options.accepted === true || options.isDeclared);
    if (options.accepted === true || options.isDeclared || item.isDeclared) {
      item.isConfirmed = true;
    }
    const isOptional = Boolean(targetAbility?.is_optional || item.isOptional) && !isAlreadyAccepted;

    if (isOptional && options.accepted === undefined && !isStarActivation) {
      const promptText = firstEffect && !isFallbackBand
        ? this._getOptionalPromptText(firstEffect, card, item)
        : `Activate the special ability of ${card.Name || item.title}?`;

      // Preview telegraph: sent exclusively to the acting player as a private decision aid.
      // Opponents never receive preview arrows while a player is deciding.
      if (firstEffect?.target && card?.id && !isFallbackBand) {
        const eligiblePreview = TargetSelectionService.resolveEligibleTargets(
          this.room,
          player,
          firstEffect.target,
          { sourceCard: card, actionType: firstEffect.action }
        );
        if (eligiblePreview.eligibleCardIds?.length > 0) {
          const actingClient = this.room.clients?.find((c) => c.sessionId === player.sessionId);
          if (actingClient && typeof actingClient.send === "function") {
            actingClient.send(AST_MESSAGES.ACTION_TELEGRAPH, {
              sourceCardId: card.id,
              targetCardIds: eligiblePreview.eligibleCardIds,
              action: firstEffect.action,
              persistent: true,
            });
          }
        }
      }

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

    // 4. If no targetAbility, trigger tabletop fallback
    if (!targetAbility) {
      logger.info(
        `[AbilityResolver] No AST logic found for '${card.Name}' (${templateId}). Tabletop resolution.`
      );
      return { handled: false, reason: "NO_AST_LOGIC" };
    }

    // 5. Interactive targeting check: pause and request selection if required
    const hasExplicitTargets = Boolean(options.targetCardIds || options.targetPileId);
    const isSupportedAction = Boolean(firstEffect && AstEffectRunner._handlers[firstEffect.action]);

    if (isSupportedAction && firstEffect.target && !hasExplicitTargets) {
      const eligible = TargetSelectionService.resolveEligibleTargets(
        this.room,
        player,
        firstEffect.target,
        { sourceCard: card, actionType: firstEffect.action }
      );
      const isBandAction =
        firstEffect.action === AST_ACTIONS.BAND ||
        firstEffect.action === AST_ACTIONS.ADD_TO_BATTLE;
      const isAutoBandSingleChoice =
        isBandAction &&
        !isFallbackBand &&
        eligible.maxTargets === 1 &&
        eligible.eligibleCardIds.length === 1;

      if (eligible.requiresSelection && !isAutoBandSingleChoice) {
        const client = this.room.clients.find((c) => c.sessionId === player.sessionId);
        if (client && typeof client.send === "function") {
          client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
            abilityId: targetAbility.ability_id,
            itemId: item.id,
            sourceCardId: card?.id || item?.cardId,
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

      if (isAutoBandSingleChoice) {
        options.targetCardIds = [eligible.eligibleCardIds[0]];
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

    if (runnerResult?.awaitingTargetSelection) {
      return {
        handled: true,
        awaitingTargetSelection: true,
        eligible: runnerResult.eligible,
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
      case AST_ACTIONS.DRAW:
        return `Draw ${count} card${count > 1 ? "s" : ""}?`;
      case AST_ACTIONS.DISCARD:
        return `Discard ${count} card${count > 1 ? "s" : ""}?`;
      case "look_and_choose":
        return `Search and choose from cards?`;
      case AST_ACTIONS.BAND:
      case AST_ACTIONS.ADD_TO_BATTLE: {
        const titles = effect.target?.card_titles;
        if (Array.isArray(titles) && titles.length > 0) {
          return `Band with ${titles.join(" or ")}?`;
        }
        const idents = effect.target?.identifiers;
        if (Array.isArray(idents) && idents.length > 0) {
          return `Band with ${idents.join(" or ")}?`;
        }
        return `Band a character into battle?`;
      }
      default:
        return `Activate ${cardName}'s optional ability?`;
    }
  }

  /**
   * Builds a synthetic AST Banding ability for cards whose special ability text
   * includes a band or add-to-battle effect that is not yet modeled in cards_logic.json.
   *
   * @param {object} card Card instance.
   * @returns {object | null} Synthetic AST ability object or null.
   */
  static getFallbackBandAbility(card) {
    const rawText = (card?.SpecialAbility || card?.specialAbility || "").toString();
    if (!rawText) return null;

    const lower = rawText.toLowerCase();
    const hasBandPhrase =
      /\b(bands?\s+to|bands?\s+with|may\s+band|band\s+all|band\s+a\b|band\s+up\s+to|band\s+\d+|add\s+to\s+battle)\b/i.test(rawText) ||
      (lower.includes("band") &&
        !/^(?:[^\n.]*\b(?:except\s+band|cannot\s+band|prevent\s+band|negate\s+band)\b)/i.test(rawText));

    if (!hasBandPhrase) return null;

    // Isolate only the band/add-to-battle clause so numbers in subsequent clauses (e.g. ", or you may draw 2") do not trigger multi-target
    const bandClauseMatch = rawText.match(
      /\b(?:bands?\s+(?:to|with)|may\s+band(?:\s+(?:to|with))?|band\s+(?:all|each|up\s+to|\d+|two|three|four|five|a\b|an\b)|add\s+(?:[^.,;]+?\s+)?to\s+battle)\b([^.,;]*)/i
    );
    const bandClause = bandClauseMatch ? bandClauseMatch[0] : rawText;

    const isSingularArticleBand =
      /\bbands?\s+(?:to|with)\s+an?\s+/i.test(bandClause) &&
      !/\bbands?\s+(?:to|with)\s+an?\s+[^.,;]*?\band\s+an?\s+/i.test(bandClause);

    const isMultiTargetBand =
      !isSingularArticleBand &&
      (/\b(?:all|each|any\s+number|two|three|four|five|[2-9])\b/i.test(bandClause) ||
        /\bbands?\s+(?:to|with)\s+(?!an?\b)[^.,;]*?\s+and\s+/i.test(bandClause) ||
        /\b(?:characters|heroes|evil\s+characters|animals|demons|priests|prophets|royals|kings|judges|disciples|apostles|patriarchs|ancients|warriors|soldiers|musicians|elders|captains|princes|brothers|sons|women|men|giants|romans|greeks|egyptians|philistines|assyrians|babylonians|persians|syrians|canaanites|amalekites|midianites|moabites|edomites|ammonites|samaritans|herodians|pharisees|sadducees|zealots|magicians)\b/i.test(
          bandClause
        ));

    return {
      ability_id: "fallback_band",
      is_optional: true,
      conditions: [],
      effects: [
        {
          action: AST_ACTIONS.BAND,
          target: {
            selection_mode: "manual_controller",
            zone_owner: "both",
            scope: ["in_play", "hand"],
            target_type: "character",
            prompt_text: isMultiTargetBand
              ? "Select character(s) to band into battle (Click in activation order)"
              : "Select a character to band into battle",
            count: isMultiTargetBand
              ? { min_value: 1, max_value: 99 }
              : { fixed_value: 1 },
            can_cancel: true,
          },
        },
      ],
    };
  }
}

module.exports = { AbilityResolver };
