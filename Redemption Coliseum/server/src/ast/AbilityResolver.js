// server/src/ast/AbilityResolver.js
const { AbilityLookup } = require("./AbilityLookup");
const { ConditionEvaluator } = require("./ConditionEvaluator");
const { AstEffectRunner } = require("./AstEffectRunner");
const { TargetSelectionService } = require("./TargetSelectionService");
const { parseTargetCount } = require("./TargetCountResolver");
const { EffectLabelFormatter } = require("./EffectLabelFormatter");
const { ActionTelegraphService } = require("../services/ActionTelegraphService");
const { AST_MESSAGES, AST_ACTIONS, AST_SELECTION_MODES } = require("../../../shared/astConstants");
const { ActionType } = require("../../../shared/actions");
const { ZONES } = require("../../../shared/zones");
const { formatCardLink } = require("../utils/gameLogFormatter");
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
    if (!card) {
      logger.info(
        `[AbilityResolver] Card not found for cardId '${item.cardId}'. Triggering fallback.`
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
        logEntries: [`${player.name} chooses not to activate ${formatCardLink(card)}.`],
      };
    }

    const templateId = card.templateId;
    const hasLogic = Boolean(templateId && AbilityLookup.hasLogic(templateId));

    // 2. Resolve side-specific abilities if AST logic exists
    let targetAbility = null;
    let firstEffect = null;
    let resolvedAbilitiesList = [];
    let isChoiceGroup = false;
    let isParentAbilityId = false;

    if (hasLogic) {
      const abilities = AbilityLookup.resolveAbilities(templateId, {
        actionType: item.actionType,
        inGameType: card.inGameType,
        inGameAlignment: card.inGameAlignment,
      });
      resolvedAbilitiesList = abilities;

      if (abilities.length > 0) {
        // Choice Group support: prompt player to select between multiple effects (e.g. "Choose One")
        const matchedAbility = item.abilityId
          ? abilities.find((a) => a.ability_id === item.abilityId)
          : (item._choiceGroup
            ? abilities.find((a) => a?.choice_group === item._choiceGroup)
            : abilities.find((a) => Boolean(a?.choice_group)));
        const choiceGroup = matchedAbility?.choice_group;
        const choiceAbilities = choiceGroup
          ? abilities.filter((a) => a.choice_group === choiceGroup)
          : [];
        isChoiceGroup = choiceAbilities.length > 1;
        isParentAbilityId = Boolean(
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

        const evalResult =
          typeof item.effectStepIndex === "number" && item.effectStepIndex > 0
            ? { valid: true }
            : ConditionEvaluator.evaluate(targetAbility.conditions, {
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
      (!targetAbility || (!item.abilityId && (!firstEffect || !AstEffectRunner._handlers[firstEffect.action]))) &&
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

    const hasExplicitStep = typeof item.effectStepIndex === "number" && item.effectStepIndex >= 0;
    const sortedForViability = Array.isArray(targetAbility?.effects)
      ? [...targetAbility.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
      : [];
    const stepEffectForViability = hasExplicitStep ? sortedForViability[item.effectStepIndex] || null : null;

    if (targetAbility && !isResumingStep) {
      const targetViability = this._evaluateAbilityViability(targetAbility, player, card, {
        stepEffect: stepEffectForViability,
      });
      const anyCardAbilityViable =
        resolvedAbilitiesList.length > 0
          ? resolvedAbilitiesList.some((a) => this._evaluateAbilityViability(a, player, card).viable)
          : targetViability.viable;
      const hasExplicitSingleAbility = Boolean(item.abilityId && !isChoiceGroup && !isParentAbilityId);

      if (!targetViability.viable && (hasExplicitSingleAbility || !anyCardAbilityViable || isChoiceGroup)) {
        return this._handleNoValidTargets(player, card, item, targetAbility);
      }
    }

    // 3. Optional ability confirmation check (both AST and Tabletop)
    const isStarActivation =
      item.actionType === "ACTIVATE_STAR_ABILITY" ||
      item.actionType === ActionType?.ACTIVATE_STAR_ABILITY ||
      Boolean(item.isDeclared) ||
      Boolean(options.isDeclared) ||
      Boolean(targetAbility?.is_star);

    const isAlreadyAccepted =
      Boolean(item.isConfirmed || item.accepted || item.isDeclared || options.accepted === true || options.isDeclared);
    if (options.accepted === true || options.isDeclared || item.isDeclared) {
      item.isConfirmed = true;
    }
    const isStepAfterFirst = typeof item.effectStepIndex === "number" && item.effectStepIndex > 0;
    const isOptional = !isStepAfterFirst && Boolean(targetAbility?.is_optional || item.isOptional) && !isAlreadyAccepted;

    if (isOptional && options.accepted === undefined && !isStarActivation) {
      const promptEffect = stepEffectForViability || firstEffect;
      this._sendOptionalPrompt(player, card, item, targetAbility, promptEffect, isFallbackBand);
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

    // 5. Single-step or multi-step interactive targeting and execution loop
    const sortedEffects = Array.isArray(targetAbility.effects)
      ? [...targetAbility.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
      : [];

    if (sortedEffects.length === 0) {
      return { handled: false, reason: "EMPTY_EFFECTS" };
    }

    if (hasExplicitStep && item.effectStepIndex >= sortedEffects.length) {
      return { handled: true, snapshots: [], logEntries: [] };
    }

    if (!Array.isArray(item._accumulatedSnapshots)) item._accumulatedSnapshots = [];
    if (!Array.isArray(item._accumulatedLogs)) item._accumulatedLogs = [];
    const startStepIdx = hasExplicitStep
      ? item.effectStepIndex
      : (typeof item._currentStepIndex === "number" ? item._currentStepIndex : 0);
    const endStepIdx = hasExplicitStep ? item.effectStepIndex + 1 : sortedEffects.length;
    let stepOptions = { ...options };

    if (!item._previousSnapshot && item._abilityGroupId && this.room._abilityGroupLastSnapshot) {
      const groupSnap = this.room._abilityGroupLastSnapshot.get(item._abilityGroupId);
      if (groupSnap) {
        item._previousSnapshot = groupSnap;
      }
    }

    for (let stepIdx = startStepIdx; stepIdx < endStepIdx; stepIdx++) {
      item._currentStepIndex = stepIdx;
      const currentEffect = sortedEffects[stepIdx];
      const isSupportedAction = Boolean(
        currentEffect && AstEffectRunner._handlers[currentEffect.action]
      );

      if (!isSupportedAction) {
        if (stepIdx === 0 || hasExplicitStep) {
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
          this._sendReserveInspectPrompt(player, card, item, targetAbility, eligible);
          return {
            handled: true,
            awaitingTargetSelection: true,
            eligible,
          };
        }

        const isAutoTarget = this._shouldAutoTarget(currentEffect, eligible, targetAbility, item, stepIdx, isFallbackBand);

        if (eligible.requiresSelection && !isAutoTarget) {
          this._flushAccumulatedLogs(item);
          this._sendTargetSelectionPrompt(player, card, item, targetAbility, currentEffect, eligible, stepIdx);
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
        if (item._abilityGroupId) {
          if (!this.room._abilityGroupLastSnapshot) {
            this.room._abilityGroupLastSnapshot = new Map();
          }
          this.room._abilityGroupLastSnapshot.set(item._abilityGroupId, stepResult.snapshot);
        }
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

    if (card && this._isCostOrOpponentChoiceAbility(targetAbility)) {
      const movedAny = finalSnapshots.some(
        (s) => (s?.movedCards?.length || 0) > 0 || (s?.discardedCards?.length || 0) > 0
      );
      if (item._abilityGroupId) {
        if (!this.room._abilityGroupMovedAny) {
          this.room._abilityGroupMovedAny = new Map();
        }
        const prevGroupMoved = Boolean(this.room._abilityGroupMovedAny.get(item._abilityGroupId));
        const combinedMoved = prevGroupMoved || movedAny;
        this.room._abilityGroupMovedAny.set(item._abilityGroupId, combinedMoved);
        const isLastStep = !hasExplicitStep || item.effectStepIndex >= sortedEffects.length - 1;
        if (isLastStep) {
          this._updateCostPaidFlag(card, combinedMoved);
        }
      } else {
        this._updateCostPaidFlag(card, movedAny);
      }
    }

    return {
      handled: true,
      snapshots: finalSnapshots,
      logEntries: finalLogs,
    };
  }

  /**
   * Re-emits the pending interactive prompt (Choice, Optional, Target Selection, or Special Initiative)
   * for a restored ChronicleItem after an Undo rollback without executing effects.
   *
   * @param {object} item Restored ChronicleItem at the head of the queue.
   * @returns {{ reprompted: boolean, kind?: string }} Re-prompt outcome.
   */
  repromptItem(item) {
    if (!item) return { reprompted: false };
    const chronicle = this.room?.state?.effectChronicle;

    if (item.pendingSpecialInitiative) {
      const psi = item.pendingSpecialInitiative;
      if (chronicle && psi.targetOwnerId) {
        chronicle.priorityPlayerId = psi.targetOwnerId;
      }
      if (this.room.state?.battle && psi.targetOwnerId) {
        this.room.state.battle.specialInitiativePlayerId = psi.targetOwnerId;
      }
      this.room._pendingSpecialInitiativeItem = item;
      if (item.cardId) {
        ActionTelegraphService.send(this.room, {
          sourceCardId: item.cardId,
          targetCardIds: psi.targetCardIds || (psi.targetCardId ? [psi.targetCardId] : []),
          isSpecialInitiative: true,
          persistent: true,
        });
      }
      return { reprompted: true, kind: "special_initiative" };
    }

    const card = this.room?.cardLookup?.get(item.cardId);
    const player = this.room?.state?.players?.get(item.controllerId);
    if (!card || !player) return { reprompted: false };

    const templateId = card.templateId;
    const hasLogic = Boolean(templateId && AbilityLookup.hasLogic(templateId));
    const fallbackBand = AbilityResolver.getFallbackBandAbility(card);
    let targetAbility = null;
    let firstEffect = null;
    let isChoiceGroup = false;
    let isParentAbilityId = false;

    if (hasLogic) {
      const abilities = AbilityLookup.resolveAbilities(templateId, {
        actionType: item.actionType,
        inGameType: card.inGameType,
        inGameAlignment: card.inGameAlignment,
      });
      if (abilities.length > 0) {
        const matchedAbility = item.abilityId
          ? abilities.find((a) => a.ability_id === item.abilityId)
          : (item._choiceGroup
            ? abilities.find((a) => a?.choice_group === item._choiceGroup)
            : abilities.find((a) => Boolean(a?.choice_group)));
        const choiceGroup = matchedAbility?.choice_group;
        const choiceAbilities = choiceGroup ? abilities.filter((a) => a.choice_group === choiceGroup) : [];
        isChoiceGroup = choiceAbilities.length > 1;
        isParentAbilityId = Boolean(
          item.abilityId && choiceAbilities.some((a) => a.parent_ability_id === item.abilityId)
        );

        if (isChoiceGroup && (!item.abilityId || isParentAbilityId)) {
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
            };
          });
          if (chronicle) chronicle.priorityPlayerId = item.controllerId;
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
              choices: evaluatedChoices,
            });
          }
          return { reprompted: true, kind: "choice" };
        }

        targetAbility = (item.abilityId && abilities.find((a) => a.ability_id === item.abilityId)) || abilities[0];
        firstEffect = targetAbility?.effects?.[0] || null;
      }
    }

    const isBattleContext =
      card.zone === ZONES.BATTLEFIELD ||
      item.actionType === ActionType.RESCUE_ATTEMPT ||
      item.actionType === ActionType.BLOCK_RESCUE;
    if (
      (!targetAbility || (!item.abilityId && (!firstEffect || !AstEffectRunner._handlers[firstEffect.action]))) &&
      isBattleContext &&
      fallbackBand
    ) {
      targetAbility = fallbackBand;
      firstEffect = fallbackBand.effects[0];
    }

    const isFallbackBand = targetAbility?.ability_id === "fallback_band";
    const isStarActivation =
      item.actionType === "ACTIVATE_STAR_ABILITY" ||
      item.actionType === ActionType?.ACTIVATE_STAR_ABILITY ||
      Boolean(item.isDeclared) ||
      Boolean(targetAbility?.is_star);
    const isStepAfterFirst = typeof item.effectStepIndex === "number" && item.effectStepIndex > 0;
    const isAlreadyConfirmed = Boolean(item.isConfirmed || item.accepted || item.isDeclared);
    const isOptional = !isStepAfterFirst && Boolean(targetAbility?.is_optional || item.isOptional) && !isAlreadyConfirmed;

    const sortedEffects = Array.isArray(targetAbility?.effects)
      ? [...targetAbility.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
      : [];
    const stepIdx = typeof item.effectStepIndex === "number" && item.effectStepIndex >= 0
      ? item.effectStepIndex
      : (typeof item._currentStepIndex === "number" ? item._currentStepIndex : 0);
    const activeEffect = sortedEffects[stepIdx] || firstEffect;

    if (isOptional && !isStarActivation) {
      if (chronicle) chronicle.priorityPlayerId = item.controllerId;
      this._sendOptionalPrompt(player, card, item, targetAbility, activeEffect, isFallbackBand);
      return { reprompted: true, kind: "optional" };
    }

    if (activeEffect && AstEffectRunner._handlers[activeEffect.action] && activeEffect.target) {
      const isChainedOrSelf =
        activeEffect.target.selection_mode === "chained_target" ||
        activeEffect.target.selection_mode === "automatic_self";
      if (!isChainedOrSelf) {
        const eligible = TargetSelectionService.resolveEligibleTargets(
          this.room,
          player,
          activeEffect.target,
          {
            sourceCard: card,
            actionType: activeEffect.action,
            isOptional: Boolean((targetAbility?.is_optional || item.isOptional) && stepIdx === 0),
          }
        );

        if (eligible.eligibleCardIds.length === 0 && eligible.canInspectOpponentReserve) {
          this._sendReserveInspectPrompt(player, card, item, targetAbility, eligible);
          return { reprompted: true, kind: "target" };
        }

        const isAutoTarget = this._shouldAutoTarget(activeEffect, eligible, targetAbility || {}, item, stepIdx, isFallbackBand);
        if (eligible.requiresSelection && !isAutoTarget) {
          this._sendTargetSelectionPrompt(player, card, item, targetAbility || {}, activeEffect, eligible, stepIdx);
          return { reprompted: true, kind: "target" };
        }
      }
    }

    if (chronicle) chronicle.priorityPlayerId = item.controllerId;
    return { reprompted: false };
  }

  /** @private */
  _updateCostPaidFlag(card, newValue) {
    const prevValue = Boolean(card._lastCostPaid);
    if (prevValue !== Boolean(newValue) && this.room?._undoTxStack?.length > 0) {
      const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
      ChronicleRollbackService.recordCostPaidChange(this.room, card.id, prevValue);
    }
    card._lastCostPaid = Boolean(newValue);
  }

  /** @private */
  _shouldAutoTarget(currentEffect, eligible, targetAbility, item, stepIdx, isFallbackBand) {
    const isBandAction =
      currentEffect.action === AST_ACTIONS.BAND ||
      currentEffect.action === AST_ACTIONS.ADD_TO_BATTLE;
    const { isSingleTarget: isOriginalSingleTarget } = parseTargetCount(currentEffect.target);

    const isAutoBandSingleChoice =
      isBandAction &&
      !isFallbackBand &&
      !currentEffect.target?.can_cancel &&
      currentEffect.target?.count?.min_value !== 0 &&
      eligible.minTargets === 1 &&
      eligible.maxTargets === 1 &&
      eligible.eligibleCardIds.length === 1 &&
      isOriginalSingleTarget;

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

    return isAutoBandSingleChoice || isExactMandatoryChoice;
  }

  /** @private */
  _sendOptionalPrompt(player, card, item, targetAbility, promptEffect, isFallbackBand) {
    const promptText = promptEffect && !isFallbackBand
      ? this._getOptionalPromptText(promptEffect, card, item)
      : `Activate the special ability of ${card.Name || item.title}?`;

    if (promptEffect?.target && card?.id && !isFallbackBand) {
      const eligiblePreview = TargetSelectionService.resolveEligibleTargets(
        this.room,
        player,
        promptEffect.target,
        { sourceCard: card, actionType: promptEffect.action }
      );
      if (eligiblePreview.eligibleCardIds?.length > 0) {
        const actingClient = this.room.clients?.find((c) => c.sessionId === player.sessionId);
        if (actingClient && typeof actingClient.send === "function") {
          actingClient.send(AST_MESSAGES.ACTION_TELEGRAPH, {
            sourceCardId: card.id,
            targetCardIds: eligiblePreview.eligibleCardIds,
            action: promptEffect.action,
            persistent: true,
          });
        }
      }
    }

    const isSupportedEffect = Boolean(
      promptEffect &&
      !isFallbackBand &&
      AstEffectRunner._handlers[promptEffect.action]
    );
    const singleAbilityChoices =
      isSupportedEffect && targetAbility
        ? [
          {
            abilityId: targetAbility.ability_id,
            label: EffectLabelFormatter.formatSingleEffectLabel(promptEffect, card),
            action: promptEffect.action,
            disabled: false,
          },
        ]
        : undefined;

    const client = this.room.clients?.find((c) => c.sessionId === player.sessionId);
    if (client && typeof client.send === "function") {
      client.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
        abilityId: targetAbility?.ability_id || item.abilityId || "",
        itemId: item.id,
        cardId: card.id || item.cardId,
        cardTitle: card.Name || item.title,
        promptText,
        action: promptEffect?.action || "activate",
        choices: singleAbilityChoices,
        cardImageFile: card.ImageFile || "",
        templateId: card.templateId || "",
      });
    }
  }

  /** @private */
  _sendReserveInspectPrompt(player, card, item, targetAbility, eligible) {
    const client = this.room.clients?.find((c) => c.sessionId === player.sessionId);
    if (client && typeof client.send === "function") {
      client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
        abilityId: targetAbility?.ability_id || "",
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
  }

  /** @private */
  _sendTargetSelectionPrompt(player, card, item, targetAbility, currentEffect, eligible, stepIdx) {
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
        ? Boolean(currentEffect.target?.can_cancel || (targetAbility.is_optional && stepIdx === 0))
        : Boolean(
          eligible.canCancel ||
          ((targetAbility.is_optional || item.isOptional) && stepIdx === 0)
        );
      targetClient.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
        abilityId: targetAbility.ability_id || item.abilityId || "",
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
   * Returns true if an ability acts as a cost or opponent-choice cost (e.g. Judith's manual_opponent banish).
   *
   * @private
   */
  _isCostOrOpponentChoiceAbility(ability) {
    if (!ability) return false;
    if (Array.isArray(ability.costs) && ability.costs.length > 0) return true;
    return Array.isArray(ability.effects)
      ? ability.effects.some((e) => e?.target?.selection_mode === AST_SELECTION_MODES.MANUAL_OPPONENT)
      : false;
  }

  /**
   * Emits a "No valid targets." toast to the acting player and returns a completed result.
   *
   * @private
   * @param {object} player Acting player.
   * @param {object} card Card instance.
   * @param {object} item Chronicle item.
   * @param {object|null} [targetAbility=null] Resolved AST ability.
   * @returns {{ handled: boolean, noValidTargets: boolean, snapshots: object[], logEntries: string[] }}
   */
  _handleNoValidTargets(player, card, item, targetAbility = null) {
    if (card && this._isCostOrOpponentChoiceAbility(targetAbility)) {
      this._updateCostPaidFlag(card, false);
    }
    const cardTitle = card?.Name || item?.title || "Card";
    const logTarget = card ? formatCardLink(card) : cardTitle;
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
      logEntries: [`${player.name}'s ${logTarget} has no valid targets.`],
    };
  }

  /**
   * Evaluates whether an AST ability or specific effect step has viable targets or inspectable opponent zone.
   *
   * @private
   * @param {object} ability AST ability definition.
   * @param {object} player Acting player.
   * @param {object} card Source card instance.
   * @param {object} [options={}] Optional evaluation scope (`stepEffect`).
   * @returns {{
   *   viable: boolean,
   *   hasSupportedTargets: boolean,
   *   hasUnsupportedEffect: boolean,
   *   blockedByRound1Reserve: boolean,
   *   canInspectOpponentReserve: boolean,
   *   searchedPiles: string[]
   * }}
   */
  _evaluateAbilityViability(ability, player, card, options = {}) {
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

    if (!options.stepEffect) {
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
    }

    const effects = options.stepEffect
      ? [options.stepEffect]
      : (Array.isArray(ability.effects) ? ability.effects : []);
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

  _formatBandActionText(target = {}, options = { isQuestion: false }) {
    return EffectLabelFormatter.formatBandActionText(target, options);
  }

  _formatTargetPhrase(target = {}, options = { isBand: false }) {
    return EffectLabelFormatter.formatTargetPhrase(target, options);
  }

  _getOptionalPromptText(effect, card, item) {
    return EffectLabelFormatter.formatOptionalPromptText(effect, card, item);
  }

  _formatAbilityChoiceLabel(ability, card) {
    return EffectLabelFormatter.formatAbilityChoiceLabel(ability, card);
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
