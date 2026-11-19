// server/src/commands/ResolveChronicleCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
const { CHRONICLE_ACTIONS } = require("../../../shared/effectChronicleConstants");
const { formatChronicleUndoLog } = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Handles client requests to resolve, pass, or undo items in the Effect Chronicle.
 * Delegates atomic rollback across mutations, history, and prompts to ChronicleRollbackService.
 */
class ResolveChronicleCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.executedItem = null;
    this.chronicleTx = null;
    this.canUndo = false;
    this._undone = false;
  }

  execute(message) {
    const { action, itemId } = message || {};

    if (!action) {
      logger.warn(
        `[ResolveChronicleCommand] Missing action from client '${this.client.sessionId}'.`
      );
      return;
    }

    const tx = ChronicleRollbackService.beginTransaction(this.room, { command: "ResolveChronicleCommand", action });
    try {
      switch (action) {
        case CHRONICLE_ACTIONS.EXECUTE: {
          const result = EffectChronicleService.executeItem(
            this.room,
            this.client,
            itemId,
            {
              ...message,
              _isInteractiveRoot: true,
              accepted: message?.accepted !== undefined ? message.accepted : true,
            }
          );
          if (result && result.item) {
            if (result.awaitingTargetSelection || result.awaitingConfirmation || result.awaitingSpecialInitiative) {
              this.canUndo = false;
              break;
            }
            this.executedItem = result.item;
            this.canUndo = true;
          }
          break;
        }

        case CHRONICLE_ACTIONS.PASS: {
          EffectChronicleService.passItem(this.room, this.client, itemId, { _isInteractiveRoot: true });
          if (tx.entries.length > 0) {
            this.executedItem = tx.entries[0]?.itemData || null;
            this.canUndo = true;
          }
          break;
        }

        case CHRONICLE_ACTIONS.PASS_ALL: {
          EffectChronicleService.passAllItems(this.room, this.client, { _isInteractiveRoot: true });
          if (tx.entries.length > 0) {
            this.executedItem = tx.entries[0]?.itemData || null;
            this.canUndo = true;
          }
          break;
        }

        default:
          logger.warn(
            `[ResolveChronicleCommand] Unknown action '${action}' from client '${this.client.sessionId}'.`
          );
          break;
      }
    } finally {
      this.chronicleTx = ChronicleRollbackService.endTransaction(this.room, tx);
    }
  }

  undo() {
    if (this._undone || !this.executedItem || !this.chronicleTx) return;
    this._undone = true;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    const { reversedMovements, extraDetails } = ChronicleRollbackService.rollbackTransaction(
      this.room,
      this.chronicleTx,
      player,
      { reprompt: true }
    );

    const sourceCard = this.room.cardLookup?.get(this.executedItem.cardId);
    const source = sourceCard || this.executedItem.title;
    const logMsg = formatChronicleUndoLog(player.name, source, reversedMovements, extraDetails);
    this.room.broadcastGameLog(logMsg);
  }
}

module.exports = { ResolveChronicleCommand };
