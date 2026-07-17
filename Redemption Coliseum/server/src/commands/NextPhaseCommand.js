const { BaseCommand } = require("./BaseCommand");
const { PHASES } = require("../../../shared/phases");
const { ActionType } = require("../../../shared/actions");
const { CardAction } = require("../../../shared/actionSchema");
const MatchService = require("../services/MatchService");
const logger = require("../utils/logger");

class NextPhaseCommand extends BaseCommand {
  execute() {
    if (this.client.sessionId !== this.state.activePlayer) return;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    let result = null;
    try {
      // ✨ NEU: Vor dem Phasenwechsel bereinigen wir die Aktionen der aktuellen Phase
      if (this.state.currentPhase === PHASES.DRAW) {
        player.hand.forEach(card => {
          if (card.availableActions) {
            const idx = card.availableActions.findIndex(a => a.type === ActionType.ACTIVATE_STAR_ABILITY);
            if (idx !== -1) {
              card.availableActions.splice(idx, 1);
            }
          }
        });
      }

      // Delegate to phaseService (attached to room)
      result = this.room.phaseService.advancePhase(
        this.state,
        player,
        this.room.clients,
        this.room.cardLookup,
      );

      // Auto-reduce counters during UPKEEP
      if (this.state.currentPhase === PHASES.UPKEEP) {
        MatchService.handleUpkeepPhase(this.room);
      }

      if (result) {
        this._handlePhaseDraw(result, player);
      }
    } catch (err) {
      logger.error(`[NextPhaseCommand] Critical error:`, err);
    }
  }

  _handlePhaseDraw(result, player) {
    const movedCards = result.movedCards || [];
    if (movedCards.length === 0) return;

    // Find client for the (potentially new) active player
    const receivingClient = this.room.clients.find(
      (c) => c.sessionId === this.state.activePlayer,
    );

    if (receivingClient) {
      receivingClient.send("cardsDrawn", {
        cardIds: movedCards.map((c) => c.id),
      });
    }

    // ✨ NEU: Star-Fähigkeit für gezogene Star-Karten in der Draw-Phase aktivieren
    if (this.state.currentPhase === PHASES.DRAW) {
      movedCards.forEach(card => {
        // Prüfe, ob die Karte die Klasse "Star" hat (Groß/Kleinschreibung beachten, meistens "Star")
        if (card.Class && (card.Class.includes("Star") || card.Class.includes("star"))) {
          const action = new CardAction();
          action.id = `star_${Date.now()}_${card.id}`;
          action.type = ActionType.ACTIVATE_STAR_ABILITY;
          action.description = "Activate Star Ability";
          action.isMandatory = false;
          card.availableActions.push(action);
        }
      });
    }

    if (result.logEntry) {
      this.room.broadcastGameLog(result.logEntry);
    }
  }
}

module.exports = { NextPhaseCommand };
