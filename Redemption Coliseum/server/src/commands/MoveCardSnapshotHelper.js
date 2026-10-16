// server/src/commands/MoveCardSnapshotHelper.js
const { moveCard } = require("../services/cardService");
const { formatCardUndoLog } = require("../utils/gameLogFormatter");
const { ZONES } = require("../../../shared/zones");

/**
 * Helper class providing snapshot and rollback capabilities for MoveCardCommand.
 * Decoupled to enforce file-size limits and Single Responsibility.
 */
class MoveCardSnapshotHelper {
  /**
   * Captures the pre-move state of a card.
   *
   * @param {object} card Card instance.
   * @param {string} fromZone Origin zone.
   * @param {object} player Acting player.
   * @returns {object} State snapshot.
   */
  static createSnapshot(card, fromZone, player) {
    return {
      cardId: card.id,
      templateId: card.templateId || card.ImageFile,
      cardName: card.Name,
      imageFile: card.ImageFile,
      set: card.Set,
      fromZone: fromZone || card.zone,
      fromCoords: { x: card.x, y: card.y },
      controllerId: card.controllerId || player?.sessionId,
      originalOwnerId: card.originalOwnerId || player?.sessionId,
      isFaceUp: card.isFaceUp,
      rotation: card.rotation,
      isParalyzed: card.isParalyzed,
      paralyzeRounds: card.paralyzeRounds,
      isSetAside: card.isSetAside,
      setAsideRounds: card.setAsideRounds,
      attachedTo: card.attachedTo,
      inGameType: card.inGameType,
      inGameAlignment: card.inGameAlignment,
      counters: card.counters ? Object.fromEntries(card.counters.entries()) : {},
    };
  }

  /**
   * Captures a deck diversion snapshot.
   *
   * @param {object} card Card instance.
   * @param {object} player Acting player.
   * @returns {object} Deck snapshot.
   */
  static createDeckSnapshot(card, player) {
    return {
      cardId: card.id,
      templateId: card.templateId || card.ImageFile,
      cardName: card.Name,
      imageFile: card.ImageFile,
      set: card.Set,
      fromZone: ZONES.DECK,
      fromCoords: { x: 0, y: 0 },
      controllerId: card.controllerId || player?.sessionId,
      originalOwnerId: card.originalOwnerId || player?.sessionId,
      isFaceUp: false,
      rotation: 0,
      isParalyzed: false,
      paralyzeRounds: 0,
      isSetAside: false,
      setAsideRounds: 0,
      attachedTo: null,
      inGameType: "",
      inGameAlignment: "",
      counters: {},
    };
  }

  /**
   * Rolls back a single card move using a captured snapshot.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Game room instance.
   * @param {object} state Room state.
   * @param {object} snap Snapshot object.
   * @param {object} player Acting player.
   */
  static undoSingleCard(room, state, snap, player) {
    const card = room.cardLookup.get(snap.cardId);
    if (!card) return;

    const currentZone = card.zone;

    // Reverse movement back to original zone and coordinates
    moveCard(
      player,
      state,
      room.cardLookup,
      currentZone,
      snap.fromZone,
      snap.cardId,
      1,
      {
        x: snap.fromCoords.x,
        y: snap.fromCoords.y,
        targetPlayerId: snap.controllerId,
      },
      snap.inGameType,
      snap.inGameAlignment,
      {
        isUndo: true,
        snapshot: snap,
      },
    );

    const updatedCard = room.cardLookup.get(snap.cardId);
    if (updatedCard && snap.attachedTo) {
      updatedCard.attachedTo = snap.attachedTo;
    }

    // Broadcast mandatory human-readable undo log
    const logMsg = formatCardUndoLog(
      player.name,
      { templateId: snap.templateId, Name: snap.cardName },
      currentZone,
      snap.fromZone,
      false
    );
    room.broadcastGameLog(logMsg);
  }
}

module.exports = { MoveCardSnapshotHelper };
