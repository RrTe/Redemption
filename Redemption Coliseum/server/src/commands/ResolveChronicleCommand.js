// server/src/commands/ResolveChronicleCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_ACTIONS, CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { ZONES } = require("../../../shared/zones");
const { moveCard } = require("../services/cardService");
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
          message
        );
        if (result && result.item) {
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

    // Rollback all recorded AST mutations
    if (this.astResult && Array.isArray(this.astResult.snapshots)) {
      for (const snapshot of this.astResult.snapshots) {
        this._rollbackSnapshot(snapshot, player);
      }
    }

    // Restore ChronicleItem back into the Effect Chronicle queue
    const chronicle = this.room.state.effectChronicle;
    if (chronicle) {
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

    this.room.broadcastGameLog(`[UNDO] ${player.name} rewound ${this.executedItem.title}.`);
  }

  /**
   * Reverses an individual mutation snapshot.
   *
   * @param {object} snapshot Mutation snapshot to reverse.
   * @param {object} player Acting player.
   * @private
   */
  _rollbackSnapshot(snapshot, player) {
    if (!snapshot) return;

    if (snapshot.action === AST_ACTIONS.DRAW) {
      // Revert regular cards drawn from deck to hand
      for (const cardId of (snapshot.movedCardIds || [])) {
        moveCard(
          player,
          this.state,
          this.room.cardLookup,
          ZONES.HAND,
          ZONES.DECK,
          cardId,
          1,
          {},
          "",
          "",
          { isUndo: true }
        );
      }

      // Revert diverted Lost Souls from Land of Bondage back to deck
      for (const cardId of (snapshot.divertedCardIds || [])) {
        moveCard(
          player,
          this.state,
          this.room.cardLookup,
          ZONES.LAND_OF_BONDAGE,
          ZONES.DECK,
          cardId,
          1,
          {},
          "",
          "",
          { isUndo: true }
        );
      }
    } else if (snapshot.action === AST_ACTIONS.DISCARD) {
      // Revert discarded cards back to their previous zones
      for (const entry of (snapshot.discardedCards || [])) {
        const owner = this.state.players.get(entry.ownerId) || player;
        moveCard(
          owner,
          this.state,
          this.room.cardLookup,
          ZONES.DISCARD,
          entry.fromZone || ZONES.TERRITORY,
          entry.cardId,
          1,
          {},
          "",
          "",
          { isUndo: true }
        );
      }
    }
  }
}

module.exports = { ResolveChronicleCommand };
