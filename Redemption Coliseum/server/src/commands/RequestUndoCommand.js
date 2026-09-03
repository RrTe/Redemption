const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class RequestUndoCommand extends BaseCommand {
  execute(message) {
    if (!this.room.undoManager) {
      return;
    }

    const available = this.room.undoManager.getAvailableUndoCount();
    if (available === 0) {
      this.client.send("gameToast", {
        message: "No actions to undo in the current phase.",
        type: "warning",
      });
      return;
    }

    const rawCount = Number(message?.count) || 1;
    const safeCount = Math.min(Math.max(1, rawCount), available);
    const requestingPlayerId = this.client.sessionId;
    const requestingPlayer = this.state.players.get(requestingPlayerId);
    const opponentClient = this.room.clients.find(
      (c) => c.sessionId !== requestingPlayerId,
    );

    // If in solo / testing mode with no opponent connected, resolve immediately
    if (!opponentClient) {
      const undone = this.room.undoManager.pop(safeCount);
      this.client.send("undoResolved", {
        accepted: true,
        count: undone,
      });
      this.client.send("gameToast", {
        message: `Undid ${undone} action(s).`,
        type: "info",
      });
      return;
    }

    // Forward confirmation prompt to the opponent
    opponentClient.send("undoConfirmationPrompt", {
      requestingPlayerId,
      requestingPlayerName: requestingPlayer ? requestingPlayer.name : "Opponent",
      count: safeCount,
    });

    this.client.send("gameToast", {
      message: `Requested undo for ${safeCount} action(s). Waiting for opponent...`,
      type: "info",
    });

    logger.info(
      `[RequestUndoCommand] Player ${requestingPlayerId} requested undo for ${safeCount} actions. Prompt sent to opponent ${opponentClient.sessionId}.`,
    );
  }
}

module.exports = { RequestUndoCommand };
