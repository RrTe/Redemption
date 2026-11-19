// server/src/services/ChronicleHistoryService.js
const { ChronicleItem } = require("../state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const logger = require("../utils/logger");

/**
 * Service managing Phase-Log history records for resolved and passed Chronicle items.
 * Enforces card-prefixed effect logging and phase reset purges.
 */
class ChronicleHistoryService {
  /**
   * Records a resolved or passed chronicle item into phase history.
   *
   * @param {import('../state/EffectChronicleState').EffectChronicleState} chronicle
   * @param {import('../state/EffectChronicleState').ChronicleItem} item
   * @param {string} [status]
   * @param {string} [resultSummary=""]
   * @returns {ChronicleItem | null} Recorded history item.
   */
  static recordHistory(chronicle, item, status = CHRONICLE_STATUS.COMPLETED, resultSummary = "") {
    if (!chronicle || !chronicle.history || !item) return null;

    const resolvedSummary =
      resultSummary ||
      (status === CHRONICLE_STATUS.PASSED ? "Passed" : "");

    const record = new ChronicleItem({
      id: item.id || `hist_${Date.now()}`,
      cardId: item.cardId || "",
      templateId: item.templateId || "",
      controllerId: item.controllerId || "",
      actionType: item.actionType || "",
      title: item.title || "Card",
      description: item.description || "",
      effectLabel: item.effectLabel || "",
      resultSummary: resolvedSummary,
      effectStepIndex: typeof item.effectStepIndex === "number" ? item.effectStepIndex : -1,
      status: status,
      order: chronicle.history.length + 1,
      abilityId: item.abilityId || "",
      isOptional: Boolean(item.isOptional),
    });

    chronicle.history.push(record);
    return record;
  }

  /**
   * Removes a history entry by item ID during Undo rollback and re-indexes orders.
   *
   * @param {import('../state/EffectChronicleState').EffectChronicleState} chronicle
   * @param {string} itemId
   * @returns {boolean} True if an entry was removed.
   */
  static removeHistoryById(chronicle, itemId) {
    if (!chronicle || !chronicle.history || !itemId) return false;
    let removed = false;
    for (let i = chronicle.history.length - 1; i >= 0; i--) {
      if (chronicle.history[i]?.id === itemId) {
        chronicle.history.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (removed) {
      chronicle.history.forEach((rec, idx) => {
        rec.order = idx + 1;
      });
    }
    return removed;
  }

  /**
   * Purges all recorded items from the current phase history and phase effect registry on phase transition.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static purgeHistory(room) {
    const chronicle = room?.state?.effectChronicle;
    if (chronicle && chronicle.history && chronicle.history.length > 0) {
      logger.info(
        `[ChronicleHistoryService] Purging ${chronicle.history.length} items from phase history.`
      );
      chronicle.history.splice(0, chronicle.history.length);
    }
    if (room?._phaseResolvedEffects instanceof Map) {
      room._phaseResolvedEffects.clear();
    }
    if (room) {
      room._abilityGroupLastSnapshot = null;
      room._abilityGroupMovedAny = null;
    }
  }
}

module.exports = { ChronicleHistoryService };
