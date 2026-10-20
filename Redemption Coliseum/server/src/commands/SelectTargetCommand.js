// server/src/commands/SelectTargetCommand.js
const { BaseCommand } = require("./BaseCommand");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { TargetSelectionService } = require("../ast/TargetSelectionService");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleHistoryService } = require("../services/ChronicleHistoryService");
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { moveCard } = require("../services/cardService");
const { formatChronicleUndoLog } = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Command handling interactive target submissions (cards or piles) from clients.
 * Validates selection securely before triggering effect resolution and mutation recording.
 */
class SelectTargetCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.executedItem = null;
    this.astResult = null;
    this.canUndo = false;
  }

  execute(message) {
    const { itemId, abilityId, selectedCardIds, selectedPileId, cancelled } = message || {};
    const chronicle = this.room.state.effectChronicle;

    if (!chronicle || chronicle.items.length === 0) {
      logger.warn(`[SelectTargetCommand] No active chronicle in room '${this.room.roomId}'.`);
      return;
    }

    if (this.client.sessionId !== chronicle.priorityPlayerId) {
      logger.warn(`[SelectTargetCommand] Client '${this.client.sessionId}' lacks priority.`);
      return;
    }

    const index = itemId ? chronicle.items.findIndex((i) => i.id === itemId) : 0;
    if (index === -1) {
      logger.warn(`[SelectTargetCommand] Chronicle item '${itemId}' not found.`);
      return;
    }

    const item = chronicle.items[index];
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (cancelled) {
      EffectChronicleService.passItem(this.room, this.client, item.id);
      return;
    }

    // Inspect card ability for targeting rules
    const card = this.room.cardLookup.get(item.cardId);
    if (!card || !card.templateId) {
      logger.warn(`[SelectTargetCommand] Card '${item.cardId}' missing.`);
      return;
    }

    const abilities = AbilityLookup.resolveAbilities(card.templateId, {
      actionType: item.actionType,
      inGameType: card.inGameType,
      inGameAlignment: card.inGameAlignment,
    });
    const targetAbility = (abilityId && abilities.find((a) => a.ability_id === abilityId)) || abilities[0];

    if (!targetAbility || !targetAbility.effects || targetAbility.effects.length === 0) {
      logger.warn(`[SelectTargetCommand] Ability not found for card '${card.Name}'.`);
      return;
    }

    const targetDef = targetAbility.effects[0].target || {};
    const eligible = TargetSelectionService.resolveEligibleTargets(this.room, player, targetDef);
    const validation = TargetSelectionService.validateSelection(
      { selectedCardIds, selectedPileId },
      eligible
    );

    if (!validation.valid) {
      logger.warn(`[SelectTargetCommand] Invalid target submitted: ${validation.reason}`);
      return;
    }

    // Execute effect via AbilityResolver with validated target options
    const astResult = this.room.abilityResolver.resolve(item, {
      accepted: true,
      targetCardIds: selectedCardIds,
      targetPileId: selectedPileId,
    });

    if (
      astResult &&
      (astResult.awaitingSpecialInitiative ||
        astResult.awaitingConfirmation ||
        astResult.awaitingTargetSelection)
    ) {
      logger.info(`[SelectTargetCommand] Item '${item.title}' is awaiting further response.`);
      return;
    }

    if (astResult && astResult.handled) {
      if (astResult.logEntries && astResult.logEntries.length > 0) {
        astResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
      } else {
        this.room.broadcastGameLog(`${player.name} resolves ${item.title}.`);
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

      this.executedItem = item;
      this.astResult = astResult;
      this.canUndo = true;
    }
  }

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

    const sourceCard = this.room.cardLookup.get(this.executedItem.cardId);
    const source = sourceCard || this.executedItem.title;
    const logMsg = formatChronicleUndoLog(player.name, source, allReversedMovements);
    this.room.broadcastGameLog(logMsg);
  }

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

module.exports = { SelectTargetCommand };
