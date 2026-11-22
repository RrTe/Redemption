// server/src/services/ChronicleRollbackService.js
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { AST_MESSAGES } = require("../../../shared/astConstants");
const { EffectMutationReverser } = require("../ast/EffectMutationReverser");
const { ChronicleHistoryService } = require("./ChronicleHistoryService");
const { ActionTelegraphService } = require("./ActionTelegraphService");
const { BattleService } = require("./BattleService");
const { replaceArraySchemaOrder } = require("./cardService");
const logger = require("../utils/logger");

/**
 * Orchestrates transactional Undo rollbacks across the Effect Chronicle,
 * AST effect handlers, Special Initiative windows, and orphaned battle cleanups,
 * and maintains a phase-scoped registry of resolved effects for future Negate/Interrupt support.
 */
class ChronicleRollbackService {
  /**
   * Begins a nesting-safe undo transaction on the room.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @param {object} [meta={}] Optional metadata describing the transaction source.
   * @returns {object} Transaction context.
   */
  static beginTransaction(room, meta = {}) {
    if (!room) return null;
    if (!Array.isArray(room._undoTxStack)) {
      room._undoTxStack = [];
    }

    const battle = room.state?.battle;
    const preBattleState = battle
      ? {
          rescueAttemptOccurred: Boolean(battle.rescueAttemptOccurred),
          blockOccurred: Boolean(battle.blockOccurred),
          lastBattleCardPlayerId: room.state?.lastBattleCardPlayerId || "",
          initiativeOverridePlayerId: battle.initiativeOverridePlayerId || "",
          specialInitiativePlayerId: battle.specialInitiativePlayerId || "",
        }
      : null;

    const chronicle = room.state?.effectChronicle;
    const preChronicleState = chronicle
      ? {
          priorityPlayerId: chronicle.priorityPlayerId || "",
          isResolving: Boolean(chronicle.isResolving),
        }
      : null;

    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      meta,
      preBattleState,
      preChronicleState,
      entries: [],
    };
    room._undoTxStack.push(tx);
    return tx;
  }

  /**
   * Ends an open undo transaction, merging entries into any enclosing outer transaction.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @param {object} tx Transaction returned by `beginTransaction`.
   * @returns {object | null} Completed transaction.
   */
  static endTransaction(room, tx) {
    if (!room || !tx || !Array.isArray(room._undoTxStack)) return tx || null;
    const idx = room._undoTxStack.lastIndexOf(tx);
    if (idx !== -1) {
      room._undoTxStack.splice(idx, 1);
    }
    if (room._undoTxStack.length > 0 && tx.entries.length > 0) {
      const parentTx = room._undoTxStack[room._undoTxStack.length - 1];
      parentTx.entries.push(...tx.entries);
    }
    return tx;
  }

  /**
   * Returns the currently active innermost transaction on the room, if any.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @returns {object | null} Active transaction or null.
   */
  static getActiveTransaction(room) {
    if (!room || !Array.isArray(room._undoTxStack) || room._undoTxStack.length === 0) {
      return null;
    }
    return room._undoTxStack[room._undoTxStack.length - 1];
  }

  /**
   * Deeply clones a ChronicleItem including transient runtime execution state.
   *
   * @param {object} item Source ChronicleItem.
   * @returns {object | null} Plain serializable clone.
   */
  static cloneChronicleItemData(item) {
    if (!item) return null;
    const psi = item.pendingSpecialInitiative
      ? {
          ...item.pendingSpecialInitiative,
          targetCardIds: Array.isArray(item.pendingSpecialInitiative.targetCardIds)
            ? [...item.pendingSpecialInitiative.targetCardIds]
            : undefined,
          options: item.pendingSpecialInitiative.options
            ? { ...item.pendingSpecialInitiative.options }
            : {},
        }
      : null;

    return {
      id: item.id || "",
      cardId: item.cardId || "",
      templateId: item.templateId || "",
      controllerId: item.controllerId || "",
      actionType: item.actionType || "",
      title: item.title || "",
      description: item.description || "",
      effectLabel: item.effectLabel || "",
      resultSummary: item.resultSummary || "",
      effectStepIndex: typeof item.effectStepIndex === "number" ? item.effectStepIndex : -1,
      status: item.status || CHRONICLE_STATUS.PENDING,
      order: typeof item.order === "number" ? item.order : 1,
      abilityId: item.abilityId || "",
      isOptional: Boolean(item.isOptional),
      _choiceGroup: item._choiceGroup || "",
      _abilityGroupId: item._abilityGroupId || "",
      _previousSnapshot: item._previousSnapshot || null,
      _inspectedOpponentReserve: Boolean(item._inspectedOpponentReserve),
      _selectedPileId: item._selectedPileId || "",
      _inspectedEmptyPile: Boolean(item._inspectedEmptyPile),
      isConfirmed: Boolean(item.isConfirmed),
      isDeclared: Boolean(item.isDeclared),
      pendingSpecialInitiative: psi,
    };
  }

  /**
   * Reconstructs a ChronicleItem Schema instance with restored transient metadata.
   *
   * @param {object} data Cloned item descriptor.
   * @returns {ChronicleItem} Restored Schema instance.
   */
  static buildChronicleItem(data) {
    const item = new ChronicleItem({
      id: data.id,
      cardId: data.cardId,
      templateId: data.templateId,
      controllerId: data.controllerId,
      actionType: data.actionType,
      title: data.title,
      description: data.description,
      effectLabel: data.effectLabel,
      resultSummary: "",
      effectStepIndex: data.effectStepIndex,
      status: CHRONICLE_STATUS.PENDING,
      order: data.order || 1,
      abilityId: data.abilityId,
      isOptional: data.isOptional,
    });
    if (data._choiceGroup) item._choiceGroup = data._choiceGroup;
    if (data._abilityGroupId) item._abilityGroupId = data._abilityGroupId;
    if (data._previousSnapshot) item._previousSnapshot = data._previousSnapshot;
    if (data._inspectedOpponentReserve) item._inspectedOpponentReserve = true;
    if (data._selectedPileId) item._selectedPileId = data._selectedPileId;
    if (data._inspectedEmptyPile) item._inspectedEmptyPile = true;
    if (data.isConfirmed) item.isConfirmed = true;
    if (data.isDeclared) item.isDeclared = true;
    if (data.pendingSpecialInitiative) {
      item.pendingSpecialInitiative = { ...data.pendingSpecialInitiative };
    }
    return item;
  }

  static recordEnqueue(room, itemIds) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !Array.isArray(itemIds) || itemIds.length === 0) return;
    tx.entries.push({ type: "ENQUEUE_ITEMS", itemIds: [...itemIds] });
  }

  static recordResolution(room, entry) {
    if (!room || !entry || !entry.itemData) return;

    // Register resolved effect snapshots in phase registry for future Negate/Interrupt support
    if (!room._phaseResolvedEffects) {
      room._phaseResolvedEffects = new Map();
    }
    if (entry.itemData.id) {
      room._phaseResolvedEffects.set(entry.itemData.id, {
        itemId: entry.itemData.id,
        cardId: entry.itemData.cardId,
        abilityId: entry.itemData.abilityId,
        effectStepIndex: entry.itemData.effectStepIndex,
        action: entry.action || "",
        snapshots: Array.isArray(entry.snapshots) ? [...entry.snapshots] : [],
        targetCardIds: Array.isArray(entry.targetCardIds) ? [...entry.targetCardIds] : [],
        resolvedAt: Date.now(),
      });
    }

    const tx = this.getActiveTransaction(room);
    if (tx) {
      tx.entries.push({ type: "RESOLVE_ITEM", ...entry });
    }
  }

  static recordItemMutation(room, entry) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !entry || !entry.itemData) return;
    tx.entries.push({ type: "ITEM_MUTATION", ...entry });
  }

  static recordOrphanedDiscard(room, move) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !move) return;
    tx.entries.push({ type: "ORPHANED_DISCARD", move });
  }

  static recordConsumeSi(room, entry) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !entry || !entry.itemData) return;
    tx.entries.push({ type: "CONSUME_SI", ...entry });
  }

  static recordPartialSnapshot(room, snapshot) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !snapshot) return;
    tx.entries.push({ type: "PARTIAL_SNAPSHOT", snapshot });
  }

  static recordCostPaidChange(room, cardId, prevValue) {
    const tx = this.getActiveTransaction(room);
    if (!tx || !cardId) return;
    tx.entries.push({ type: "COST_PAID_CHANGE", cardId, prevValue: Boolean(prevValue) });
  }

  /**
   * Clears the phase-scoped resolved effect registry on phase transitions.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   */
  static purgePhaseRegistry(room) {
    if (room?._phaseResolvedEffects instanceof Map) {
      room._phaseResolvedEffects.clear();
    }
  }

  /**
   * Rolls back all mutations, chronicle queue changes, history records, battle flags,
   * and client prompts recorded within a transaction in strict reverse order.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @param {object} tx Completed transaction context.
   * @param {object} [actingPlayer] Acting player performing Undo.
   * @param {object} [options={}] Rollback flags (`restoreBattleState`, `recalculateBattle`, `reprompt`).
   * @returns {{ reversedMovements: Array<object>, extraDetails: string[] }} Reversal summary.
   */
  static rollbackTransaction(room, tx, actingPlayer = null, options = {}) {
    if (!room || !tx) {
      return { reversedMovements: [], extraDetails: [] };
    }

    // Close stale interactive prompts/targeting overlays and clear telegraph arrows
    if (typeof room.broadcast === "function") {
      room.broadcast(AST_MESSAGES.CANCEL_INTERACTION, { reason: "undo" });
    }
    ActionTelegraphService.clear(room);

    const chronicle = room.state?.effectChronicle;
    const enqueuedIdsInTx = this._collectTxGeneratedIds(tx.entries);
    const reversedMovements = [];
    const extraDetails = [];
    let battlefieldAffected = false;

    for (let i = tx.entries.length - 1; i >= 0; i--) {
      const entry = tx.entries[i];
      if (!entry) continue;

      switch (entry.type) {
        case "PARTIAL_SNAPSHOT": {
          const res = EffectMutationReverser.revertSnapshot(room, entry.snapshot, actingPlayer, { isUndo: true });
          reversedMovements.push(...res.reversedMovements);
          extraDetails.push(...res.extraDetails);
          if (res.battlefieldAffected) battlefieldAffected = true;
          break;
        }

        case "ORPHANED_DISCARD": {
          const res = EffectMutationReverser.revertSnapshot(
            room,
            { movedCards: [entry.move] },
            actingPlayer,
            { isUndo: true }
          );
          reversedMovements.push(...res.reversedMovements);
          if (res.battlefieldAffected) battlefieldAffected = true;
          break;
        }

        case "COST_PAID_CHANGE": {
          const card = room.cardLookup?.get(entry.cardId);
          if (card) card._lastCostPaid = Boolean(entry.prevValue);
          break;
        }

        case "ITEM_MUTATION": {
          this._rollbackItemMutation(room, chronicle, entry);
          break;
        }

        case "RESOLVE_ITEM": {
          const res = EffectMutationReverser.revertSnapshots(room, entry.snapshots, actingPlayer, { isUndo: true });
          reversedMovements.push(...res.reversedMovements);
          extraDetails.push(...res.extraDetails);
          if (res.battlefieldAffected) battlefieldAffected = true;

          this._rollbackResolvedItem(room, chronicle, entry, enqueuedIdsInTx);
          break;
        }

        case "ENQUEUE_ITEMS": {
          for (const id of entry.itemIds || []) {
            this._removeChronicleItemById(chronicle, id);
            ChronicleHistoryService.removeHistoryById(chronicle, id);
            room._phaseResolvedEffects?.delete(id);
            if (room._pendingSpecialInitiativeItem?.id === id) {
              room._pendingSpecialInitiativeItem = null;
            }
          }
          break;
        }

        case "CONSUME_SI": {
          ChronicleHistoryService.removeHistoryById(chronicle, entry.historyItemId || entry.itemData.id);
          room._phaseResolvedEffects?.delete(entry.itemData.id);
          const restored = this._prependChronicleItem(chronicle, entry.itemData);
          if (restored) {
            room._pendingSpecialInitiativeItem = restored;
          }
          if (room.state?.battle) {
            room.state.battle.specialInitiativePlayerId =
              entry.prevSpecialInitiativePlayerId ||
              entry.itemData.pendingSpecialInitiative?.targetOwnerId ||
              "";
          }
          break;
        }

        default:
          logger.warn(`[ChronicleRollbackService] Unknown tx entry type '${entry.type}'.`);
      }
    }

    if (options.restoreBattleState !== false && room.state?.battle && tx.preBattleState) {
      room.state.battle.rescueAttemptOccurred = tx.preBattleState.rescueAttemptOccurred;
      room.state.battle.blockOccurred = tx.preBattleState.blockOccurred;
      room.state.lastBattleCardPlayerId = tx.preBattleState.lastBattleCardPlayerId;
      room.state.battle.initiativeOverridePlayerId = tx.preBattleState.initiativeOverridePlayerId;
      room.state.battle.specialInitiativePlayerId = tx.preBattleState.specialInitiativePlayerId;
      if (!room.state.battle.specialInitiativePlayerId) {
        room._pendingSpecialInitiativeItem = null;
      }
    }

    if ((battlefieldAffected || options.recalculateBattle) && !options.skipBattleRecalc) {
      BattleService.recalculate(room);
    }

    if (chronicle) {
      chronicle.items.forEach((it, idx) => {
        it.order = idx + 1;
      });
      chronicle.isResolving = chronicle.items.length > 0;
      if (chronicle.items.length === 0) {
        chronicle.priorityPlayerId = "";
      } else {
        const head = chronicle.items[0];
        chronicle.priorityPlayerId =
          head.pendingSpecialInitiative?.targetOwnerId ||
          head.controllerId ||
          tx.preChronicleState?.priorityPlayerId ||
          "";
      }

      if (chronicle.items.length > 0 && options.reprompt !== false && room.abilityResolver?.repromptItem) {
        room.abilityResolver.repromptItem(chronicle.items[0]);
      }
    }

    return { reversedMovements, extraDetails };
  }

  /** @private */
  static _collectTxGeneratedIds(entries) {
    const ids = new Set();
    for (const entry of entries || []) {
      if (entry?.type === "ENQUEUE_ITEMS") {
        for (const id of entry.itemIds || []) ids.add(id);
      } else if (Array.isArray(entry?.insertedSiblingIds)) {
        for (const id of entry.insertedSiblingIds) ids.add(id);
      }
    }
    return ids;
  }

  /** @private */
  static _rollbackItemMutation(room, chronicle, entry) {
    if (!chronicle) return;
    for (const sibId of entry.insertedSiblingIds || []) {
      this._removeChronicleItemById(chronicle, sibId);
    }
    this._removeChronicleItemById(chronicle, entry.itemData.id);
    const restored = this._prependChronicleItem(chronicle, entry.itemData);
    if (!entry.itemData.pendingSpecialInitiative && room.state?.battle?.specialInitiativePlayerId) {
      room.state.battle.specialInitiativePlayerId = "";
      if (room._pendingSpecialInitiativeItem?.id === entry.itemData.id) {
        room._pendingSpecialInitiativeItem = null;
      }
    } else if (entry.itemData.pendingSpecialInitiative && restored) {
      room._pendingSpecialInitiativeItem = restored;
    }
  }

  /** @private */
  static _rollbackResolvedItem(room, chronicle, entry, enqueuedIdsInTx) {
    const itemData = entry.itemData;
    if (chronicle) {
      ChronicleHistoryService.removeHistoryById(chronicle, entry.historyItemId || itemData.id);
    }
    room._phaseResolvedEffects?.delete(itemData.id);

    for (const sibId of entry.insertedSiblingIds || []) {
      this._removeChronicleItemById(chronicle, sibId);
      ChronicleHistoryService.removeHistoryById(chronicle, sibId);
      room._phaseResolvedEffects?.delete(sibId);
    }

    if (itemData._abilityGroupId && (itemData.effectStepIndex <= 0 || itemData.effectStepIndex === -1)) {
      room._abilityGroupLastSnapshot?.delete(itemData._abilityGroupId);
      room._abilityGroupMovedAny?.delete(itemData._abilityGroupId);
    }

    if (Array.isArray(entry.removedSiblingItems) && entry.removedSiblingItems.length > 0) {
      for (let s = entry.removedSiblingItems.length - 1; s >= 0; s--) {
        const sibData = entry.removedSiblingItems[s];
        ChronicleHistoryService.removeHistoryById(chronicle, sibData.id);
        room._phaseResolvedEffects?.delete(sibData.id);
        this._prependChronicleItem(chronicle, sibData);
      }
    }

    if (entry.wasInteractiveRoot || !enqueuedIdsInTx.has(itemData.id)) {
      this._prependChronicleItem(chronicle, itemData);
    }
  }

  /** @private */
  static _removeChronicleItemById(chronicle, itemId) {
    if (!chronicle || !chronicle.items || !itemId) return;
    for (let i = chronicle.items.length - 1; i >= 0; i--) {
      if (chronicle.items[i]?.id === itemId) {
        chronicle.items.splice(i, 1);
      }
    }
  }

  /** @private */
  static _prependChronicleItem(chronicle, itemData) {
    if (!chronicle || !chronicle.items || !itemData) return null;
    const existing = chronicle.items.find((i) => i.id === itemData.id);
    if (existing) return existing;

    const restored = this.buildChronicleItem(itemData);
    if (typeof chronicle.items.clear === "function") {
      replaceArraySchemaOrder(chronicle.items, [restored, ...Array.from(chronicle.items)]);
    } else {
      chronicle.items.unshift(restored);
    }
    return restored;
  }
}

module.exports = { ChronicleRollbackService };
