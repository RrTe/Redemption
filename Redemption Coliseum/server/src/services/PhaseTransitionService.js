const { PHASES } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { CardAction } = require("../../../shared/actionSchema");
const MatchService = require("./MatchService");
const { DrawPhaseStepService } = require("./DrawPhaseStepService");
const { EffectChronicleService } = require("./EffectChronicleService");
const logger = require("../utils/logger");

/**
 * Service orchestrating bilateral phase transitions and phase advancement logic.
 */
class PhaseTransitionService {
  /**
   * Computes the subsequent phase in the turn cycle.
   *
   * @param {string} currentPhase Current game phase.
   * @returns {string} The next turn phase.
   */
  static getNextPhase(currentPhase) {
    const phaseOrder = Object.values(PHASES);
    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
      return PHASES.DRAW;
    }
    return phaseOrder[currentIndex + 1];
  }

  /**
   * Executes the actual phase transition and associated board resets.
   *
   * @param {any} room The Colyseus GameRoom instance.
   * @param {any} state The RoomState schema.
   * @param {any} player The active PlayerState triggering progression.
   */
  static executePhaseAdvance(room, state, player) {
    let result = null;
    try {
      // Clear all transient card actions across all player zones before phase switch
      const allZones = [
        "hand", "deck", "discard", "reserve",
        "landOfRedemption", "landOfBondage", "territory", "setAside", "banish",
      ];
      state.players.forEach((p) => {
        allZones.forEach((zone) => {
          if (p[zone]) {
            p[zone].forEach((card) => {
              if (card.availableActions && card.availableActions.length > 0) {
                card.availableActions.splice(0, card.availableActions.length);
              }
            });
          }
        });
      });

      // Delegate phase calculation to room phaseService
      result = room.phaseService.advancePhase(
        state,
        player,
        room.clients,
        room.cardLookup,
      );

      // Reset undo stack and archive chronicle history
      if (room.undoManager) {
        room.undoManager.clear();
      }
      EffectChronicleService.purgeHistory(room);

      // Decrement upkeep counters
      if (state.currentPhase === PHASES.UPKEEP) {
        MatchService.handleUpkeepPhase(room);
      }

      if (result) {
        this.handlePhaseDraw(room, state, result, player);
      }
    } catch (err) {
      logger.error("[PhaseTransitionService] Critical error advancing phase:", err);
    }
  }

  /**
   * Handles card distribution, logs, and Star triggers for draw phases.
   *
   * @param {any} room GameRoom instance.
   * @param {any} state RoomState schema.
   * @param {any} result Result object from phase advance.
   * @param {any} player Active player schema.
   */
  static handlePhaseDraw(room, state, result, player) {
    const movedCards = result.movedCards || [];
    if (movedCards.length > 0) {
      const receivingClient = room.clients.find(
        (c) => c.sessionId === state.activePlayer,
      );
      if (receivingClient) {
        receivingClient.send("cardsDrawn", {
          cardIds: movedCards.map((c) => c.id),
        });
      }

      if (state.currentPhase === PHASES.DRAW) {
        movedCards.forEach((card) => {
          if (
            card.IsStarCard ||
            (card.Class && (card.Class.includes("Star") || card.Class.includes("star")))
          ) {
            const action = new CardAction();
            action.id = `star_${Date.now()}_${card.id}`;
            action.type = ActionType.ACTIVATE_STAR_ABILITY;
            action.description = "Activate Star Ability";
            action.isMandatory = false;

            const cardService = require("./cardService");
            cardService.addAvailableAction(state, card, action);
          }
        });
      }
    }

    if (result.logEntry) {
      room.broadcastGameLog(result.logEntry);
    }

    if (state.currentPhase === PHASES.DRAW) {
      DrawPhaseStepService.startTurnDrawSequence(room);
    }
  }
}

module.exports = { PhaseTransitionService };
