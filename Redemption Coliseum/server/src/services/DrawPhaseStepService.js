// server/src/services/DrawPhaseStepService.js
const logger = require("../utils/logger");
const { DRAW_STEPS } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { ZONES } = require("../../../shared/zones");

/**
 * Service to orchestrate the sequential resolution flow for Star Cards
 * and Lost Souls during the Draw Phase.
 */
class DrawPhaseStepService {
  /**
   * Starts the 4-step sequence for initial game setup (Turn 1 / game start).
   * Sequence: ACTIVE_STARS -> OPPONENT_STARS -> ACTIVE_SOULS -> OPPONENT_SOULS -> COMPLETED.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static startInitialSequence(room) {
    room._drawSequencePlan = [
      DRAW_STEPS.ACTIVE_STARS,
      DRAW_STEPS.OPPONENT_STARS,
      DRAW_STEPS.ACTIVE_SOULS,
      DRAW_STEPS.OPPONENT_SOULS,
    ];
    room._drawSequenceIndex = 0;
    this._executeCurrentStep(room);
  }

  /**
   * Starts the 2-step sequence for regular turns.
   * Sequence: ACTIVE_STARS -> ACTIVE_SOULS -> COMPLETED.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static startTurnDrawSequence(room) {
    room._drawSequencePlan = [
      DRAW_STEPS.ACTIVE_STARS,
      DRAW_STEPS.ACTIVE_SOULS,
    ];
    room._drawSequenceIndex = 0;
    this._executeCurrentStep(room);
  }

  /**
   * Advances to the next sub-step in the planned sequence.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static advanceStep(room) {
    if (room.state.activeSequenceCardIds) {
      room.state.activeSequenceCardIds.splice(0, room.state.activeSequenceCardIds.length);
    }

    if (!room._drawSequencePlan) {
      this._completeSequence(room);
      return;
    }

    room._drawSequenceIndex = (room._drawSequenceIndex || 0) + 1;
    if (room._drawSequenceIndex >= room._drawSequencePlan.length) {
      this._completeSequence(room);
    } else {
      this._executeCurrentStep(room);
    }
  }

  /**
   * Internal runner for the current sub-step. Automatically skips if player has 0 eligible cards.
   * @private
   */
  static _executeCurrentStep(room) {
    const step = room._drawSequencePlan[room._drawSequenceIndex];
    const targetPlayerId = this._getTargetPlayerId(room, step);
    const player = targetPlayerId ? room.state.players.get(targetPlayerId) : null;

    if (!player) {
      logger.warn(`[DrawPhaseStepService] Player not found for step '${step}'. Advancing.`);
      this.advanceStep(room);
      return;
    }

    const eligibleCards = this.getEligibleCards(room, step, player);

    // Auto-skip if player has no actionable cards
    if (eligibleCards.length === 0) {
      logger.debug(`[DrawPhaseStepService] Player ${player.name} (${targetPlayerId}) has 0 cards for '${step}'. Auto-skipping.`);
      this.advanceStep(room);
      return;
    }

    // Set state for active sub-step
    room.state.drawStep = step;
    room.state.priorityPlayerId = targetPlayerId;

    logger.info(
      `[DrawPhaseStepService] Active step: '${step}' for player ${player.name} (${targetPlayerId}) with ${eligibleCards.length} eligible cards.`
    );
  }

  /**
   * Evaluates eligible cards for a given player and sub-step.
   * @param {any} room
   * @param {string} step
   * @param {any} player
   * @returns {any[]}
   */
  static getEligibleCards(room, step, player) {
    if (!player) return [];

    if (step === DRAW_STEPS.ACTIVE_STARS || step === DRAW_STEPS.OPPONENT_STARS) {
      const hand = player.hand || [];
      return hand.filter(card => {
        if (!card.availableActions || card.availableActions.length === 0) return false;
        return card.availableActions.some(
          a => a.type === ActionType.ACTIVATE_STAR_ABILITY ||
               (a.type === ActionType.ACTIVATE_ABILITY && card.Class && card.Class.includes("Star"))
        );
      });
    }

    if (step === DRAW_STEPS.ACTIVE_SOULS || step === DRAW_STEPS.OPPONENT_SOULS) {
      const landOfBondage = player[ZONES.LAND_OF_BONDAGE] || player.landOfBondage || [];
      return landOfBondage.filter(card => {
        if (card.availableActions && card.availableActions.some(a => a.type === ActionType.ACTIVATE_ABILITY)) {
          return true;
        }
        return card.Type === "Lost Soul" || (card.Type && card.Type.includes("Lost Soul"));
      });
    }

    return [];
  }

  /**
   * Completes the sequence and returns the game to normal DRAW phase state.
   * @private
   */
  static _completeSequence(room) {
    room.state.drawStep = DRAW_STEPS.NONE;
    room.state.priorityPlayerId = "";
    if (room.state.activeSequenceCardIds) {
      room.state.activeSequenceCardIds.splice(0, room.state.activeSequenceCardIds.length);
    }
    room._drawSequencePlan = null;
    room._drawSequenceIndex = 0;
    logger.info("[DrawPhaseStepService] Draw sequence completed. Game remains in DRAW phase.");
  }

  /**
   * Resolves the target player sessionId for a given sub-step.
   * @private
   */
  static _getTargetPlayerId(room, step) {
    const activePlayerId = room.state.activePlayer;

    if (step === DRAW_STEPS.ACTIVE_STARS || step === DRAW_STEPS.ACTIVE_SOULS) {
      return activePlayerId;
    }

    if (step === DRAW_STEPS.OPPONENT_STARS || step === DRAW_STEPS.OPPONENT_SOULS) {
      for (const [sessionId] of room.state.players.entries()) {
        if (sessionId !== activePlayerId) {
          return sessionId;
        }
      }
    }

    return null;
  }
}

module.exports = { DrawPhaseStepService };
