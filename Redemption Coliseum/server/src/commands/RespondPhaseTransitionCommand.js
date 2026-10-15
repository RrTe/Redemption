const { BaseCommand } = require("./BaseCommand");
const { PhaseTransitionService } = require("../services/PhaseTransitionService");
const logger = require("../utils/logger");

/**
 * Handles opponent's response ("Pass" or "Wait / React") to a phase transition request.
 */
class RespondPhaseTransitionCommand extends BaseCommand {
  execute(message) {
    const pending = this.room.pendingPhaseTransition;
    if (!pending) {
      logger.warn(
        `[RespondPhaseTransitionCommand] No pending phase transition in room ${this.room.roomId}.`,
      );
      return;
    }

    // Ensure only the opponent can respond to the phase prompt
    if (this.client.sessionId === pending.requestingPlayerId) {
      logger.warn(
        `[RespondPhaseTransitionCommand] Requester ${this.client.sessionId} cannot resolve own handshake prompt.`,
      );
      return;
    }

    const accepted = Boolean(message?.accept);
    const requestingClient = this.room.clients.find(
      (c) => c.sessionId === pending.requestingPlayerId,
    );
    const respondingPlayer = this.state.players.get(this.client.sessionId);
    const opponentName = respondingPlayer ? respondingPlayer.name : "Opponent";
    const fromPhase = pending.fromPhase;
    const toPhase = pending.toPhase;

    // Clear pending handshake record
    this.room.pendingPhaseTransition = null;

    if (accepted) {
      logger.info(
        `[RespondPhaseTransitionCommand] Handshake accepted by ${this.client.sessionId} (${fromPhase} -> ${toPhase}).`,
      );

      // Close modal dialogs on both clients
      this.room.broadcast("phaseTransitionResolved", {
        accepted: true,
        fromPhase,
        toPhase,
      });

      // Execute actual phase advancement
      const activePlayer = this.state.players.get(pending.requestingPlayerId);
      if (activePlayer) {
        PhaseTransitionService.executePhaseAdvance(this.room, this.state, activePlayer);
      }
    } else {
      logger.info(
        `[RespondPhaseTransitionCommand] Handshake declined / held by ${this.client.sessionId} (${fromPhase} -> ${toPhase}).`,
      );

      // Close modal dialogs on both clients
      this.room.broadcast("phaseTransitionResolved", {
        accepted: false,
        fromPhase,
        toPhase,
      });

      // Document priority hold in game log
      this.room.broadcastGameLog(`${opponentName} holds priority to react.`);

      if (requestingClient) {
        requestingClient.send("gameToast", {
          message: "Opponent holds priority to react.",
          type: "info",
        });
      }

      this.client.send("gameToast", {
        message: "You hold priority to react.",
        type: "info",
      });
    }
  }
}

module.exports = { RespondPhaseTransitionCommand };
