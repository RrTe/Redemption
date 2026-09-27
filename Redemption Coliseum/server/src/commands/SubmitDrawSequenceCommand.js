// server/src/commands/SubmitDrawSequenceCommand.js
const { BaseCommand } = require("./BaseCommand");
const { DRAW_STEPS } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { ZONES } = require("../../../shared/zones");
const { DrawPhaseStepService } = require("../services/DrawPhaseStepService");
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
    const revealedStarCards = [];

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

            revealedStarCards.push({
              id: card.id,
              Name: card.Name,
              ImageFile: card.ImageFile,
              Type: card.Type,
              Brigade: card.Brigade,
              Strength: card.Strength,
              Toughness: card.Toughness,
              Class: card.Class,
              SpecialAbility: card.SpecialAbility,
              zone: card.zone,
              isFaceUp: true,
              isFaceDown: false,
              controllerId: card.controllerId,
              originalOwnerId: card.originalOwnerId,
            });
          }
        });
      }
    }

    // 4. Broadcast revealed Star cards for all players to see
    if (isStarStep && revealedStarCards.length > 0 && typeof this.room.broadcast === "function") {
      this.room.broadcast("starCardsRevealed", {
        playerName,
        sessionId: this.client.sessionId,
        cards: revealedStarCards,
      });
    }

    // 5. Log actions in submitted order
    if (Array.isArray(orderedCardIds) && orderedCardIds.length > 0) {
      orderedCardIds.forEach((cardId, index) => {
        const card = this.room.cardLookup ? this.room.cardLookup.get(cardId) : null;
        const cardName = card ? card.Name : "Card";

        if (isStarStep) {
          this.room.broadcastGameLog(
            `${playerName} reveals and activates Star card '${cardName}' (#${index + 1}).`
          );
        } else {
          this.room.broadcastGameLog(
            `${playerName} activates Lost Soul '${cardName}' (#${index + 1}).`
          );
        }
      });
    } else {
      const typeLabel = isStarStep ? "Star cards" : "Lost Souls";
      this.room.broadcastGameLog(`${playerName} passes on ${typeLabel}.`);
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

    // 6. Advance to next sub-step
    DrawPhaseStepService.advanceStep(this.room);
  }
}

module.exports = { SubmitDrawSequenceCommand };
