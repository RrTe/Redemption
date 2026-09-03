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
          let owner =
            this.state.players.get(targetCard.controllerId) || player;
          const zoneName = targetCard.zone || message.from;

          this.preMoveSnapshot = {
            cardId: targetCard.id,
            cardName: targetCard.Name,
            imageFile: targetCard.ImageFile,
            set: targetCard.Set,
            fromZone: zoneName,
            fromCoords: { x: targetCard.x, y: targetCard.y },
            controllerId: targetCard.controllerId || owner?.sessionId || player.sessionId,
            originalOwnerId: targetCard.originalOwnerId || player.sessionId,
            isFaceUp: targetCard.isFaceUp,
            rotation: targetCard.rotation,
            isParalyzed: targetCard.isParalyzed,
            paralyzeRounds: targetCard.paralyzeRounds,
            isSetAside: targetCard.isSetAside,
            setAsideRounds: targetCard.setAsideRounds,
            attachedTo: targetCard.attachedTo,
            inGameType: targetCard.inGameType,
            inGameAlignment: targetCard.inGameAlignment,
            counters: targetCard.counters
              ? Object.fromEntries(targetCard.counters.entries())
              : {},
          };
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
      } else if (movedCards.length > 0) {
        if (!this.preMoveSnapshot && movedCards[0]) {
          const firstCard = movedCards[0];
          this.preMoveSnapshot = {
            cardId: firstCard.id,
            cardName: firstCard.Name,
            imageFile: firstCard.ImageFile,
            set: firstCard.Set,
            fromZone: message.from,
            fromIndex: -1,
            fromCoords: { x: firstCard.x, y: firstCard.y },
            controllerId: firstCard.controllerId || player.sessionId,
            originalOwnerId: firstCard.originalOwnerId || player.sessionId,
            isFaceUp: firstCard.isFaceUp,
            rotation: firstCard.rotation,
            isParalyzed: firstCard.isParalyzed,
            paralyzeRounds: firstCard.paralyzeRounds,
            isSetAside: firstCard.isSetAside,
            setAsideRounds: firstCard.setAsideRounds,
            attachedTo: firstCard.attachedTo,
            inGameType: firstCard.inGameType,
            inGameAlignment: firstCard.inGameAlignment,
            counters: firstCard.counters ? Object.fromEntries(firstCard.counters.entries()) : {},
          };
        }
        this.canUndo = true;
        logger.info(
          `[MoveCardCommand] Move succeeded for '${this.preMoveSnapshot?.cardName}'. canUndo set to TRUE.`,
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

  undo() {
    if (!this.preMoveSnapshot) return;
    const snap = this.preMoveSnapshot;
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

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
}

module.exports = { MoveCardCommand };
