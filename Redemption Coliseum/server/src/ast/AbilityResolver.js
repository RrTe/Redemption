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
    let resolvedAbilitiesList = [];
    let isChoiceGroup = false;

    if (hasLogic) {
      const abilities = AbilityLookup.resolveAbilities(templateId, {
        actionType: item.actionType,
        inGameType: card.inGameType,
        inGameAlignment: card.inGameAlignment,
      });
      resolvedAbilitiesList = abilities;

      if (abilities.length > 0) {
        // Choice Group support: prompt player to select between multiple effects (e.g. "Choose One")
        const choiceGroup = abilities[0]?.choice_group;
        const choiceAbilities = choiceGroup
          ? abilities.filter((a) => a.choice_group === choiceGroup)
          : [];
        isChoiceGroup = choiceAbilities.length > 1;
        const isParentAbilityId = Boolean(
          item.abilityId &&
          choiceAbilities.some((a) => a.parent_ability_id === item.abilityId)
        );

        if (isChoiceGroup && !options.chosenAbilityId && (!item.abilityId || isParentAbilityId)) {
          const evaluatedChoices = choiceAbilities.map((a) => {
            const viability = this._evaluateAbilityViability(a, player, card);
            const baseLabel = this._formatAbilityChoiceLabel(a, card);
            const isDisabled = !viability.viable;
            const suffix = isDisabled
              ? (viability.blockedByRound1Reserve ? " (Round 1)" : " (No valid targets)")
              : "";
            return {
              abilityId: a.ability_id,
              label: `${baseLabel}${suffix}`,
              action: a.effects?.[0]?.action || "activate",
              disabled: isDisabled,
              viability,
            };
          });

          if (evaluatedChoices.every((c) => c.disabled)) {
            return this._handleNoValidTargets(player, card, item);
          }

          if (options.accepted === true) {
            // Player already accepted generically or auto-executed: default to first viable choice
            const firstViableChoice = evaluatedChoices.find((c) => !c.disabled) || evaluatedChoices[0];
            options.chosenAbilityId = firstViableChoice.abilityId;
          } else if (options.accepted !== false) {
            const choices = evaluatedChoices.map(({ abilityId, label, action, disabled }) => ({
              abilityId,
              label,
              action,
              disabled,
            }));

            const client = this.room.clients?.find((c) => c.sessionId === player.sessionId);
            if (client && typeof client.send === "function") {
              client.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
                abilityId: "",
                itemId: item.id,
                cardId: card.id || item.cardId,
                cardTitle: card.Name || item.title,
                promptText: `Choose an effect for ${card.Name || item.title}:`,
                action: "choose",
                cardImageFile: card.ImageFile || "",
                templateId: card.templateId || "",
                choices,
              });
            }
            return {
              handled: true,
              awaitingConfirmation: true,
            };
          }
        }

        const effectiveAbilityId =
          options.chosenAbilityId || (isParentAbilityId ? "" : item.abilityId);
        if (effectiveAbilityId) {
          item.abilityId = effectiveAbilityId;
        }

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

    // Pre-validate target viability for single abilities before prompting or executing
    const isResumingStep =
      (typeof item._currentStepIndex === "number" && item._currentStepIndex > 0) ||
      Boolean(options.targetCardIds || options.targetPileId || options.specialInitiativeDeclined);

    if (targetAbility && !isResumingStep) {
      const targetViability = this._evaluateAbilityViability(targetAbility, player, card);
      const anyCardAbilityViable =
        resolvedAbilitiesList.length > 0
          ? resolvedAbilitiesList.some((a) => this._evaluateAbilityViability(a, player, card).viable)
          : targetViability.viable;

      if (!targetViability.viable && (!anyCardAbilityViable || isChoiceGroup)) {
        return this._handleNoValidTargets(player, card, item);
      }
    }

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

      const isSupportedFirstEffect = Boolean(
        firstEffect &&
        !isFallbackBand &&
        AstEffectRunner._handlers[firstEffect.action]
      );
      const singleAbilityChoices =
        isSupportedFirstEffect && targetAbility
          ? [
              {
                abilityId: targetAbility.ability_id,
                label: this._formatAbilityChoiceLabel(targetAbility, card),
                action: firstEffect.action,
                disabled: false,
              },
            ]
          : undefined;

      const client = this.room.clients.find((c) => c.sessionId === player.sessionId);
      if (client && typeof client.send === "function") {
        client.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
          abilityId: targetAbility?.ability_id || item.abilityId || "",
          itemId: item.id,
          cardId: card.id || item.cardId,
          cardTitle: card.Name || item.title,
          promptText,
          action: firstEffect?.action || "activate",
          choices: singleAbilityChoices,
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

    // 5. Multi-step interactive targeting and execution loop
    const sortedEffects = Array.isArray(targetAbility.effects)
      ? [...targetAbility.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
      : [];

    if (sortedEffects.length === 0) {
      return { handled: false, reason: "EMPTY_EFFECTS" };
    }

    if (!Array.isArray(item._accumulatedSnapshots)) item._accumulatedSnapshots = [];
    if (!Array.isArray(item._accumulatedLogs)) item._accumulatedLogs = [];
    const startStepIdx = typeof item._currentStepIndex === "number" ? item._currentStepIndex : 0;
    let stepOptions = { ...options };

    for (let stepIdx = startStepIdx; stepIdx < sortedEffects.length; stepIdx++) {
      item._currentStepIndex = stepIdx;
      const currentEffect = sortedEffects[stepIdx];
      const isSupportedAction = Boolean(
        currentEffect && AstEffectRunner._handlers[currentEffect.action]
      );

      if (!isSupportedAction) {
        if (stepIdx === 0) {
          return { handled: false, reason: "UNSUPPORTED_ACTION" };
        }
        continue;
      }

      const hasExplicitTargets = Boolean(
        stepOptions.targetCardIds ||
        stepOptions.targetPileId ||
        stepOptions.specialInitiativeDeclined
      );
      const isChainedOrSelf =
        currentEffect.target?.selection_mode === "chained_target" ||
        currentEffect.target?.selection_mode === "automatic_self";

      if (currentEffect.target && !hasExplicitTargets && !isChainedOrSelf) {
        const eligible = TargetSelectionService.resolveEligibleTargets(
          this.room,
          player,
          currentEffect.target,
          {
            sourceCard: card,
            actionType: currentEffect.action,
            isOptional: Boolean((targetAbility.is_optional || item.isOptional) && stepIdx === 0),
          }
        );

        // Round 1 Opponent Reserve Read-Only Inspection
        if (
          eligible.eligibleCardIds.length === 0 &&
          eligible.canInspectOpponentReserve &&
          !item._inspectedOpponentReserve
        ) {
          item._inspectedOpponentReserve = true;
          this._flushAccumulatedLogs(item);
          const client = this.room.clients?.find((c) => c.sessionId === player.sessionId);
          if (client && typeof client.send === "function") {
            client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
              abilityId: targetAbility.ability_id,
              itemId: item.id,
              sourceCardId: card?.id || item?.cardId,
              promptText: `${card.Name || item.title}: View Opponent's Reserve (Round 1 - Read Only)`,
              targetType: "card",
              targetZone: ZONES.RESERVE,
              isPileTarget: true,
              searchedPiles: eligible.searchedPiles,
              eligibleCardIds: [],
              eligiblePiles: [],
              minTargets: 0,
              maxTargets: 0,
              canCancel: true,
            });
          }
          return {
            handled: true,
            awaitingTargetSelection: true,
            eligible,
          };
        }

        const isBandAction =
          currentEffect.action === AST_ACTIONS.BAND ||
          currentEffect.action === AST_ACTIONS.ADD_TO_BATTLE;
        const targetCountDef = currentEffect.target?.count;
        const isOriginalSingleTarget =
          !targetCountDef ||
          targetCountDef.fixed_value === 1 ||
          (targetCountDef.max_value === 1 && targetCountDef.min_value !== 0) ||
          (typeof targetCountDef === "number" && targetCountDef === 1);

        const isAutoBandSingleChoice =
          isBandAction &&
          !isFallbackBand &&
          !currentEffect.target?.can_cancel &&
          currentEffect.target?.count?.min_value !== 0 &&
          eligible.minTargets === 1 &&
          eligible.maxTargets === 1 &&
          eligible.eligibleCardIds.length === 1 &&
          isOriginalSingleTarget;

        // Mandatory effect auto-targeting for non-pile targets when legal targets equal required count
        const isStepMandatory =
          ((!targetAbility.is_optional && !item.isOptional) || stepIdx > 0) &&
          !eligible.canCancel &&
          !currentEffect.target?.can_cancel &&
          currentEffect.target?.count?.min_value !== 0;

        const isExactMandatoryChoice =
          isStepMandatory &&
          !isFallbackBand &&
          !eligible.isPileTarget &&
          eligible.minTargets > 0 &&
          eligible.minTargets === eligible.maxTargets &&
          eligible.eligibleCardIds.length === eligible.maxTargets;

        const isAutoTarget = isAutoBandSingleChoice || isExactMandatoryChoice;

        if (eligible.requiresSelection && !isAutoTarget) {
          this._flushAccumulatedLogs(item);
          const targetSessionId = eligible.selectingPlayerId || player.sessionId;
          const isOpponentSelecting = targetSessionId !== player.sessionId;

          if (this.room.state?.effectChronicle) {
            this.room.state.effectChronicle.priorityPlayerId = targetSessionId;
          }

          let promptToSend = eligible.promptText;
          if (isOpponentSelecting) {
            const opponentPlayer = this.room.state?.players?.get(targetSessionId);
            const zoneLabel = (eligible.targetZone || "hand").replace(/_/g, " ");
            if (!currentEffect.target?.prompt_text) {
              promptToSend = `${card.Name || item.title}: Select ${eligible.maxTargets} card(s) from your ${zoneLabel} to ${currentEffect.action}`;
            }
            const actingClient = this.room.clients?.find((c) => c.sessionId === player.sessionId);
            if (actingClient && typeof actingClient.send === "function") {
              actingClient.send("gameToast", {
                message: `Waiting for ${opponentPlayer?.name || "Opponent"} to select a card...`,
                type: "info",
              });
            }
          }

          const targetClient = this.room.clients?.find((c) => c.sessionId === targetSessionId);
          if (targetClient && typeof targetClient.send === "function") {
            const canCancelSelection = isOpponentSelecting
              ? Boolean(currentEffect.target?.can_cancel)
              : Boolean(
                eligible.canCancel ||
                ((targetAbility.is_optional || item.isOptional) && stepIdx === 0)
              );
            targetClient.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
              abilityId: targetAbility.ability_id,
              itemId: item.id,
              sourceCardId: card?.id || item?.cardId,
              promptText: promptToSend,
              targetType: eligible.targetType,
              targetZone: eligible.targetZone,
              isPileTarget: Boolean(eligible.isPileTarget),
              searchedPiles: eligible.searchedPiles,
              eligibleCardIds: eligible.eligibleCardIds,
              eligiblePiles: eligible.eligiblePiles,
              minTargets: eligible.minTargets,
              maxTargets: eligible.maxTargets,
              canCancel: canCancelSelection,
            });
          }
          return {
            handled: true,
            awaitingTargetSelection: true,
            eligible,
          };
        }

        if (isAutoTarget) {
          stepOptions = { ...stepOptions, targetCardIds: [...eligible.eligibleCardIds] };
        }
      }

      const stepResult = AstEffectRunner.runSingleEffect(currentEffect, {
        room: this.room,
        player,
        card,
        item,
        options: stepOptions,
        previousSnapshot: item._previousSnapshot || null,
      });

      if (stepResult?.awaitingSpecialInitiative) {
        this._flushAccumulatedLogs(item);
        return {
          handled: true,
          awaitingSpecialInitiative: true,
        };
      }

      if (stepResult?.awaitingTargetSelection) {
        this._flushAccumulatedLogs(item);
        return {
          handled: true,
          awaitingTargetSelection: true,
          eligible: stepResult.eligible,
        };
      }

      if (!stepResult || !stepResult.handled) {
        return {
          handled: false,
          reason: stepResult?.reason || "UNSUPPORTED_ACTION",
        };
      }

      if (stepResult.snapshot) {
        item._accumulatedSnapshots.push(stepResult.snapshot);
        item._previousSnapshot = stepResult.snapshot;
      }
      if (stepResult.logEntry) {
        item._accumulatedLogs.push(stepResult.logEntry);
      }

      stepOptions = {};
    }

    const finalSnapshots = [...item._accumulatedSnapshots];
    const finalLogs = [...item._accumulatedLogs];
    item._currentStepIndex = 0;
    item._accumulatedSnapshots = [];
    item._accumulatedLogs = [];
    item._previousSnapshot = null;

    return {
      handled: true,
      snapshots: finalSnapshots,
      logEntries: finalLogs,
    };
  }

  /**
   * Flushes any accumulated multi-step log entries immediately to the game log.
   *
   * @private
   * @param {object} item Chronicle item.
   */
  _flushAccumulatedLogs(item) {
    if (
      item &&
      Array.isArray(item._accumulatedLogs) &&
      item._accumulatedLogs.length > 0 &&
      typeof this.room?.broadcastGameLog === "function"
    ) {
      item._accumulatedLogs.forEach((msg) => this.room.broadcastGameLog(msg));
      item._accumulatedLogs = [];
    }
  }

  /**
   * Emits a "No valid targets." toast to the acting player and returns a completed result.
   *
   * @private
   * @param {object} player Acting player.
   * @param {object} card Card instance.
   * @param {object} item Chronicle item.
   * @returns {{ handled: boolean, noValidTargets: boolean, snapshots: object[], logEntries: string[] }}
   */
  _handleNoValidTargets(player, card, item) {
    const cardTitle = card?.Name || item?.title || "Card";
    const client = this.room?.clients?.find((c) => c.sessionId === player.sessionId);
    if (client && typeof client.send === "function") {
      client.send("gameToast", {
        message: `${cardTitle}: No valid targets.`,
        type: "warning",
      });
    }
    return {
      handled: true,
      noValidTargets: true,
      snapshots: [],
      logEntries: [`${player.name}'s ${cardTitle} has no valid targets.`],
    };
  }

  /**
   * Evaluates whether an AST ability has at least one viable effect or inspectable opponent zone.
   *
   * @private
   * @param {object} ability AST ability definition.
   * @param {object} player Acting player.
   * @param {object} card Source card instance.
   * @returns {{
   *   viable: boolean,
   *   hasSupportedTargets: boolean,
   *   hasUnsupportedEffect: boolean,
   *   blockedByRound1Reserve: boolean,
   *   canInspectOpponentReserve: boolean,
   *   searchedPiles: string[]
   * }}
   */
  _evaluateAbilityViability(ability, player, card) {
    if (!ability) {
      return {
        viable: false,
        hasSupportedTargets: false,
        hasUnsupportedEffect: false,
        blockedByRound1Reserve: false,
        canInspectOpponentReserve: false,
        searchedPiles: [],
      };
    }

    const condEval = ConditionEvaluator.evaluate(ability.conditions, {
      room: this.room,
      player,
      card,
    });
    if (!condEval.valid) {
      return {
        viable: false,
        hasSupportedTargets: false,
        hasUnsupportedEffect: false,
        blockedByRound1Reserve: false,
        canInspectOpponentReserve: false,
        searchedPiles: [],
      };
    }

    const effects = Array.isArray(ability.effects) ? ability.effects : [];
    if (effects.length === 0) {
      return {
        viable: false,
        hasSupportedTargets: false,
        hasUnsupportedEffect: false,
        blockedByRound1Reserve: false,
        canInspectOpponentReserve: false,
        searchedPiles: [],
      };
    }

    let hasSupportedTargets = false;
    let hasUnsupportedEffect = false;
    let blockedByRound1Reserve = false;
    let canInspectOpponentReserve = false;
    let searchedPiles = [];

    const UNMODELED_INSPECTION_ACTIONS = ["search", "look", "reveal", "look_and_choose"];

    for (const effect of effects) {
      const isSupported = AstEffectRunner.isActionSupported(effect.action);

      if (!isSupported) {
        if (!effect.target || UNMODELED_INSPECTION_ACTIONS.includes(effect.action)) {
          hasUnsupportedEffect = true;
          continue;
        }
        const unsupportedEligible = TargetSelectionService.resolveEligibleTargets(
          this.room,
          player,
          effect.target,
          { sourceCard: card, actionType: effect.action }
        );
        if (
          (unsupportedEligible.eligibleCardIds && unsupportedEligible.eligibleCardIds.length > 0) ||
          (unsupportedEligible.eligiblePiles && unsupportedEligible.eligiblePiles.length > 0)
        ) {
          hasUnsupportedEffect = true;
        }
        continue;
      }

      if (effect.action === AST_ACTIONS.DRAW) {
        hasSupportedTargets = true;
        continue;
      }

      if (
        !effect.target ||
        effect.target.selection_mode === "automatic_self" ||
        effect.target.selection_mode === "chained_target"
      ) {
        hasSupportedTargets = true;
        continue;
      }

      const eligible = TargetSelectionService.resolveEligibleTargets(
        this.room,
        player,
        effect.target,
        {
          sourceCard: card,
          actionType: effect.action,
          isOptional: Boolean(ability.is_optional),
        }
      );

      if (eligible.blockedByRound1Reserve) {
        blockedByRound1Reserve = true;
      }
      if (eligible.canInspectOpponentReserve) {
        canInspectOpponentReserve = true;
        if (Array.isArray(eligible.searchedPiles) && eligible.searchedPiles.length > 0) {
          searchedPiles = eligible.searchedPiles;
        }
      }

      const hasTargets =
        (Array.isArray(eligible.eligibleCardIds) && eligible.eligibleCardIds.length > 0) ||
        (Array.isArray(eligible.eligiblePiles) && eligible.eligiblePiles.length > 0);

      if (hasTargets) {
        hasSupportedTargets = true;
      }
    }

    return {
      viable: hasSupportedTargets || hasUnsupportedEffect || canInspectOpponentReserve,
      hasSupportedTargets,
      hasUnsupportedEffect,
      blockedByRound1Reserve,
      canInspectOpponentReserve,
      searchedPiles,
    };
  }

  /**
   * Formats a target scope array into a clean human-readable string (e.g. "discard or reserve").
   *
   * @private
   * @param {string[]} [scopeList] Array of AST scope strings.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.excludeInPlay=false] Whether to omit "in_play" from the output.
   * @returns {string} Formatted scope string.
   */
  _formatScopeText(scopeList, { excludeInPlay = false } = {}) {
    if (!Array.isArray(scopeList) || scopeList.length === 0) return "";
    const cleaned = scopeList
      .map((s) => String(s || "").replace(/_pile/g, "").replace(/_/g, " ").trim())
      .filter((s) => s && (!excludeInPlay || s !== "in play"));
    const unique = [...new Set(cleaned)];
    return unique.join(" or ");
  }

  /**
   * Pluralizes a simple English noun or phrase for count > 1 target labels.
   *
   * @private
   * @param {string} noun Singular noun or phrase.
   * @returns {string} Pluralized noun or phrase.
   */
  _pluralizeNoun(noun) {
    if (!noun) return "";
    const trimmed = noun.trim();
    if (trimmed.endsWith("s")) return trimmed;
    if (/hero$/i.test(trimmed)) return `${trimmed}es`;
    if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
    if (/(?:ch|sh|x|z)$/i.test(trimmed)) return `${trimmed}es`;
    return `${trimmed}s`;
  }

  /**
   * Formats a band target into a complete action phrase (e.g. "Band to a White Exodus hero"
   * or "Band to up to 3 O.T. Egyptians").
   *
   * @private
   * @param {object} [target] AST target definition.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.isQuestion=false] Whether to format for a question prompt.
   * @returns {string} Formatted band action phrase (without trailing question mark).
   */
  _formatBandActionText(target = {}, { isQuestion = false } = {}) {
    if (Array.isArray(target.card_titles) && target.card_titles.length > 0) {
      const prep = isQuestion ? "with" : "to";
      return `Band ${prep} ${target.card_titles.join(" or ")}`;
    }

    const countObj = target.count || {};
    const maxVal = countObj.max_value ?? countObj.fixed_value ?? 1;
    const minVal = countObj.min_value ?? countObj.fixed_value ?? 1;
    const isPlural = maxVal > 1;

    let countPrefix = "a";
    if (isPlural) {
      if (minVal === 0) {
        countPrefix = `up to ${maxVal}`;
      } else if (countObj.fixed_value > 1 || minVal === maxVal) {
        countPrefix = `${maxVal}`;
      } else {
        countPrefix = `${minVal}-${maxVal}`;
      }
    }

    const rawType = (target.target_type || "character").replace(/_/g, " ");
    const brigadeStr =
      Array.isArray(target.brigades) && target.brigades.length > 0 && target.brigades.length <= 2
        ? `${target.brigades.join("/")} `
        : "";
    const testStr =
      target.testament === "OT"
        ? "O.T. "
        : target.testament === "NT"
          ? "N.T. "
          : target.testament
            ? `${target.testament} `
            : "";
    const refStr =
      Array.isArray(target.references) && target.references.length > 0 && target.references.length <= 2
        ? `${target.references.join("/")} `
        : "";

    const idents = Array.isArray(target.identifiers) ? target.identifiers.filter(Boolean) : [];

    if (isPlural) {
      if (
        (rawType === "character" || rawType === "evil character") &&
        idents.length === 1 &&
        /^[A-Z]/.test(idents[0])
      ) {
        const pluralIdent = this._pluralizeNoun(idents[0]);
        const phrase = `${brigadeStr}${testStr}${refStr}${pluralIdent}`.trim();
        return `Band to ${countPrefix} ${phrase}`;
      }
      const idenStr = idents.length > 0 ? `${idents.join("/")} ` : "";
      const pluralType = this._pluralizeNoun(rawType);
      const phrase = `${brigadeStr}${testStr}${refStr}${idenStr}${pluralType}`.trim();
      return `Band to ${countPrefix} ${phrase}`;
    }

    const phrase = this._formatTargetPhrase(target, { isBand: true });
    if (phrase && phrase !== "character") {
      return `Band to a ${phrase}`;
    }
    return isQuestion ? "Band a character into battle" : "Band to a character";
  }

  /**
   * Formats target qualifiers (alignment, brigade, testament, references, identifier/type)
   * into a concise descriptor phrase.
   *
   * @private
   * @param {object} [target] AST target definition.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.isBand=false] Whether formatting for a band action.
   * @returns {string} Concise target phrase.
   */
  _formatTargetPhrase(target = {}, { isBand = false } = {}) {
    if (isBand && Array.isArray(target.card_titles) && target.card_titles.length > 0) {
      return target.card_titles.join(" or ");
    }

    const rawType = (target.target_type || (isBand ? "character" : "card")).replace(/_/g, " ");
    const brigadeStr =
      Array.isArray(target.brigades) && target.brigades.length > 0 && target.brigades.length <= 2
        ? `${target.brigades.join("/")} `
        : "";
    const testStr =
      target.testament === "OT"
        ? "O.T. "
        : target.testament === "NT"
          ? "N.T. "
          : target.testament
            ? `${target.testament} `
            : "";
    const refStr =
      Array.isArray(target.references) && target.references.length > 0 && target.references.length <= 2
        ? `${target.references.join("/")} `
        : "";

    if (isBand) {
      const idenStr =
        Array.isArray(target.identifiers) && target.identifiers.length > 0
          ? `${target.identifiers.join("/")} `
          : "";
      return `${brigadeStr}${testStr}${refStr}${idenStr}${rawType}`.trim();
    }

    const iden =
      Array.isArray(target.identifiers) && target.identifiers.length > 0
        ? target.identifiers[0].replace(/_/g, " ").toLowerCase()
        : "";
    const targetType = iden ? iden : rawType;
    const alignStr = target.alignment ? `${target.alignment} ` : "";
    return `${alignStr}${brigadeStr}${testStr}${refStr}${targetType}`.trim();
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
      case AST_ACTIONS.ADD_TO_BATTLE:
        return `${this._formatBandActionText(effect.target, { isQuestion: true })}?`;
      case AST_ACTIONS.TAKE: {
        const scope = this._formatScopeText(effect.target?.scope) || "Reserve";
        const phrase = this._formatTargetPhrase(effect.target);
        const countStr = count > 1 ? `${count} ` : "";
        return `Take ${countStr}${phrase} from ${scope}?`;
      }
      case AST_ACTIONS.TOPDECK: {
        const scope = this._formatScopeText(effect.target?.scope, { excludeInPlay: true });
        const scopeStr = scope ? ` from ${scope}` : "";
        const phrase = this._formatTargetPhrase(effect.target);
        return `Topdeck ${phrase}${scopeStr}?`;
      }
      case AST_ACTIONS.UNDERDECK: {
        const scope = this._formatScopeText(effect.target?.scope, { excludeInPlay: true });
        const scopeStr = scope ? ` from ${scope}` : "";
        const phrase = this._formatTargetPhrase(effect.target);
        return `Underdeck ${phrase}${scopeStr}?`;
      }
      case AST_ACTIONS.BOUNCE:
      case AST_ACTIONS.RETURN_TO_HAND: {
        const phrase = this._formatTargetPhrase(effect.target);
        return `Return ${phrase} to hand?`;
      }
      default:
        return `Activate ${cardName}'s optional ability?`;
    }
  }

  /**
   * Generates a descriptive, human-readable label for a choice ability.
   *
   * @param {object} ability AST ability node.
   * @param {object} card Card instance.
   * @returns {string} Human-readable option label.
   */
  _formatAbilityChoiceLabel(ability, card) {
    if (ability.description) return ability.description;
    const effect = ability.effects?.[0];
    if (!effect) return ability.ability_id || "Activate Ability";

    const action = effect.action;
    const target = effect.target || {};
    const phrase = this._formatTargetPhrase(target);
    const scope = this._formatScopeText(target.scope, { excludeInPlay: true });

    switch (action) {
      case AST_ACTIONS.TOPDECK:
        return `Topdeck ${phrase}${scope ? " from " + scope : ""}`;
      case AST_ACTIONS.UNDERDECK:
        return `Underdeck ${phrase}${scope ? " from " + scope : ""}`;
      case AST_ACTIONS.BOUNCE:
      case AST_ACTIONS.RETURN_TO_HAND:
        return `Return ${phrase} to hand`;
      case AST_ACTIONS.BANISH:
      case AST_ACTIONS.REMOVE_FROM_THE_GAME:
        return `Banish ${phrase}`;
      case AST_ACTIONS.DISCARD:
        return `Discard ${phrase}`;
      case AST_ACTIONS.DRAW: {
        const count = target.count?.fixed_value || effect.count?.fixed_value || 1;
        return `Draw ${count} card(s)`;
      }
      case AST_ACTIONS.TAKE: {
        const count = target.count?.fixed_value || effect.count?.fixed_value;
        const countStr = count && count > 1 ? `${count} ` : "";
        const takeScope = this._formatScopeText(target.scope);
        return `Take ${countStr}${phrase}${takeScope ? " from " + takeScope : ""}`;
      }
      case AST_ACTIONS.BAND:
      case AST_ACTIONS.ADD_TO_BATTLE:
        return this._formatBandActionText(target, { isQuestion: false });
      default: {
        const actLabel = action.charAt(0).toUpperCase() + action.slice(1);
        return `${actLabel} ${phrase}`;
      }
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
