// server/src/commands/SubmitDrawSequenceCommand.js
const { BaseCommand } = require("./BaseCommand");
const { DRAW_STEPS } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { ZONES } = require("../../../shared/zones");
const { DrawPhaseStepService } = require("../services/DrawPhaseStepService");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const logger = require("../utils/logger");

class SubmitDrawSequenceCommand extends BaseCommand {
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

    // 3. Synchronize ordered card IDs and reveal confirmed cards for both players
    if (this.state.activeSequenceCardIds) {
      this.state.activeSequenceCardIds.splice(0, this.state.activeSequenceCardIds.length);
      if (Array.isArray(orderedCardIds)) {
        orderedCardIds.forEach(id => {
          this.state.activeSequenceCardIds.push(id);
          const card = this.room.cardLookup ? this.room.cardLookup.get(id) : null;
          if (card && isStarStep) {
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
            for (let i = card.availableActions.length - 1; i >= 0; i--) {
              const a = card.availableActions[i];
              if (
                a.type === ActionType.ACTIVATE_STAR_ABILITY ||
                (a.type === ActionType.ACTIVATE_ABILITY && card.Class && card.Class.includes("Star"))
              ) {
                card.availableActions.splice(i, 1);
              }
            }
          }
        });
      } else if (!isStarStep) {
        const landOfBondage = player[ZONES.LAND_OF_BONDAGE] || player.landOfBondage || [];
        landOfBondage.forEach(card => {
          if (card.availableActions && card.availableActions.length > 0) {
            for (let i = card.availableActions.length - 1; i >= 0; i--) {
              if (card.availableActions[i].type === ActionType.ACTIVATE_ABILITY) {
                card.availableActions.splice(i, 1);
              }
            }
          }
        });
      }
    }

    // 6. Enqueue into Effect Chronicle if cards were selected, otherwise pass and advance immediately
    if (Array.isArray(orderedCardIds) && orderedCardIds.length > 0) {
      const cardsToEnqueue = orderedCardIds
        .map(id => (this.room.cardLookup ? this.room.cardLookup.get(id) : null))
        .filter(Boolean);

      const actionType = isStarStep ? ActionType.ACTIVATE_STAR_ABILITY : ActionType.ACTIVATE_ABILITY;

      EffectChronicleService.enqueueCards(
        this.room,
        cardsToEnqueue,
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
  }
}

module.exports = { SubmitDrawSequenceCommand };

