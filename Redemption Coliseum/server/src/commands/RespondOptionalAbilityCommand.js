// server/src/commands/RespondOptionalAbilityCommand.js
const { BaseCommand } = require("./BaseCommand");
const { EffectChronicleService } = require("../services/EffectChronicleService");
const { ChronicleHistoryService } = require("../services/ChronicleHistoryService");
const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
const { AbilityLookup } = require("../ast/AbilityLookup");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { ActionTelegraphService } = require("../services/ActionTelegraphService");
const {
  formatCardLink,
  formatChronicleUndoLog,
} = require("../utils/gameLogFormatter");
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
    this.chronicleTx = null;
    this.canUndo = false;
    this._undone = false;
  }

  /**
   * Executes response to an optional ability prompt.
   *
   * @param {{ itemId?: string, accepted?: boolean, chosenAbilityId?: string }} message Client payload.
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
        EffectChronicleService.advanceChronicle(this.room);
      }
      return;
    }

    const item = chronicle.items[index];
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    const preItemData = ChronicleRollbackService.cloneChronicleItemData(item);
    const tx = ChronicleRollbackService.beginTransaction(this.room, { command: "RespondOptionalAbilityCommand" });

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
          const cardName = isMultiple
            ? `all ${psi.targetCardIds.length} characters`
            : formatCardLink(targetCard, "character");
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
          if (
            resumeResult &&
            (resumeResult.awaitingTargetSelection ||
              resumeResult.awaitingSpecialInitiative ||
              resumeResult.awaitingConfirmation)
          ) {
            ChronicleRollbackService.recordItemMutation(this.room, { itemData: preItemData });
            this.executedItem = preItemData;
            this.canUndo = true;
            return;
          }
          if (resumeResult?.logEntries?.length) {
            resumeResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
          }

          const resultSummary = EffectChronicleService.buildResultSummary(resumeResult, CHRONICLE_STATUS.COMPLETED, item);
          const historyRec = ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED, resultSummary);
          chronicle.items.splice(index, 1);
          EffectChronicleService._reindexOrders(chronicle);

          ChronicleRollbackService.recordResolution(this.room, {
            itemData: preItemData,
            historyItemId: historyRec?.id || item.id,
            snapshots: resumeResult?.snapshots || [],
            wasInteractiveRoot: true,
            action: resumeResult?.snapshots?.[0]?.action || item.actionType,
            targetCardIds: EffectChronicleService.extractTargetCardIds(resumeResult?.snapshots),
          });

          EffectChronicleService.advanceChronicle(this.room);
          this.executedItem = preItemData;
          this.canUndo = true;
          return;
        }

        // Defending player accepts Special Initiative -> card stays in battle!
        const isMultiple = Array.isArray(psi.targetCardIds) && psi.targetCardIds.length > 1;
        const targetCard = this.room.cardLookup?.get(psi.targetCardId);
        const cardName = isMultiple ? "all characters" : formatCardLink(targetCard, "character");
        this.room.broadcastGameLog(
          `✨ ${player.name} declares Special Initiative to defend ${cardName}!`
        );

        if (this.state.battle) {
          this.state.battle.specialInitiativePlayerId = this.client.sessionId;
        }

        const historyRec = ChronicleHistoryService.recordHistory(
          chronicle,
          item,
          CHRONICLE_STATUS.COMPLETED,
          "Declared Special Initiative"
        );
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);

        ChronicleRollbackService.recordResolution(this.room, {
          itemData: preItemData,
          historyItemId: historyRec?.id || item.id,
          snapshots: [],
          wasInteractiveRoot: true,
          action: "special_initiative",
          targetCardIds: [],
        });

        EffectChronicleService.advanceChronicle(this.room);
        this.executedItem = preItemData;
        this.canUndo = true;
        return;
      }

      // Clear persistent preview telegraph arrow from optional ability prompt
      ActionTelegraphService.clear(this.room, { sourceCardId: item?.cardId });

      const sourceCard = item?.cardId ? this.room.cardLookup?.get(item.cardId) : null;
      const sourceTitle = sourceCard ? formatCardLink(sourceCard) : item.title;

      if (!accepted) {
        const declineResult = this.room.abilityResolver.resolve(item, { accepted: false });
        if (declineResult?.logEntries?.length) {
          declineResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
        } else {
          this.room.broadcastGameLog(`${player.name} chooses not to activate ${sourceTitle}.`);
        }

        const historyRec = ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.PASSED, "Passed");
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);

        const removedSiblingItems = item._abilityGroupId
          ? EffectChronicleService.skipSiblingGroupItems(this.room, chronicle, item._abilityGroupId, "Passed")
          : [];

        ChronicleRollbackService.recordResolution(this.room, {
          itemData: preItemData,
          historyItemId: historyRec?.id || item.id,
          snapshots: [],
          wasInteractiveRoot: true,
          removedSiblingItems,
          action: item.actionType,
          targetCardIds: [],
        });

        EffectChronicleService.advanceChronicle(this.room);
        this.executedItem = preItemData;
        this.canUndo = true;
        return;
      }

      let insertedSiblingIds = [];
      if (message?.chosenAbilityId && sourceCard?.templateId && (item._choiceGroup || !item.abilityId)) {
        const abilities = AbilityLookup.resolveAbilities(sourceCard.templateId, {
          actionType: item.actionType,
          inGameType: sourceCard.inGameType,
          inGameAlignment: sourceCard.inGameAlignment,
        });
        const chosenAbility = abilities.find((a) => a.ability_id === message.chosenAbilityId);
        if (chosenAbility) {
          const expanded = EffectChronicleService.expandChoiceItemSteps(
            this.room,
            chronicle,
            index,
            chosenAbility,
            sourceCard
          );
          insertedSiblingIds = expanded.insertedSiblingIds;
        }
      }

      item.isConfirmed = true;
      if (message && message.chosenAbilityId) {
        item.abilityId = message.chosenAbilityId;
      }
      const astResult = this.room.abilityResolver.resolve(item, {
        accepted: true,
        chosenAbilityId: message?.chosenAbilityId,
      });

      if (
        astResult &&
        (astResult.awaitingTargetSelection ||
          astResult.awaitingSpecialInitiative ||
          astResult.awaitingConfirmation)
      ) {
        logger.info(`[RespondOptionalAbilityCommand] Item '${item.title}' now awaiting further response.`);
        ChronicleRollbackService.recordItemMutation(this.room, {
          itemData: preItemData,
          insertedSiblingIds,
        });
        this.executedItem = preItemData;
        this.canUndo = true;
        return;
      }

      if (astResult?.logEntries?.length) {
        astResult.logEntries.forEach((msg) => this.room.broadcastGameLog(msg));
      } else {
        const abilityText = item.description ? `: "${item.description}"` : "";
        this.room.broadcastGameLog(`${player.name} activates ${sourceTitle}${abilityText}.`);
      }

      const resultSummary = EffectChronicleService.buildResultSummary(astResult, CHRONICLE_STATUS.COMPLETED, item);
      const historyRec = ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED, resultSummary);
      chronicle.items.splice(index, 1);
      EffectChronicleService._reindexOrders(chronicle);

      const removedSiblingItems =
        astResult?.noValidTargets && item._abilityGroupId
          ? EffectChronicleService.skipSiblingGroupItems(
              this.room,
              chronicle,
              item._abilityGroupId,
              "Skipped (no cost/target)",
              true
            )
          : [];

      ChronicleRollbackService.recordResolution(this.room, {
        itemData: preItemData,
        historyItemId: historyRec?.id || item.id,
        snapshots: astResult?.snapshots || [],
        wasInteractiveRoot: true,
        insertedSiblingIds,
        removedSiblingItems,
        action: astResult?.snapshots?.[0]?.action || item.actionType,
        targetCardIds: EffectChronicleService.extractTargetCardIds(astResult?.snapshots),
      });

      EffectChronicleService.advanceChronicle(this.room);

      this.executedItem = preItemData;
      this.canUndo = true;
    } catch (err) {
      logger.error(`[RespondOptionalAbilityCommand] Fatal error resolving chronicle item '${item.title}':`, err);
      chronicle.items.splice(index, 1);
      EffectChronicleService._reindexOrders(chronicle);
      EffectChronicleService.advanceChronicle(this.room);
    } finally {
      this.chronicleTx = ChronicleRollbackService.endTransaction(this.room, tx);
    }
  }

  /**
   * Undoes the optional ability or Special Initiative response and re-prompts cleanly.
   */
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

module.exports = { RespondOptionalAbilityCommand };
