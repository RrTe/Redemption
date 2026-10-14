// server/src/commands/ResolveChronicleCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_ACTIONS, CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { ZONES } = require("../../../shared/zones");
const { moveCard } = require("../services/cardService");
const { formatChronicleUndoLog } = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Handles client requests to resolve, pass, or undo items in the Effect Chronicle.
 * Implements Option B: atomic rollback of executed abilities via MutationSnapshots.
 */
class ResolveChronicleCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.executedItem = null;
    this.astResult = null;
  }

  execute(message) {
    const { action, itemId } = message || {};

    if (!action) {
      logger.warn(
        `[ResolveChronicleCommand] Missing action from client '${this.client.sessionId}'.`
      );
      return;
    }

    switch (action) {
      case CHRONICLE_ACTIONS.EXECUTE: {
        const result = EffectChronicleService.executeItem(
          this.room,
          this.client,
          itemId,
          { ...message, accepted: message?.accepted !== undefined ? message.accepted : true }
        );
        if (result && result.item) {
          // If the ability is awaiting manual client target selection, it is not yet executed!
          // Targeting will be finalized and recorded for Undo by SelectTargetCommand.
          if (result.awaitingTargetSelection || result.awaitingConfirmation) {
            this.canUndo = false;
            break;
          }
          this.executedItem = result.item;
          this.astResult = result.astResult;
          this.canUndo = true;
        }
        break;
      }

      case CHRONICLE_ACTIONS.PASS:
        EffectChronicleService.passItem(this.room, this.client, itemId);
        break;

      case CHRONICLE_ACTIONS.PASS_ALL:
        EffectChronicleService.passAllItems(this.room, this.client);
        break;

      default:
        logger.warn(
          `[ResolveChronicleCommand] Unknown action '${action}' from client '${this.client.sessionId}'.`
        );
        break;
    }
  }

  undo() {
    if (!this.executedItem) return;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    // Rollback all recorded AST mutations and collect reversed movement descriptors
    const allReversedMovements = [];
    if (this.astResult && Array.isArray(this.astResult.snapshots)) {
      for (const snapshot of this.astResult.snapshots) {
        const moves = this._rollbackSnapshot(snapshot, player);
        if (Array.isArray(moves)) {
          allReversedMovements.push(...moves);
        }
      }
    }

    // Restore ChronicleItem back into the Effect Chronicle queue (prevent duplicates)
    const chronicle = this.room.state.effectChronicle;
    if (chronicle) {
      const alreadyExists = chronicle.items.some((i) => i.id === this.executedItem.id);
      if (!alreadyExists) {
        const restoredItem = new ChronicleItem({
          id: this.executedItem.id,
          cardId: this.executedItem.cardId,
          controllerId: this.executedItem.controllerId,
          actionType: this.executedItem.actionType,
          title: this.executedItem.title,
          description: this.executedItem.description,
          status: CHRONICLE_STATUS.PENDING,
          order: chronicle.items.length + 1,
          abilityId: this.executedItem.abilityId,
          isOptional: this.executedItem.isOptional,
        });

        chronicle.items.push(restoredItem);
        chronicle.priorityPlayerId = this.executedItem.controllerId;
        chronicle.isResolving = true;
        EffectChronicleService._reindexOrders(chronicle);
      }
    }

    // Broadcast a single unified undo log entry combining ability rewind and card returns
    const sourceCard = this.room.cardLookup.get(this.executedItem.cardId);
    const source = sourceCard || this.executedItem.title;
    const logMsg = formatChronicleUndoLog(player.name, source, allReversedMovements);
    this.room.broadcastGameLog(logMsg);
  }

  /**
   * Extracts unified card movements from mutation snapshots.
   * Supports generic movedCards and legacy snapshot schemas.
   *
   * @param {object} snapshot Mutation snapshot.
   * @param {object} defaultPlayer Acting player fallback.
   * @returns {Array<{ cardId: string, fromZone: string, toZone: string, ownerId: string }>} Movements.
   * @private
   */
  _extractMovements(snapshot, defaultPlayer) {
    if (!snapshot) return [];

    if (Array.isArray(snapshot.movedCards) && snapshot.movedCards.length > 0) {
      return snapshot.movedCards;
    }

    const movements = [];
    if (snapshot.action === AST_ACTIONS.DRAW) {
      for (const cardId of (snapshot.movedCardIds || [])) {
        movements.push({
          cardId,
          fromZone: ZONES.DECK,
          toZone: snapshot.toZone || ZONES.HAND,
          ownerId: snapshot.playerId || defaultPlayer.sessionId,
        });
      }
      for (const cardId of (snapshot.divertedCardIds || [])) {
        movements.push({
          cardId,
          fromZone: ZONES.DECK,
          toZone: ZONES.LAND_OF_BONDAGE,
          ownerId: snapshot.playerId || defaultPlayer.sessionId,
        });
      }
    } else if (snapshot.action === AST_ACTIONS.DISCARD) {
      for (const entry of (snapshot.discardedCards || [])) {
        movements.push({
          cardId: entry.cardId,
          fromZone: entry.fromZone || ZONES.TERRITORY,
          toZone: ZONES.DISCARD,
          ownerId: entry.ownerId || defaultPlayer.sessionId,
        });
      }
    }
    return movements;
  }

  /**
   * Reverses an individual mutation snapshot and returns reversed movement descriptors.
   * Action-agnostic: generically rolls back card movements for all present and future effects.
   *
   * @param {object} snapshot Mutation snapshot to reverse.
   * @param {object} player Acting player.
   * @returns {Array<{ cardOrName: any, fromZone: string, toZone: string, isOpponent: boolean }>}
   * @private
   */
  _rollbackSnapshot(snapshot, player) {
    if (!snapshot) return [];

    const movements = this._extractMovements(snapshot, player);
    const executedMovements = [];

    for (let i = movements.length - 1; i >= 0; i--) {
      const move = movements[i];
      const owner = this.state.players.get(move.ownerId) || player;
      const card = this.room.cardLookup.get(move.cardId);

      moveCard(
        owner,
        this.state,
        this.room.cardLookup,
        move.toZone,
        move.fromZone,
        move.cardId,
        1,
        {},
        "",
        "",
        { isUndo: true }
      );

      const isOwnerOpponent = owner.sessionId !== player.sessionId;
      executedMovements.push({
        cardOrName: card || move,
        fromZone: move.toZone,
        toZone: move.fromZone,
        isOpponent: isOwnerOpponent,
      });
    }

    return executedMovements;
  }
}

module.exports = { ResolveChronicleCommand };
