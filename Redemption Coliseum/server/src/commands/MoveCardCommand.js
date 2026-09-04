const { BaseCommand } = require("./BaseCommand");
const {
  moveCard,
  getZoneDisplayName,
  getZoneCollection,
} = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const { generateCardId } = require("../../../shared/utils");
const logger = require("../utils/logger");

class MoveCardCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this.preMoveSnapshot = null;
    this.divertedSnapshots = [];
  }

  execute(message) {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) {
      logger.error(
        `[MoveCardCommand] Player not found: ${this.client.sessionId}`,
      );
      return;
    }

    try {
      // 1. Capture snapshot before execution for undo support
      const targetCardId =
        message.cardId ??
        (typeof message.index === "string" ? message.index : null);
      if (targetCardId) {
        const targetCard = this.room.cardLookup.get(targetCardId);
        if (targetCard) {
          const zoneName = targetCard.zone || message.from;
          this.preMoveSnapshot = this._createSnapshot(targetCard, zoneName, player);
        }
      }

      const result = moveCard(
        player,
        this.state,
        this.room.cardLookup,
        message.from,
        message.to,
        message.cardId ?? message.index ?? 0,
        message.count ?? 1,
        message.coords,
        message.inGameType,
        message.inGameAlignment,
      );

      const movedCards = result.movedCards || [];
      const divertedCards = result.divertedCards || [];
      const movedCardId = message.cardId ?? (movedCards[0]?.id || null);

      if (movedCardId) {
        const movedCard = this.room.cardLookup.get(movedCardId);

        // A. DETACH
        if (movedCard && movedCard.attachedTo) {
          movedCard.attachedTo = null;
        }

        // B. CARRY CHILDREN (Leaving field)
        const isLeavingField = [
          "deck",
          "discard",
          "hand",
          "banish",
          "reserve",
        ].includes(message.to);
        if (isLeavingField) {
          for (const otherCard of this.room.cardLookup.values()) {
            if (otherCard.attachedTo === movedCardId) {
              otherCard.attachedTo = null;
              const owner = this.state.players.get(otherCard.originalOwnerId);
              if (owner) {
                moveCard(
                  owner,
                  this.state,
                  this.room.cardLookup,
                  otherCard.zone,
                  message.to,
                  otherCard.id,
                  1,
                  null,
                );
              }
            }
          }
        }

        // C. ATTACH
        if (message.coords && message.coords.attachTo) {
          const targetCard = this.room.cardLookup.get(message.coords.attachTo);
          if (movedCard && targetCard) {
            movedCard.attachedTo = targetCard.id;
          }
        }
      }

      // Events & Logging
      if (result.error) {
        this.client.send("gameToast", {
          message: result.error,
          type: "warning",
        });
        this.canUndo = false;
      } else if (movedCards.length > 0 || divertedCards.length > 0) {
        if (!this.preMoveSnapshot && movedCards[0]) {
          this.preMoveSnapshot = this._createSnapshot(movedCards[0], message.from, player);
        }
        if (divertedCards.length > 0) {
          this.divertedSnapshots = divertedCards.map((card) =>
            this._createDeckSnapshot(card, player)
          );
        }
        this.canUndo = true;
        logger.info(
          `[MoveCardCommand] Move succeeded (moved: ${movedCards.length}, diverted: ${divertedCards.length}). canUndo set to TRUE.`,
        );
      }

      // Only trigger draw animation when source is DECK
      if (message.from === ZONES.DECK && movedCards.length > 0) {
        this.client.send("cardsDrawn", {
          cardIds: movedCards.map((c) => c.id),
        });
      }

      // Use the descriptive log entry returned by cardService
      if (result.logEntry) {
        this.room.broadcastGameLog(result.logEntry);
      }
    } catch (err) {
      this.canUndo = false;
      logger.error(`[MoveCardCommand] Error:`, err);
    }
  }

  _createSnapshot(card, fromZone, player) {
    return {
      cardId: card.id,
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

  _createDeckSnapshot(card, player) {
    return {
      cardId: card.id,
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

  _undoSingleCard(snap, player) {
    const card = this.room.cardLookup.get(snap.cardId);
    if (!card) return;

    const currentZone = card.zone;

    // Reverse movement back to original zone and coordinates
    moveCard(
      player,
      this.state,
      this.room.cardLookup,
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

    const updatedCard = this.room.cardLookup.get(snap.cardId);
    if (updatedCard && snap.attachedTo) {
      updatedCard.attachedTo = snap.attachedTo;
    }

    // Broadcast mandatory human-readable undo log
    const fromDisplay = getZoneDisplayName(snap.fromZone, false);
    const toDisplay = getZoneDisplayName(currentZone, false);
    const templateId = generateCardId(snap.imageFile, snap.set, snap.cardName);
    const logMsg = `[UNDO] ${player.name} returned {{${templateId}|${snap.cardName}}} from ${toDisplay} to ${fromDisplay}.`;
    this.room.broadcastGameLog(logMsg);
  }

  undo() {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (this.preMoveSnapshot) {
      this._undoSingleCard(this.preMoveSnapshot, player);
    }

    if (this.divertedSnapshots && this.divertedSnapshots.length > 0) {
      for (let i = this.divertedSnapshots.length - 1; i >= 0; i--) {
        this._undoSingleCard(this.divertedSnapshots[i], player);
      }
    }
  }
}

module.exports = { MoveCardCommand };
