// server/src/commands/SelectTargetCommand.js
const { BaseCommand } = require("./BaseCommand");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { TargetSelectionService } = require("../ast/TargetSelectionService");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleHistoryService } = require("../services/ChronicleHistoryService");
const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const {
  formatCardLink,
  formatChronicleUndoLog,
} = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Command handling interactive target submissions (cards or piles) from clients.
 * Validates selection securely before triggering effect resolution and mutation recording.
 */
class SelectTargetCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.executedItem = null;
    this.chronicleTx = null;
    this.canUndo = false;
    this._undone = false;
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

    const preItemData = ChronicleRollbackService.cloneChronicleItemData(item);
    // Keep confirmed flag on restored item so Undo re-opens Target Selection directly
    preItemData.isConfirmed = true;

    const tx = ChronicleRollbackService.beginTransaction(this.room, { command: "SelectTargetCommand" });
    try {
      if (cancelled) {
        const cancelledCard = item?.cardId ? this.room.cardLookup?.get(item.cardId) : null;
        if (cancelledCard) {
          ChronicleRollbackService.recordCostPaidChange(this.room, cancelledCard.id, cancelledCard._lastCostPaid);
          cancelledCard._lastCostPaid = false;
        }
        if (Array.isArray(item._accumulatedLogs) && item._accumulatedLogs.length > 0) {
          item._accumulatedLogs.forEach((msg) => this.room.broadcastGameLog(msg));
          item._accumulatedLogs = [];
        }
        EffectChronicleService.passItem(this.room, this.client, item.id, {
          _isInteractiveRoot: true,
          preItemData,
        });
        if (chronicle.items.length > 0) {
          EffectChronicleService.advanceChronicle(this.room);
        }
        this.executedItem = preItemData;
        this.canUndo = true;
        return;
      }

      // Inspect card ability for targeting rules
      const card = this.room.cardLookup.get(item.cardId);
      if (!card) {
        logger.warn(`[SelectTargetCommand] Card '${item.cardId}' missing.`);
        return;
      }

      const abilities = card.templateId
        ? AbilityLookup.resolveAbilities(card.templateId, {
          actionType: item.actionType,
          inGameType: card.inGameType,
          inGameAlignment: card.inGameAlignment,
          isStarCard: card.IsStarCard,
          card,
        })
        : [];
      let targetAbility = (abilityId && abilities.find((a) => a.ability_id === abilityId)) || abilities[0];

      if (
        (!targetAbility || !targetAbility.effects || targetAbility.effects.length === 0 || abilityId === "fallback_band") &&
        card
      ) {
        const { AbilityResolver } = require("../ast/AbilityResolver");
        const fallbackBand = AbilityResolver.getFallbackBandAbility(card);
        if (fallbackBand) {
          targetAbility = fallbackBand;
        }
      }

      if (!targetAbility || !targetAbility.effects || targetAbility.effects.length === 0) {
        logger.warn(`[SelectTargetCommand] Ability not found for card '${card.Name}'.`);
        return;
      }

      const controllerPlayer = this.state.players.get(item.controllerId) || player;
      const sortedEffects = [...targetAbility.effects].sort((a, b) => (a.step || 1) - (b.step || 1));
      const stepIdx = typeof item.effectStepIndex === "number" && item.effectStepIndex >= 0
        ? item.effectStepIndex
        : (typeof item._currentStepIndex === "number" ? item._currentStepIndex : 0);
      const targetEffect = sortedEffects[stepIdx] || sortedEffects[0];
      const targetDef = targetEffect?.target || {};
      const eligible = TargetSelectionService.resolveEligibleTargets(
        this.room,
        controllerPlayer,
        targetDef,
        {
          sourceCard: card,
          actionType: targetEffect?.action,
          selectedPileId: item._selectedPileId || undefined,
        }
      );
      const validation = TargetSelectionService.validateSelection(
        { selectedCardIds, selectedPileId },
        eligible
      );

      if (!validation.valid) {
        logger.warn(`[SelectTargetCommand] Invalid target submitted: ${validation.reason}`);
        return;
      }

      // Restore priority to the item's controller before resolving (in case manual_opponent assigned priority to opponent)
      chronicle.priorityPlayerId = item.controllerId;

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
        ChronicleRollbackService.recordItemMutation(this.room, { itemData: preItemData });
        this.executedItem = preItemData;
        this.canUndo = true;
        return;
      }

      if (astResult && astResult.handled) {
        if (astResult.logEntries && astResult.logEntries.length > 0) {
          astResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
        } else {
          this.room.broadcastGameLog(`${controllerPlayer.name} resolves ${formatCardLink(card)}.`);
        }

        const resultSummary = EffectChronicleService.buildResultSummary(astResult, CHRONICLE_STATUS.COMPLETED, item);
        const historyRec = ChronicleHistoryService.recordHistory(
          chronicle,
          item,
          CHRONICLE_STATUS.COMPLETED,
          resultSummary
        );
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);

        ChronicleRollbackService.recordResolution(this.room, {
          itemData: preItemData,
          historyItemId: historyRec?.id || item.id,
          snapshots: astResult?.snapshots || [],
          wasInteractiveRoot: true,
          action: astResult?.snapshots?.[0]?.action || item.actionType,
          targetCardIds: EffectChronicleService.extractTargetCardIds(astResult?.snapshots),
        });

        EffectChronicleService.advanceChronicle(this.room);

        this.executedItem = preItemData;
        this.canUndo = true;
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

module.exports = { SelectTargetCommand };
