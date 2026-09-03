const logger = require("../utils/logger");

/**
 * Manages the global phase-scoped undo stack for a GameRoom.
 * Tracks reversible commands in chronological order and handles batch rollback.
 */
class UndoManager {
  /**
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  constructor(room) {
    this.room = room;
    /** @type {import('../commands/BaseCommand').BaseCommand[]} */
    this.undoStack = [];
  }

  /**
   * Records a command to the undo stack if it supports undo.
   * @param {import('../commands/BaseCommand').BaseCommand} command
   */
  push(command) {
    if (!command || !command.canUndo) {
      return;
    }
    this.undoStack.push(command);
    logger.debug(
      `[UndoManager] Command recorded. Current stack size: ${this.undoStack.length}`,
    );
    this.broadcastState();
  }

  /**
   * Rolls back the specified number of commands in reverse chronological order (LIFO).
   * @param {number} count Number of steps to undo (default: 1).
   * @returns {number} The actual number of commands successfully undone.
   */
  pop(count = 1) {
    const safeCount = Math.min(Math.max(1, count), this.undoStack.length);
    let undoneCount = 0;

    for (let i = 0; i < safeCount; i++) {
      const command = this.undoStack.pop();
      if (!command) break;

      try {
        command.undo();
        undoneCount++;
      } catch (err) {
        logger.error(`[UndoManager] Error undoing command:`, err);
        break;
      }
    }

    logger.info(
      `[UndoManager] Undid ${undoneCount} actions. Remaining stack size: ${this.undoStack.length}`,
    );
    this.broadcastState();
    return undoneCount;
  }

  /**
   * Clears the undo stack. Called automatically on phase transitions.
   */
  clear() {
    if (this.undoStack.length > 0) {
      logger.debug(
        `[UndoManager] Clearing undo stack (${this.undoStack.length} actions cleared).`,
      );
      this.undoStack.length = 0;
      this.broadcastState();
    }
  }

  /**
   * Broadcasts current available undo action count to all clients.
   */
  broadcastState() {
    if (this.room) {
      logger.info(
        `[UndoManager] Broadcasting undoStateChanged: availableCount=${this.undoStack.length} to ${this.room.clients?.length ?? 0} client(s).`,
      );
      this.room.broadcast("undoStateChanged", {
        availableCount: this.undoStack.length,
      });
    }
  }

  /**
   * Checks whether any actions can currently be undone.
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Returns the count of reversible actions currently in the stack.
   * @returns {number}
   */
  getAvailableUndoCount() {
    return this.undoStack.length;
  }
}

module.exports = { UndoManager };
