const { BaseCommand } = require("./BaseCommand");
const { moveCard } = require("../services/cardService");
const { MoveCardSnapshotHelper } = require("./MoveCardSnapshotHelper");
const { BattleTriggerService } = require("../services/BattleTriggerService");
const { ZONES } = require("../../../shared/zones");
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
          this.preMoveSnapshot = MoveCardSnapshotHelper.createSnapshot(targetCard, zoneName, player);
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

      // Early exit if move validation failed
      if (result.error) {
        this.client.send("gameToast", {
          message: result.error,
          type: "warning",
        });
        const failedCardId = message.cardId ?? (result.card ? result.card.id : null);
        if (failedCardId) {
          this.client.send("cardMoveFailed", {
            cardId: failedCardId,
            from: message.from,
            to: message.to,
            error: result.error,
          });
        }
        this.canUndo = false;
        this.preMoveSnapshot = null;
        return;
      }

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
          ZONES.DECK,
          ZONES.DISCARD,
          ZONES.HAND,
          ZONES.BANISH,
          ZONES.RESERVE,
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
      if (movedCards.length > 0 || divertedCards.length > 0) {
        if (!this.preMoveSnapshot && movedCards[0]) {
          this.preMoveSnapshot = MoveCardSnapshotHelper.createSnapshot(movedCards[0], message.from, player);
        }
        if (divertedCards.length > 0) {
          this.divertedSnapshots = divertedCards.map((card) =>
            MoveCardSnapshotHelper.createDeckSnapshot(card, player)
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

      // ✨ Phase 3: Battlefield & Battle Entry Triggers
      if (!result.error && message.to === ZONES.BATTLEFIELD && message.from !== ZONES.BATTLEFIELD) {
        BattleTriggerService.onCardEnteredBattlefield(this.room, player, movedCards, message);
      }
    } catch (err) {
      this.canUndo = false;
      logger.error(`[MoveCardCommand] Error:`, err);
      if (message && message.cardId) {
        this.client.send("cardMoveFailed", {
          cardId: message.cardId,
          from: message.from,
          to: message.to,
          error: "Internal move error",
        });
      }
    }
  }

  undo() {
    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (this.preMoveSnapshot) {
      MoveCardSnapshotHelper.undoSingleCard(this.room, this.state, this.preMoveSnapshot, player);
    }

    if (this.divertedSnapshots && this.divertedSnapshots.length > 0) {
      for (let i = this.divertedSnapshots.length - 1; i >= 0; i--) {
        MoveCardSnapshotHelper.undoSingleCard(this.room, this.state, this.divertedSnapshots[i], player);
      }
    }
  }
}

module.exports = { MoveCardCommand };

