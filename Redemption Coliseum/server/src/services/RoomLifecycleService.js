const logger = require("../utils/logger");
const { PlayerFactory } = require("../factories/PlayerFactory");
const GameStateService = require("./GameStateService");
const MatchService = require("./MatchService");
const { NETWORK_CONFIG } = require("../../../shared/networkConfig");
const { AST_MESSAGES } = require("../../../shared/astConstants");

class RoomLifecycleService {
  /**
   * Handles a client joining the room, including saved state reclamation.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   * @param {object} options
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
        if (room.clients.length >= room.maxClients) {
          room.lock();
        }
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

    if (room.clients.length >= room.maxClients) {
      room.lock();
    }
  }

  /**
   * Handles a client leaving, managing reconnections and cleanup.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   * @param {boolean} consented
   */
  static async handleLeave(room, client, consented) {
    const player = room.state.players.get(client.sessionId);

    if (player) {
      player.connected = false;
      player.ready = false;
    }
    room.readyClients.delete(client.sessionId);

    logger.info(
      `[Lifecycle] Player left: ${client.sessionId}. Consented: ${consented}`,
    );

    // If game is already over, remove player and clean up if room is empty
    if (room.state.winnerId) {
      room.state.players.delete(client.sessionId);
      if (room.clientViews) {
        room.clientViews.delete(client.sessionId);
      }
      if (room.state.players.size === 0) {
        logger.info(`[Lifecycle] Room empty after game end. Disconnecting.`);
        room.disconnect();
      }
      return;
    }

    // Case 1: Consented leave (user intentionally left, clicked Back to Lobby, or closed)
    if (consented) {
      room.state.players.delete(client.sessionId);
      if (room.clientViews) {
        room.clientViews.delete(client.sessionId);
      }

      // If match was in progress, award victory to remaining opponent by forfeit
      if (room.state.currentPhase) {
        const remainingPlayerId = Array.from(room.state.players.keys())[0];
        if (remainingPlayerId) {
          MatchService.endGame(
            room,
            remainingPlayerId,
            client.sessionId,
            "Opponent left the match",
          );
        }
      }

      // If room is now empty, disconnect immediately
      if (room.state.players.size === 0) {
        logger.info(`[Lifecycle] Room empty after consented leave. Disconnecting.`);
        room.disconnect();
      } else if (!room.state.currentPhase) {
        // If match hadn't started yet and 1 player remains, unlock room
        room.unlock();
      }
      return;
    }

    // Case 2: Non-consented disconnect (network drop, lag, temporary glitch)
    room.lock();

    try {
      logger.info(
        `[Lifecycle] Awaiting reconnection for ${client.sessionId} (${NETWORK_CONFIG.RECONNECTION_TIMEOUT_SECONDS}s)...`,
      );
      const reconnectedClient = await room.allowReconnection(
        client,
        NETWORK_CONFIG.RECONNECTION_TIMEOUT_SECONDS,
      );

      // Restore StateView for reconnected client
      if (room.clientViews && room.clientViews.has(reconnectedClient.sessionId)) {
        reconnectedClient.view = room.clientViews.get(reconnectedClient.sessionId);
      }

      if (player) {
        player.connected = true;
        if (!room.state.currentPhase) {
          room.unlock();
        }
        logger.info(`[Lifecycle] Player reconnected: ${client.sessionId}`);
        this.resendPendingPrompts(room, reconnectedClient);
      }
    } catch (e) {
      // Reconnection timeout expired
      logger.info(
        `[Lifecycle] Player reconnection timed out: ${client.sessionId}`,
      );
      room.state.players.delete(client.sessionId);
      if (room.clientViews) {
        room.clientViews.delete(client.sessionId);
      }

      // If match was in progress, award victory to remaining opponent
      if (room.state.currentPhase && !room.state.winnerId) {
        const remainingPlayerId = Array.from(room.state.players.keys())[0];
        if (remainingPlayerId) {
          MatchService.endGame(
            room,
            remainingPlayerId,
            client.sessionId,
            "Opponent disconnected (timeout)",
          );
        }
      }

      // If room is empty, disconnect immediately
      if (room.state.players.size === 0) {
        logger.info(`[Lifecycle] Room empty after timeout. Disconnecting.`);
        room.disconnect();
      }
    }
  }

  /**
   * Resends pending interactive prompts (Special Initiative, optional ability, target selection)
   * to a reconnected client after their UI handlers are ready.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {import('colyseus').Client} client Target client.
   */
  static resendPendingPrompts(room, client) {
    if (!room || !client || !client.sessionId) return;

    const chronicle = room.state?.effectChronicle;
    if (!chronicle || !chronicle.items || chronicle.items.length === 0) return;

    // 1. Resend Special Initiative if this client is targeted and waiting
    for (const item of chronicle.items) {
      if (item.pendingSpecialInitiative) {
        const psi = item.pendingSpecialInitiative;
        if (psi.targetOwnerId === client.sessionId) {
          const targetCard = room.cardLookup?.get(psi.targetCardId);
          const isMultiple = Array.isArray(psi.targetCardIds) && psi.targetCardIds.length > 1;
          const promptTargetText = isMultiple
            ? `All characters (${psi.targetCardIds.length})`
            : (targetCard?.Name || "character");

          logger.info(
            `[Lifecycle] Resending Special Initiative prompt to client '${client.sessionId}' for item '${item.id}'.`
          );

          client.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
            abilityId: "special_initiative",
            itemId: item.id || "",
            cardId: psi.targetCardId,
            cardTitle: targetCard?.Name || "Special Initiative",
            promptText: `${promptTargetText} in battle targeted for discard! Declare Special Initiative?`,
            action: "special_initiative",
            cardImageFile: targetCard?.ImageFile || "",
            templateId: targetCard?.templateId || "",
          });

          if (typeof room.broadcast === "function" && item.cardId) {
            room.broadcast(AST_MESSAGES.ACTION_TELEGRAPH, {
              sourceCardId: item.cardId,
              targetCardIds: psi.targetCardIds || [psi.targetCardId],
              isSpecialInitiative: true,
              persistent: true,
            });
          }
          return;
        }
      }
    }

    // 2. Resend active prompt for the priority player on the head chronicle item
    if (chronicle.priorityPlayerId === client.sessionId && chronicle.items.length > 0) {
      const activeItem = chronicle.items[0];
      if (activeItem && !activeItem.pendingSpecialInitiative && room.abilityResolver) {
        logger.info(
          `[Lifecycle] Resending prompt for active chronicle item '${activeItem.id}' (${activeItem.title}) to client '${client.sessionId}'.`
        );
        room.abilityResolver.resolve(activeItem);
      }
    }
  }
}

module.exports = RoomLifecycleService;
