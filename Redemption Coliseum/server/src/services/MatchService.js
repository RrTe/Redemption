const logger = require("../utils/logger");
const { ActionType } = require("../../../shared/actions");
const { CardAction } = require("../../../shared/actionSchema");
const { moveCard } = require("./cardService");
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");

const STARTING_HAND_SIZE = 8;

class MatchService {
  /**
   * Initializes the game state, picks a starting player, and draws starting hands.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static initializeGame(room) {
    logger.info(
      `[MatchService] Initializing game for room ${room.roomId}. Locking room.`,
    );

    room.lock(); // Prevent new players from joining

    // Pick starting player
    const firstPlayerIndex = Math.floor(Math.random() * room.clients.length);
    const startingClientId = room.clients[firstPlayerIndex].sessionId;
    room.state.activePlayer = startingClientId;

    logger.info(`[MatchService] Starting player: ${startingClientId}`);

    // Draw hands for all players
    room.state.players.forEach((player, sessionId) => {
      this._drawStartingHand(room, player, sessionId);
    });

    // Set initial turn and phase
    const firstPlayer = room.state.players.get(room.state.activePlayer);
    if (firstPlayer) {
      firstPlayer.turn = 1;
    }
    room.state.currentPhase = PHASES.DRAW;

    logger.info(
      `[MatchService] Initialization complete. Phase set to ${room.state.currentPhase}`,
    );
  }

  /**
   * Handles player ready signal and starts the game if all players are ready.
   */
  static handlePlayerReady(room, client) {
    room.readyClients.add(client.sessionId);
    const player = room.state.players.get(client.sessionId);
    if (player) player.ready = true;

    if (room.chatHistory.length > 0) {
      client.send("chatHistory", room.chatHistory);
    }

    if (
      room.clients.length === room.maxClients &&
      room.readyClients.size === room.maxClients
    ) {
      if (!room.state.currentPhase) {
        room.clock.setTimeout(() => MatchService.initializeGame(room), 500);
      }
    }
  }

  /**
   * Ends the game and handles cleanup.
   */
  static endGame(room, winnerId, loserId, reason) {
    if (room.state.winnerId) return;

    room.state.winnerId = winnerId;
    room.state.gameOverReason = reason;

    const winner = room.state.players.get(winnerId);
    if (winner) {
      room.broadcastGameLog(`${winner.name} has won the game!`);
    }

    logger.info(`[GAME OVER] Winner: ${winnerId}, Reason: ${reason}`);
    room.lock();

    room.clock.setTimeout(() => {
      room
        .disconnect()
        .catch((e) => logger.error("[MatchService] Disconnect error:", e));
    }, 5000);
  }

  /**
   * Internal helper to draw the starting hand for a specific player.
   * @private
   */
  static _drawStartingHand(room, player, sessionId) {
    try {
      logger.debug(
        `[MatchService] Drawing starting hand for ${player.name} (${sessionId})`,
      );

      const result = moveCard(
        player,
        room.state,
        room.cardLookup,
        ZONES.DECK,
        ZONES.HAND,
        0, // index (ignored for deck draw)
        STARTING_HAND_SIZE,
      );

      const movedCards = result.movedCards || [];

      if (movedCards.length > 0) {
        const cardIds = movedCards.map((c) => c.id);

        const client = room.clients.find((c) => c.sessionId === sessionId);

        if (client) {
          client.send("cardsDrawn", { cardIds });
        }

        // ✨ NEU: Star-Fähigkeit für gezogene Star-Karten in der Start-Hand aktivieren
        movedCards.forEach(card => {
          if (card.Class && (card.Class.includes("Star") || card.Class.includes("star"))) {
            const action = new CardAction();
            action.id = `star_${Date.now()}_${card.id}`;
            action.type = ActionType.ACTIVATE_STAR_ABILITY;
            action.description = "Activate Star Ability";
            action.isMandatory = false;
            card.availableActions.push(action);
            
            // ✨ FIX: Action explizit zur StateView des Controllers hinzufügen, damit sie gefiltert wird
            if (room.state._clientViews) {
              const clientView = room.state._clientViews.get(sessionId);
              if (clientView) {
                clientView.add(action);
              }
            }
            
            // ✨ DEBUG: Loggen, ob die StateView korrekt ist
            const view = room.state._clientViews && room.state._clientViews.get(sessionId);
            const inView = view ? view.has(card) : false;
            logger.info(`[DEBUG_STAR] Card: ${card.Name}, Class: ${card.Class}, actionsLen: ${card.availableActions.length}, inView: ${inView}`);
          }
        });

        // Correct log for initial game setup
        room.broadcastGameLog(`${player.name} draws their starting hand.`);
      }
    } catch (err) {
      logger.error(
        `[MatchService] Error drawing hand for player ${sessionId}:`,
        err,
      );
    }
  }

  /**
   * Handles automatic counter reduction during Upkeep phase.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static handleUpkeepPhase(room) {
    const activePlayerId = room.state.activePlayer;
    logger.debug(
      `[MatchService] Processing Upkeep Phase for player ${activePlayerId}`,
    );

    for (const card of room.cardLookup.values()) {
      // Only reduce counters on cards controlled by the active player
      if (card.controllerId !== activePlayerId) continue;

      if (card.counters && card.counters.size > 0) {
        const keys = Array.from(card.counters.keys());
        for (const key of keys) {
          const val = card.counters.get(key);
          const newVal = val - 1;
          if (newVal <= 0) {
            card.counters.delete(key);
          } else {
            card.counters.set(key, newVal);
          }
        }
      }
    }
  }
}

module.exports = MatchService;
