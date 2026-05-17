const logger = require("../utils/logger");
const crypto = require("crypto");
const { PlayerState } = require("../state/PlayerState");
const { Card } = require("../state/Card");
const { ZONES } = require("../../../shared/zones");
const util = require("util");

const SECRET_KEY =
  process.env.SAVE_GAME_SECRET || "RedemptionColiseum_SuperSecretKey_2026";

class GameStateService {
  /**
   * Restores the game state from a saved JSON object.
   * @param {import('../rooms/GameRoom').GameRoom} room The GameRoom instance.
   * @param {object} incomingData The saved game data.
   */
  static restoreState(room, incomingData) {
    logger.info("[GameStateService] Restoring saved game state...");

    let savedDataWrapper = incomingData;

    if (incomingData.signature && incomingData.data) {
      const payloadString = JSON.stringify(incomingData.data);
      const expectedSignature = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(payloadString)
        .digest("hex");

      if (expectedSignature !== incomingData.signature) {
        logger.error(
          "[SECURITY] Save file manipulation detected! Signature mismatch.",
        );
        throw new Error(
          "Invalid save file signature. The file may have been tampered with.",
        );
      }
      logger.info("[SECURITY] Save file signature verified.");
      savedDataWrapper = incomingData.data;
    } else {
      logger.warn("[SECURITY] Loading legacy save file without signature.");
    }

    const savedData = savedDataWrapper.state || savedDataWrapper;
    const savedBy = savedDataWrapper.savedBySessionId;

    if (savedDataWrapper.chatHistory) {
      room.chatHistory = savedDataWrapper.chatHistory;
    }

    room.state.currentPhase = savedData.currentPhase;

    const restoreCard = (cardData) => {
      const card = new Card();
      Object.assign(card, cardData);
      room.cardLookup.set(card.id, card);
      
      logger.debug(`[GameStateService] Restored Global Card: ${card.Name} (${card.id}), ` +
        `Owner: ${card.originalOwnerId}, ` +
        `Controller: ${card.controllerId}, ` +
        `Zone: ${card.zone}`);
        
      return card;
    };

    if (savedData.battlefield) {
      savedData.battlefield.forEach((c) =>
        room.state.battlefield.push(restoreCard(c)),
      );
    }
    if (savedData.revealedCards) {
      savedData.revealedCards.forEach((c) =>
        room.state.revealedCards.push(restoreCard(c)),
      );
    }

    room.savedPlayers = [];
    for (const key in savedData.players) {
      const pData = savedData.players[key];
      pData._oldSessionId = key;
      room.savedPlayers.push(pData);
    }

    if (savedBy) {
      room.savedPlayers.sort((a, b) => {
        return a._oldSessionId === savedBy ? -1 : 1;
      });
    }

    logger.info(
      `[GameStateService] State restored. Waiting for ${room.savedPlayers.length} players to reclaim slots.`,
    );
  }

  /**
   * Reclaims a saved player slot for a new client.
   * @param {import('../rooms/GameRoom').GameRoom} room The GameRoom instance.
   * @param {import('colyseus').Client} client The new client.
   * @param {object} options Client options.
   */
  static reclaimSavedPlayer(room, client, options) {
    const savedData = room.savedPlayers.shift();

    room.oldToNewSessionIdMap.set(savedData._oldSessionId, client.sessionId);

    client.userData = {
      deck: [],
      playerName:
        options.playerName ||
        savedData.name ||
        `Player ${client.sessionId.substr(0, 4)}`,
      deckName: savedData.deckName || "Loaded Deck",
    };

    const p = new PlayerState();
    p.sessionId = client.sessionId;
    p.name = options.playerName || savedData.name;
    p.deckName = savedData.deckName;
    p.redeemedSouls = savedData.redeemedSouls;
    p.turn = savedData.turn;
    p.connected = true;
    p.ready = false;

    const restoreZone = (zoneName) => {
      if (savedData[zoneName]) {
        savedData[zoneName].forEach((cData) => {
          const card = new Card();
          Object.assign(card, cData);
          card.controllerId = client.sessionId;

          logger.debug(`[GameStateService] Reclaimed Card: ${card.Name} (${card.id}) in ${zoneName} for ${p.name}. ` +
            `Owner: ${card.originalOwnerId}, Controller: ${card.controllerId}`);
            
          p[zoneName].push(card);
          room.cardLookup.set(card.id, card);
        });
      }
    };

    const zones = [
      ZONES.DECK,
      ZONES.HAND,
      ZONES.DISCARD,
      ZONES.RESERVE,
      ZONES.LAND_OF_REDEMPTION,
      ZONES.BANISH,
      ZONES.TERRITORY,
      ZONES.LAND_OF_BONDAGE,
    ];
    zones.forEach((zone) => restoreZone(zone));

    room.state.players.set(client.sessionId, p);

    logger.info(
      `[GameStateService] Player ${client.sessionId} reclaimed a saved slot.`,
    );

    if (room.savedPlayers.length === 0) {
      GameStateService._fixCardOwnershipAfterLoad(room);
      room.state.activePlayer = Array.from(room.state.players.keys())[0];
    }
  }

  /**
   * Corrects the originalOwnerId of all cards after loading a game.
   * @param {import('../rooms/GameRoom').GameRoom} room The GameRoom instance.
   */
  static _fixCardOwnershipAfterLoad(room) {
    logger.info(
      `[GameStateService] All players reclaimed slots. Fixing originalOwnerId on all cards...`,
    );
    logger.debug(`[GameStateService] ID Mapping: ${util.inspect(Object.fromEntries(room.oldToNewSessionIdMap))}`);
    
    for (const card of room.cardLookup.values()) {
      const oldOwnerId = card.originalOwnerId;
      const newOwnerId = room.oldToNewSessionIdMap.get(oldOwnerId);
      if (newOwnerId) {
        if (card.originalOwnerId !== newOwnerId) {
          logger.debug(`[GameStateService] Fixing Owner: Card ${card.id} (${card.Name}) oldOwner=${oldOwnerId} -> newOwner=${newOwnerId}`);
          card.originalOwnerId = newOwnerId;
        }
      } else {
        logger.warn(
          `[GameStateService] Could not find new session ID for old owner '${oldOwnerId}' on card '${card.id}'.`,
        );
      }
    }
    logger.info(`[GameStateService] Finished fixing card ownership.`);
  }
}

module.exports = GameStateService;
