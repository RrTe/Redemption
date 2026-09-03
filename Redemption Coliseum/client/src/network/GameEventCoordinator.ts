import Phaser from "phaser";
import { type TypedRoom, type StateCallback } from "../ui/gameUI.js";
import { log, error } from "../utils/logger.js";
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
      this.room.onMessage("gameError", (data) => {
        // Log to browser console so errors are visible in DevTools even without a UI dialog.
        error("GameEventCoordinator", "NET GAME ERROR", data);
        this.scene.events.emit(GameEvents.NET_GAME_ERROR, data);
      }),
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

    this.roomListeners.push(
      this.room.onMessage("revealedCardsCleared", () =>
        this.scene.events.emit(GameEvents.NET_REVEALED_CARDS_REMOVED),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("gameToast", (msg: { message: string; type?: "info" | "warning" | "error" }) =>
        this.scene.events.emit("net:gameToast", msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("undoConfirmationPrompt", (msg: { requestingPlayerId: string; requestingPlayerName: string; count: number }) =>
        this.scene.events.emit("net:undoConfirmationPrompt", msg),
      ),
    );

    this.roomListeners.push(
      this.room.onMessage("undoStateChanged", (msg: { availableCount: number }) => {
        log("GameEventCoordinator", `[NET] undoStateChanged received: availableCount=${msg.availableCount}`);
        this.scene.events.emit("net:undoStateChanged", msg);
      }),
    );

    this.roomListeners.push(
      this.room.onMessage("undoResolved", (msg: { accepted: boolean; count: number }) => {
        log("GameEventCoordinator", `[NET] undoResolved received: accepted=${msg.accepted}, count=${msg.count}`);
        this.scene.events.emit(GameEvents.NET_UNDO_RESOLVED, msg);
      }),
    );

    // --- State Mapping ---
    this.stateListeners.push(
      this.$(this.room.state).revealedCards.onAdd((card, index) =>
        this.scene.events.emit(GameEvents.NET_REVEALED_CARDS_ADDED, { card, index }),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).revealedCards.onRemove(() =>
        this.scene.events.emit(GameEvents.NET_REVEALED_CARDS_REMOVED),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).revealedSelectedCardIds.onAdd(() =>
        this.scene.events.emit(GameEvents.NET_REVEALED_SELECTION_CHANGED, {
          selectedIds: [...this.room.state.revealedSelectedCardIds],
        }),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).revealedSelectedCardIds.onRemove(() =>
        this.scene.events.emit(GameEvents.NET_REVEALED_SELECTION_CHANGED, {
          selectedIds: [...this.room.state.revealedSelectedCardIds],
        }),
      ),
    );

    this.stateListeners.push(
      this.$(this.room.state).listen("actionTakerId", (actionTakerId) => {
        if (!actionTakerId) {
          this.scene.events.emit(GameEvents.NET_REVEALED_CARDS_REMOVED);
        }
      }),
    );

    this.stateListeners.push(
      this.$(this.room.state).onChange(() =>
        this.scene.events.emit(GameEvents.NET_STATE_CHANGED),
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

        // ✨ NEU: Client-seitiges Debugging für Colyseus ArraySchema Änderungen
        // Diese Logs zeigen, ob Colyseus die Kartenbewegungen im State-Modell registriert.
        this.stateListeners.push(
          this.$(player).hand.onAdd((card) => {
            log("GameEventCoordinator", `[CLIENT-SYNC][IMMEDIATE] Hand ADDED: ${card.id}, Zone: ${card.zone}, FaceUp: ${card.isFaceUp}`);
            // ✨ DEFERRED CHECK: Prüfe den State nach dem aktuellen Tick
            queueMicrotask(() => {
               log("GameEventCoordinator", `[CLIENT-SYNC][DEFERRED]  Hand STATE: ${card.id}, Zone: ${card.zone}, FaceUp: ${card.isFaceUp}`);
            });
          }),
        );
        this.stateListeners.push(
          this.$(player).hand.onRemove((card) => {
            log("GameEventCoordinator", `[CLIENT-SYNC][Colyseus] Player ${sessionId} Hand REMOVED: ${card.id} (${card.Name}), Zone: ${card.zone}, FaceUp: ${card.isFaceUp}`);
          }),
        );
        this.stateListeners.push(
          this.$(player).deck.onAdd((card) => {
            log("GameEventCoordinator", `[CLIENT-SYNC][Colyseus] Player ${sessionId} Deck ADDED: ${card.id} (${card.Name}), Zone: ${card.zone}, FaceUp: ${card.isFaceUp}`);
          }),
        );
        this.stateListeners.push(
          this.$(player).deck.onRemove((card) => {
            log("GameEventCoordinator", `[CLIENT-SYNC][Colyseus] Player ${sessionId} Deck REMOVED: ${card.id} (${card.Name}), Zone: ${card.zone}, FaceUp: ${card.isFaceUp}`);
          }),
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
