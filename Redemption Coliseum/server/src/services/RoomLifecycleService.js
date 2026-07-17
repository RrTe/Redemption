const logger = require("../utils/logger");
const { PlayerFactory } = require("../factories/PlayerFactory");
const GameStateService = require("./GameStateService");

class RoomLifecycleService {
  /**
   * Handles a client joining the room, including saved state reclamation.
   */
  static handleJoin(room, client, options) {
    logger.debug(`[Lifecycle] handleJoin for ${client.sessionId}`);

    if (room.state.winnerId) {
      logger.warn(`[Lifecycle] Rejecting join to ended game: ${room.roomId}`);
      client.leave(4000, "Game is already over");
      return;
    }

    if (room.clients.length > room.maxClients) {
      client.leave(1000, "Room is full");
      return;
    }

    // Check for saved state reclamation
    if (room.savedPlayers && room.savedPlayers.length > 0) {
      if (typeof GameStateService.reclaimSavedPlayer === "function") {
        GameStateService.reclaimSavedPlayer(room, client, options);
        return;
      }
    }

    // Standard new player creation
    client.userData = {
      deck: options.deck || { main: [], reserve: [] },
      playerName:
        options.playerName || `Player ${client.sessionId.substr(0, 4)}`,
      deckName: options.deckName || "Random Deck",
    };

    const playerState = PlayerFactory.createPlayer(client, room.cardLookup);
    room.state.players.set(client.sessionId, playerState);

    logger.info(
      `[GameRoom] Player joined: ${client.sessionId}. Total: ${room.clients.length}`,
    );
  }

  /**
   * Handles a client leaving, managing reconnections and cleanup.
   */
  static async handleLeave(room, client, consented) {
    const player = room.state.players.get(client.sessionId);

    // ✨ FIX: Sobald ein Spieler geht, sperren wir den Raum.
    // Das verhindert, dass der freie Slot in der Lobby als "offen" angezeigt wird.
    room.lock();

    if (player) {
      player.connected = false;
      player.ready = false;
    }
    room.readyClients.delete(client.sessionId);

    logger.info(
      `[Lifecycle] Player left: ${client.sessionId}. Consented: ${consented}`,
    );

    if (room.state.winnerId) {
      room.state.players.delete(client.sessionId);
      if (room.state.players.size === 0) {
        logger.info(`[Lifecycle] Room empty after game end. Disconnecting.`);
        room.disconnect();
      }
      return;
    }

    try {
      // Wait for reconnection
      const reconnectedClient = await room.allowReconnection(client, 60);

      // ✨ FIX: Restore StateView for the reconnected client!
      if (room.clientViews && room.clientViews.has(reconnectedClient.sessionId)) {
        reconnectedClient.view = room.clientViews.get(reconnectedClient.sessionId);
      }

      if (player) {
        player.connected = true;
        // ✨ FIX: Nur wieder entsperren, wenn das Spiel noch NICHT läuft.
        // Wenn das Match läuft, bleibt der Raum für neue Spieler (außer Reconnects) gesperrt.
        if (!room.state.currentPhase) {
          room.unlock();
        }
        logger.info(`[Lifecycle] Player reconnected: ${client.sessionId}`);
      }
    } catch (e) {
      // Reconnection timeout
      room.state.players.delete(client.sessionId);
      if (room.clientViews) {
        room.clientViews.delete(client.sessionId);
      }
      logger.info(
        `[Lifecycle] Player removed after timeout: ${client.sessionId}`,
      );
    }
  }
}

module.exports = RoomLifecycleService;
