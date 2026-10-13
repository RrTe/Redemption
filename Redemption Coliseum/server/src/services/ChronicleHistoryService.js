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
   */
  static recordHistory(chronicle, item, status = CHRONICLE_STATUS.COMPLETED) {
    if (!chronicle || !chronicle.history || !item) return;

    const record = new ChronicleItem({
      id: item.id || `hist_${Date.now()}`,
      cardId: item.cardId || "",
      controllerId: item.controllerId || "",
      actionType: item.actionType || "",
      title: item.title || "Card",
      description: item.description || "",
      status: status,
      order: chronicle.history.length + 1,
      abilityId: item.abilityId || "",
      isOptional: Boolean(item.isOptional),
    });

    chronicle.history.push(record);
  }

  /**
   * Purges all recorded items from the current phase history on phase transition.
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
  }
}

module.exports = { ChronicleHistoryService };
