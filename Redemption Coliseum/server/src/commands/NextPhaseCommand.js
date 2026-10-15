const { BaseCommand } = require("./BaseCommand");
const { DRAW_STEPS } = require("../../../shared/phases");
const { PhaseTransitionService } = require("../services/PhaseTransitionService");
const logger = require("../utils/logger");

/**
 * Command triggered when the active player clicks 'Next Phase'.
 * In multiplayer rooms, initiates a bilateral handshake with the opponent.
 * In solo / testing rooms, directly advances the phase.
 */
class NextPhaseCommand extends BaseCommand {
  execute() {
    if (this.client.sessionId !== this.state.activePlayer) return;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (
      this.state.drawStep &&
      this.state.drawStep !== DRAW_STEPS.NONE &&
      this.state.drawStep !== DRAW_STEPS.COMPLETED
    ) {
      logger.warn(
        `[NextPhaseCommand] Blocked nextPhase: draw sequence step '${this.state.drawStep}' is active.`,
      );
      return;
    }

    if (this.state.effectChronicle && this.state.effectChronicle.items.length > 0) {
      logger.warn(
        `[NextPhaseCommand] Blocked nextPhase: ${this.state.effectChronicle.items.length} items still pending in Effect Chronicle.`,
      );
      return;
    }

    const opponentClient = this.room.clients.find(
      (c) => c.sessionId !== this.client.sessionId,
    );

    // If solo / testing mode with no opponent connected, advance immediately
    if (!opponentClient) {
      logger.info(
        `[NextPhaseCommand] Solo mode active. Directly advancing phase for ${this.client.sessionId}.`,
      );
      PhaseTransitionService.executePhaseAdvance(this.room, this.state, player);
      return;
    }

    // Guard against duplicate phase handshake prompts
    if (this.room.pendingPhaseTransition) {
      logger.warn(
        `[NextPhaseCommand] Phase transition handshake already pending in room ${this.room.roomId}.`,
      );
      return;
    }

    const fromPhase = this.state.currentPhase;
    const toPhase = PhaseTransitionService.getNextPhase(fromPhase);

    this.room.pendingPhaseTransition = {
      requestingPlayerId: this.client.sessionId,
      requestingPlayerName: player.name || "Active Player",
      fromPhase,
      toPhase,
      createdAt: Date.now(),
    };

    // Notify requester to render WaitingDialogScene
    this.client.send("phaseTransitionWaiting", {
      fromPhase,
      toPhase,
    });

    // Send confirmation prompt to opponent
    opponentClient.send("phaseTransitionPrompt", {
      requestingPlayerId: this.client.sessionId,
      requestingPlayerName: player.name || "Opponent",
      fromPhase,
      toPhase,
    });

    logger.info(
      `[NextPhaseCommand] Phase handshake initiated by ${this.client.sessionId} (${fromPhase} -> ${toPhase}). Prompt sent to ${opponentClient.sessionId}.`,
    );
  }
}

module.exports = { NextPhaseCommand };
