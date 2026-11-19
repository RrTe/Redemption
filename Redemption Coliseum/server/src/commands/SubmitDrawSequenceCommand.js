// server/src/commands/SubmitDrawSequenceCommand.js
const { BaseCommand } = require("./BaseCommand");
const { DRAW_STEPS } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { CardAction } = require("../../../shared/actionSchema");
const { ZONES } = require("../../../shared/zones");
const { addAvailableAction } = require("../services/cardService");
const { DrawPhaseStepService } = require("../services/DrawPhaseStepService");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { EffectLabelFormatter } = require("../ast/EffectLabelFormatter");
const logger = require("../utils/logger");

class SubmitDrawSequenceCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.preDrawSequence = null;
    this.chronicleTx = null;
    this._undone = false;
  }

  execute(message) {
    const { step, orderedCardIds } = message || {};

    // 1. Verify that client currently holds priority
    if (this.client.sessionId !== this.state.priorityPlayerId) {
      logger.warn(
        `[SubmitDrawSequenceCommand] Client '${this.client.sessionId}' attempted to act without priority (Expected: '${this.state.priorityPlayerId}').`
      );
      return;
    }

    // 2. Verify matching sub-step
    if (step && step !== this.state.drawStep) {
      logger.warn(
        `[SubmitDrawSequenceCommand] Step mismatch. Client sent '${step}', server is at '${this.state.drawStep}'.`
      );
      return;
    }

    const player = this.state.players.get(this.client.sessionId);
    const playerName = player ? player.name : "Player";
    const currentStep = this.state.drawStep;
    const isStarStep = currentStep === DRAW_STEPS.ACTIVE_STARS || currentStep === DRAW_STEPS.OPPONENT_STARS;

    this.preDrawSequence = {
      drawStep: this.state.drawStep,
      priorityPlayerId: this.state.priorityPlayerId,
      activeSequenceCardIds: Array.from(this.state.activeSequenceCardIds || []),
      _drawSequencePlan: Array.isArray(this.room._drawSequencePlan) ? [...this.room._drawSequencePlan] : null,
      _drawSequenceIndex: this.room._drawSequenceIndex || 0,
      clearedActions: [],
      revealedStarCards: [],
    };

    // 3. Synchronize ordered card IDs and reveal confirmed cards for both players
    if (this.state.activeSequenceCardIds) {
      this.state.activeSequenceCardIds.splice(0, this.state.activeSequenceCardIds.length);
      if (Array.isArray(orderedCardIds)) {
        orderedCardIds.forEach(id => {
          this.state.activeSequenceCardIds.push(id);
          const card = this.room.cardLookup ? this.room.cardLookup.get(id) : null;
          if (card && isStarStep) {
            this.preDrawSequence.revealedStarCards.push({
              cardId: card.id,
              prevFaceUp: Boolean(card.isFaceUp),
              prevFaceDown: Boolean(card.isFaceDown),
            });
            card.isFaceUp = true;
            card.isFaceDown = false;
            // Synchronize revealed Star cards into all client StateViews
            if (this.state._clientViews) {
              this.state._clientViews.forEach((view) => {
                try {
                  view.add(card);
                } catch {
                  // Ignore if already added to view
                }
              });
            }
          }
        });
      }
    }

    // 5. Clean up temporary draw sequence actions for this player
    if (player) {
      if (isStarStep && player.hand) {
        player.hand.forEach(card => {
          if (card.availableActions && card.availableActions.length > 0) {
            const removed = [];
            for (let i = card.availableActions.length - 1; i >= 0; i--) {
              const a = card.availableActions[i];
              if (
                a.type === ActionType.ACTIVATE_STAR_ABILITY ||
                (a.type === ActionType.ACTIVATE_ABILITY && card.Class && card.Class.includes("Star"))
              ) {
                removed.push({ id: a.id, type: a.type, description: a.description, isMandatory: Boolean(a.isMandatory) });
                card.availableActions.splice(i, 1);
              }
            }
            if (removed.length > 0) {
              this.preDrawSequence.clearedActions.push({ cardId: card.id, actions: removed });
            }
          }
        });
      } else if (!isStarStep) {
        const landOfBondage = player[ZONES.LAND_OF_BONDAGE] || player.landOfBondage || [];
        landOfBondage.forEach(card => {
          if (card.availableActions && card.availableActions.length > 0) {
            const removed = [];
            for (let i = card.availableActions.length - 1; i >= 0; i--) {
              const a = card.availableActions[i];
              if (a.type === ActionType.ACTIVATE_ABILITY) {
                removed.push({ id: a.id, type: a.type, description: a.description, isMandatory: Boolean(a.isMandatory) });
                card.availableActions.splice(i, 1);
              }
            }
            if (removed.length > 0) {
              this.preDrawSequence.clearedActions.push({ cardId: card.id, actions: removed });
            }
          }
        });
      }
    }

    // 6. Enqueue into Effect Chronicle if cards were selected, otherwise pass and advance immediately
    const tx = ChronicleRollbackService.beginTransaction(this.room, { command: "SubmitDrawSequenceCommand" });
    try {
      if (Array.isArray(orderedCardIds) && orderedCardIds.length > 0) {
        const cardsToEnqueue = orderedCardIds
          .map(id => (this.room.cardLookup ? this.room.cardLookup.get(id) : null))
          .filter(Boolean);

        const actionType = isStarStep ? ActionType.ACTIVATE_STAR_ABILITY : ActionType.ACTIVATE_ABILITY;
        const queueDescriptors = this._buildSequenceQueueDescriptors(cardsToEnqueue, actionType, isStarStep);

        EffectChronicleService.enqueueCards(
          this.room,
          queueDescriptors,
          this.client.sessionId,
          actionType,
          {
            autoExecuteSupported: true,
            isDeclared: isStarStep,
            isConfirmed: isStarStep,
            accepted: isStarStep,
            onComplete: room => {
              DrawPhaseStepService.advanceStep(room);
            },
          }
        );
      } else {
        const typeLabel = isStarStep ? "Star cards" : "Lost Souls";
        this.room.broadcastGameLog(`${playerName} passes on ${typeLabel}.`);
        DrawPhaseStepService.advanceStep(this.room);
      }
      this.canUndo = true;
    } finally {
      this.chronicleTx = ChronicleRollbackService.endTransaction(this.room, tx);
    }
  }

  /**
   * Expands selected Star/Lost Soul cards with AST logic into per-effect-step queue items,
   * preserving single-item tabletop fallback for cards without AST logic.
   *
   * @private
   */
  _buildSequenceQueueDescriptors(cards, actionType, isStarStep) {
    const queueDescriptors = [];
    const timestamp = Date.now();

    for (let cIdx = 0; cIdx < cards.length; cIdx++) {
      const card = cards[cIdx];
      const hasLogic = Boolean(card.templateId && AbilityLookup.hasLogic(card.templateId));
      if (hasLogic) {
        const abilities = AbilityLookup.resolveAbilities(card.templateId, {
          actionType,
          inGameType: card.inGameType,
          inGameAlignment: card.inGameAlignment,
          isStarCard: card.IsStarCard,
          card,
        });
        if (abilities.length > 0) {
          for (let aIdx = 0; aIdx < abilities.length; aIdx++) {
            const ab = abilities[aIdx];
            const sorted = Array.isArray(ab.effects)
              ? [...ab.effects].sort((a, b) => (a.step || 1) - (b.step || 1))
              : [];
            if (sorted.length > 0) {
              const groupId = `grp_${timestamp}_${cIdx}_${aIdx}_${card.id}`;
              for (let sIdx = 0; sIdx < sorted.length; sIdx++) {
                queueDescriptors.push({
                  card,
                  abilityId: ab.ability_id || "",
                  effectStepIndex: sIdx,
                  effectLabel: EffectLabelFormatter.formatSingleEffectLabel(sorted[sIdx], card),
                  isOptional: isStarStep ? false : (sIdx === 0 ? Boolean(ab.is_optional) : false),
                  abilityGroupId: groupId,
                });
              }
            } else {
              queueDescriptors.push({
                card,
                abilityId: ab.ability_id || "",
                effectStepIndex: -1,
                effectLabel: EffectLabelFormatter.formatTabletopFallbackLabel(card, actionType),
              });
            }
          }
          continue;
        }
      }

      queueDescriptors.push({
        card,
        abilityId: "",
        effectStepIndex: -1,
        effectLabel: EffectLabelFormatter.formatTabletopFallbackLabel(card, actionType),
      });
    }

    return queueDescriptors;
  }

  /**
   * Reverts draw sequence submission, auto-executed Star/Soul effects, and draw-step transitions.
   */
  undo() {
    if (this._undone || !this.preDrawSequence) return;
    this._undone = true;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (this.chronicleTx) {
      ChronicleRollbackService.rollbackTransaction(this.room, this.chronicleTx, player, {
        reprompt: false,
      });
    }

    if (!this.room.state?.effectChronicle?.items?.length) {
      this.room._chronicleOnComplete = null;
    }

    this.room._drawSequencePlan = this.preDrawSequence._drawSequencePlan
      ? [...this.preDrawSequence._drawSequencePlan]
      : null;
    this.room._drawSequenceIndex = this.preDrawSequence._drawSequenceIndex;
    this.state.drawStep = this.preDrawSequence.drawStep;
    this.state.priorityPlayerId = this.preDrawSequence.priorityPlayerId;

    if (this.state.activeSequenceCardIds) {
      this.state.activeSequenceCardIds.splice(0, this.state.activeSequenceCardIds.length);
      for (const id of this.preDrawSequence.activeSequenceCardIds) {
        this.state.activeSequenceCardIds.push(id);
      }
    }

    for (const rev of this.preDrawSequence.revealedStarCards) {
      const card = this.room.cardLookup?.get(rev.cardId);
      if (card) {
        card.isFaceUp = rev.prevFaceUp;
        card.isFaceDown = rev.prevFaceDown;
      }
    }

    for (const entry of this.preDrawSequence.clearedActions) {
      const card = this.room.cardLookup?.get(entry.cardId);
      if (!card) continue;
      for (const act of entry.actions) {
        const restored = new CardAction();
        restored.id = act.id;
        restored.type = act.type;
        restored.description = act.description;
        restored.isMandatory = Boolean(act.isMandatory);
        addAvailableAction(this.state, card, restored);
      }
    }

    if (typeof this.room.broadcastGameLog === "function") {
      this.room.broadcastGameLog(`[UNDO] ${player.name} reverted draw sequence selection.`);
    }
  }
}

module.exports = { SubmitDrawSequenceCommand };

