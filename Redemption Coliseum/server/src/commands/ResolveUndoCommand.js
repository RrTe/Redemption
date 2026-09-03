const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

class ResolveUndoCommand extends BaseCommand {
  execute(message) {
    if (!this.room.undoManager) {
      return;
    }

    const accepted = Boolean(message?.accepted);
    const requestingClient = this.room.clients.find(
      (c) => c.sessionId !== this.client.sessionId,
    );

    if (accepted) {
      const available = this.room.undoManager.getAvailableUndoCount();
      const rawCount = Number(message?.count) || 1;
      const safeCount = Math.min(Math.max(1, rawCount), available);

      const undone = this.room.undoManager.pop(safeCount);

      // Notify both players of resolution
      this.room.broadcast("undoResolved", {
        accepted: true,
        count: undone,
      });

      // Notify both players of successful batch undo
      this.room.broadcast("gameToast", {
        message: `Undid ${undone} action(s).`,
        type: "info",
      });

      logger.info(
        `[ResolveUndoCommand] Undo accepted. Successfully undone ${undone} actions.`,
      );
    } else {
      // Notify both players of resolution
      this.room.broadcast("undoResolved", {
        accepted: false,
        count: Number(message?.count) || 1,
      });

      // Opponent declined: explicitly notify the requesting player via toast
      if (requestingClient) {
        requestingClient.send("gameToast", {
          message: "Opponent declined the undo request.",
          type: "warning",
        });
      }

      this.client.send("gameToast", {
        message: "Declined undo request.",
        type: "info",
      });

      logger.info(
        `[ResolveUndoCommand] Undo request declined by player ${this.client.sessionId}.`,
      );
    }
  }
}

module.exports = { ResolveUndoCommand };
