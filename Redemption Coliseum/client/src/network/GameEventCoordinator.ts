import Phaser from "phaser";
import { type TypedRoom, type StateCallback } from "../ui/gameUI.js";
import { log } from "../utils/logger.js";
import { GameEvents } from "../constants/EventNames.js";

/**
 * Translates network messages and state changes into Phaser events.
 * This decouples the NetworkManager from the UI Managers.
 */
export class GameEventCoordinator {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private $: StateCallback;
  private roomListeners: (() => void)[] = [];
  private stateListeners: (() => void)[] = [];

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    stateCallback: StateCallback,
  ) {
    this.scene = scene;
    this.room = room;
    this.$ = stateCallback;
  }

  public registerHandlers() {
    log("GameEventCoordinator", "Registering network-to-ui event mapping...");

    // --- Message Mapping ---
    this.roomListeners.push(
      this.room.onMessage("gameError", (data) =>
        this.scene.events.emit(GameEvents.NET_GAME_ERROR, data),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("presentPileSearchResult", (msg) =>
        this.scene.events.emit(GameEvents.NET_SEARCH_RESULT, msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("cardsDrawn", (msg) =>
        this.scene.events.emit(GameEvents.NET_CARDS_DRAWN, msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("pileShuffled", (msg) =>
        this.scene.events.emit("net:pileShuffled", msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("chat", (msg) =>
        this.scene.events.emit("net:chat", msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("chatHistory", (history) =>
        this.scene.events.emit("net:chatHistory", history),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("gameLog", (msg) =>
        this.scene.events.emit("net:gameLog", msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("saveGameData", (data) =>
        this.scene.events.emit("net:saveGameData", data),
      ),
    );

    // --- State Mapping ---
    this.stateListeners.push(
      this.$(this.room.state).revealedCards.onAdd((card, index) =>
        this.scene.events.emit("net:revealedCardsAdded", { card, index }),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).revealedCards.onRemove(() =>
        this.scene.events.emit("net:revealedCardsRemoved"),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).onChange(() =>
        this.scene.events.emit("net:stateChanged"),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).listen("winnerId", (winnerId, prev) => {
        if (winnerId) {
          // ✨ FIX: Nur emittieren, wenn ein echter Gewinner feststeht
          this.scene.events.emit("net:gameOver", { winnerId, prev });
        }
      }),
    );

    this.stateListeners.push(
      this.$(this.room.state).players.onAdd((player, sessionId) => {
        this.scene.events.emit("net:playerJoined", { player, sessionId });
        // Sub-listener for individual player changes (like connection status)
        this.stateListeners.push(
          this.$(player).onChange(() =>
            this.scene.events.emit("net:playerStateChanged", {
              player,
              sessionId,
            }),
          ),
        );
      }, true),
    );

    this.stateListeners.push(
      this.$(this.room.state).players.onRemove((player, sessionId) =>
        this.scene.events.emit("net:playerLeft", { player, sessionId }),
      ),
    );
  }

  public destroy() {
    this.roomListeners.forEach((l) => l());
    this.stateListeners.forEach((l) => (l as any).remove());
    this.roomListeners = [];
    this.stateListeners = [];
  }
}
