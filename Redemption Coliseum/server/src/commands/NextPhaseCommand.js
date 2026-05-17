const { BaseCommand } = require("./BaseCommand");
const { PHASES } = require("../../../shared/phases");
const MatchService = require("../services/MatchService");
const logger = require("../utils/logger");

class NextPhaseCommand extends BaseCommand {
  execute() {
    if (this.client.sessionId !== this.state.activePlayer) return;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    let drawnCards = [];
    try {
      // Delegate to phaseService (attached to room)
      drawnCards = this.room.phaseService.advancePhase(
        this.state,
        player,
        this.room.clients,
        this.room.cardLookup,
      );

      // Auto-reduce counters during UPKEEP
      if (this.state.currentPhase === PHASES.UPKEEP) {
        MatchService.handleUpkeepPhase(this.room);
      }

      this._handlePhaseDraw(drawnCards, player);
    } catch (err) {
      logger.error(`[NextPhaseCommand] Critical error:`, err);
    }
  }

  _handlePhaseDraw(drawnCards, player) {
    if (!drawnCards || drawnCards.length === 0) return;

    // Find client for the (potentially new) active player
    const receivingClient = this.room.clients.find(
      (c) => c.sessionId === this.state.activePlayer,
    );

    if (receivingClient) {
      receivingClient.send("cardsDrawn", {
        cardIds: drawnCards.map((c) => c.id),
      });
    }

    const pName = player.name || "Player";
    this.room.broadcastGameLog(
      `${pName} draws ${drawnCards.length} card(s) for turn.`,
    );
  }
}

module.exports = { NextPhaseCommand };
