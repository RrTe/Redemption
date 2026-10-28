// server/src/commands/RespondOptionalAbilityCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleHistoryService } = require("../services/ChronicleHistoryService");
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { AST_MESSAGES, AST_ACTIONS } = require("../../../shared/astConstants");
const { ActionTelegraphService } = require("../services/ActionTelegraphService");
const { moveCard } = require("../services/cardService");
const { formatChronicleUndoLog } = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Command handling player responses (accept / decline) to optional ability prompts.
 */
class RespondOptionalAbilityCommand extends BaseCommand {
  /**
   * @param {import('../rooms/GameRoom').GameRoom} room Room instance.
   * @param {import('colyseus').Client} client Sending client.
   */
  constructor(room, client) {
    super(room, client);
    this.executedItem = null;
    this.astResult = null;
    this.canUndo = false;
  }

  /**
   * Executes response to an optional ability prompt.
   *
   * @param {{ itemId?: string, accepted?: boolean }} message Client payload.
   */
  execute(message) {
    const { itemId, accepted } = message || {};
    const chronicle = this.room.state.effectChronicle;

    if (!chronicle || chronicle.items.length === 0) {
      logger.warn(`[RespondOptionalAbilityCommand] No active chronicle in room '${this.room.roomId}'.`);
      return;
    }

    if (this.client.sessionId !== chronicle.priorityPlayerId) {
      logger.warn(`[RespondOptionalAbilityCommand] Client '${this.client.sessionId}' lacks priority.`);
      return;
    }

    let index = itemId ? chronicle.items.findIndex((i) => i.id === itemId) : 0;
    if (index === -1) {
      index = chronicle.items.findIndex((i) => i.controllerId === this.client.sessionId);
      if (index !== -1) {
        logger.warn(
          `[RespondOptionalAbilityCommand] Chronicle item '${itemId}' not found. Falling back to active item '${chronicle.items[index].id}' for client '${this.client.sessionId}'.`
        );
      }
    }

    if (index === -1) {
      logger.warn(`[RespondOptionalAbilityCommand] Chronicle item '${itemId}' not found for client '${this.client.sessionId}'.`);
      if (chronicle.priorityPlayerId === this.client.sessionId) {
        if (chronicle.items.length === 0) {
          EffectChronicleService.finishChronicle(this.room);
        } else {
          const nextItem = chronicle.items[0];
          chronicle.priorityPlayerId = nextItem.controllerId;
          const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
          EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, {
            autoExecuteSupported: true,
          });
        }
      }
      return;
    }

    const item = chronicle.items[index];
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    try {
      if (item.pendingSpecialInitiative) {
        const psi = item.pendingSpecialInitiative;
        item.pendingSpecialInitiative = null;

        ActionTelegraphService.clear(this.room, { sourceCardId: item?.cardId });

        // Restore priority back to original ability owner
        chronicle.priorityPlayerId = psi.initiatorId;

        if (!accepted) {
          // Defending player declines Special Initiative -> proceed with discard
          const isMultiple = Array.isArray(psi.targetCardIds) && psi.targetCardIds.length > 1;
          const targetCard = this.room.cardLookup?.get(psi.targetCardId);
          const cardName = isMultiple ? `all ${psi.targetCardIds.length} characters` : (targetCard?.Name || "character");
          this.room.broadcastGameLog(
            `${player.name} declines Special Initiative on ${cardName}.`
          );

          const targetIds = psi.targetCardIds || [psi.targetCardId];
          ActionTelegraphService.send(this.room, {
            sourceCardId: item?.cardId,
            targetCardIds: targetIds,
            action: AST_ACTIONS.DISCARD,
            durationMs: 500,
          });

          const resumeResult = this.room.abilityResolver.resolve(item, {
            ...psi.options,
            specialInitiativeDeclined: true,
            targetCardIds: targetIds,
          });
          if (resumeResult?.logEntries?.length) {
            resumeResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
          }

          ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
          chronicle.items.splice(index, 1);
          EffectChronicleService._reindexOrders(chronicle);
          if (chronicle.items.length === 0) {
            EffectChronicleService.finishChronicle(this.room);
          } else {
            const nextItem = chronicle.items[0];
            chronicle.priorityPlayerId = nextItem.controllerId;
            const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
            EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, { autoExecuteSupported: true });
          }
          return;
        }

        // Defending player accepts Special Initiative -> card stays in battle!
        const isMultiple = Array.isArray(psi.targetCardIds) && psi.targetCardIds.length > 1;
        const targetCard = this.room.cardLookup?.get(psi.targetCardId);
        const cardName = isMultiple ? "all characters" : (targetCard?.Name || "character");
        this.room.broadcastGameLog(
          `✨ ${player.name} declares Special Initiative to defend ${cardName}!`
        );

        if (this.state.battle) {
          this.state.battle.specialInitiativePlayerId = this.client.sessionId;
        }

        ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);
        if (chronicle.items.length === 0) {
          EffectChronicleService.finishChronicle(this.room);
        } else {
          const nextItem = chronicle.items[0];
          chronicle.priorityPlayerId = nextItem.controllerId;
          const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
          EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, { autoExecuteSupported: true });
        }
        return;
      }

      // Clear persistent preview telegraph arrow from optional ability prompt
      ActionTelegraphService.clear(this.room, { sourceCardId: item?.cardId });

      if (!accepted) {
        const declineResult = this.room.abilityResolver.resolve(item, { accepted: false });
        if (declineResult?.logEntries?.length) {
          declineResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
        } else {
          this.room.broadcastGameLog(`${player.name} chooses not to activate ${item.title}.`);
        }

        ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.PASSED);
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);

        if (chronicle.items.length === 0) {
          EffectChronicleService.finishChronicle(this.room);
        } else {
          const nextItem = chronicle.items[0];
          chronicle.priorityPlayerId = nextItem.controllerId;
          const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
          EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, {
            autoExecuteSupported: true,
          });
        }
        return;
      }

      item.isConfirmed = true;
      const astResult = this.room.abilityResolver.resolve(item, { accepted: true });

      if (
        astResult &&
        (astResult.awaitingTargetSelection ||
          astResult.awaitingSpecialInitiative ||
          astResult.awaitingConfirmation)
      ) {
        logger.info(`[RespondOptionalAbilityCommand] Item '${item.title}' now awaiting further response.`);
        return;
      }

      if (astResult?.logEntries?.length) {
        astResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
      } else {
        const abilityText = item.description ? `: "${item.description}"` : "";
        this.room.broadcastGameLog(`${player.name} activates ${item.title}${abilityText}.`);
      }

      ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
      chronicle.items.splice(index, 1);
      EffectChronicleService._reindexOrders(chronicle);

      if (chronicle.items.length === 0) {
        EffectChronicleService.finishChronicle(this.room);
      } else {
        const nextItem = chronicle.items[0];
        chronicle.priorityPlayerId = nextItem.controllerId;
        const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
        EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, {
          autoExecuteSupported: true,
        });
      }

      this.executedItem = item;
      this.astResult = astResult;
      this.canUndo = Boolean(astResult?.handled);
    } catch (err) {
      logger.error(`[RespondOptionalAbilityCommand] Fatal error resolving chronicle item '${item.title}':`, err);
      chronicle.items.splice(index, 1);
      EffectChronicleService._reindexOrders(chronicle);
      if (chronicle.items.length === 0) {
        EffectChronicleService.finishChronicle(this.room);
      } else {
        const nextItem = chronicle.items[0];
        chronicle.priorityPlayerId = nextItem.controllerId;
        const nextClient = this.room.clients?.find((c) => c.sessionId === nextItem.controllerId) || { sessionId: nextItem.controllerId };
        EffectChronicleService.executeItem(this.room, nextClient, nextItem.id, {
          autoExecuteSupported: true,
        });
      }
    }
  }

  /**
   * Undoes the accepted optional ability resolution and restores state.
   */
  undo() {
    if (!this.executedItem) return;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    const allReversedMovements = [];
    if (this.astResult && Array.isArray(this.astResult.snapshots)) {
      for (const snapshot of this.astResult.snapshots) {
        const moves = this._rollbackSnapshot(snapshot, player);
        if (Array.isArray(moves)) {
          allReversedMovements.push(...moves);
        }
      }
    }

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

    const sourceCard = this.room.cardLookup.get(this.executedItem.cardId);
    const source = sourceCard || this.executedItem.title;
    const logMsg = formatChronicleUndoLog(player.name, source, allReversedMovements);
    this.room.broadcastGameLog(logMsg);
  }

  /**
   * Reverses card movements from a single MutationSnapshot.
   *
   * @private
   * @param {object} snapshot AST execution snapshot.
   * @param {object} player Active player.
   * @returns {object[]} Executed reversed movement logs.
   */
  _rollbackSnapshot(snapshot, player) {
    if (!snapshot) return [];
    const movements = snapshot.movedCards || snapshot.discardedCards || [];
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

      executedMovements.push({
        cardOrName: card || move,
        fromZone: move.toZone,
        toZone: move.fromZone,
        isOpponent: owner.sessionId !== player.sessionId,
      });
    }

    return executedMovements;
  }
}

module.exports = { RespondOptionalAbilityCommand };
