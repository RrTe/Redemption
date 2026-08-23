import { type TypedRoom } from "../gameUI";
import { type OverlayManager } from "./OverlayManager";
import { type AnimationManager } from "./AnimationManager";
import { type SettingsManager } from "../../managers/SettingsManager";
import { type RoomState } from "../../../../shared/types";
import { log } from "../../utils/logger";
import { GameEvents } from "../../constants/EventNames";

/**
 * Manages high-level game state synchronization, player connections,
 * and global UI state like waiting overlays.
 */
export class GameStateManager {
  private room: TypedRoom;
  private overlayManager: OverlayManager;
  private scene: Phaser.Scene;
  private animationManager: AnimationManager;
  private settingsManager: SettingsManager;
  private renderCallback: () => void;
  // Fix Bug D: Timer to debounce the disconnect overlay, avoiding false alarms on Render.com
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DISCONNECT_DEBOUNCE_MS = 5000; // Wait 5s before treating a drop as a real disconnect

  constructor(
    room: TypedRoom,
    overlayManager: OverlayManager,
    scene: Phaser.Scene,
    animationManager: AnimationManager,
    settingsManager: SettingsManager,
    renderCallback: () => void,
  ) {
    this.room = room;
    this.overlayManager = overlayManager;
    this.scene = scene;
    this.animationManager = animationManager;
    this.settingsManager = settingsManager;
    this.renderCallback = renderCallback;
  }

  /**
   * Helper to find the session ID of the opponent.
   */
  public findOpponentId(state: RoomState): string | undefined {
    for (const sessionId of state.players.keys()) {
      if (sessionId !== this.room.sessionId) {
        return sessionId;
      }
    }
    return undefined;
  }

  /**
   * Checks player status and toggles the waiting overlay.
   * Uses a debounce for disconnect events to avoid false alarms on high-latency
   * deployments (e.g. Render.com), where a WebSocket drop followed by a fast
   * Colyseus reconnect should not show a scary "disconnected" message.
   */
  public updateWaitingStatus() {
    const state = this.room.state;
    const playerCount = state.players.size;
    const opponentId = this.findOpponentId(state);
    const opponent = opponentId ? state.players.get(opponentId) : undefined;
    const gameStarted = !!state.activePlayer && state.activePlayer !== "";

    log(
      "GameState",
      `[WaitingStatus] Players: ${playerCount}, Started: ${gameStarted}, OpponentConn: ${opponent?.connected}`,
    );

    // If game has ended, never show waiting overlay
    if (state.winnerId) {
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      }
      this.overlayManager.hideWaitingOverlay();
      return;
    }

    // Priority 1: Disconnection – debounced to avoid false alarms on reconnect
    if (opponent && !opponent.connected) {
      if (!this.disconnectTimer) {
        log("GameState", "Opponent disconnected signal received, starting debounce timer...");
        this.disconnectTimer = setTimeout(() => {
          // Re-check connection state after the debounce period has elapsed.
          const currentOpponentId = this.findOpponentId(this.room.state);
          const currentOpponent = currentOpponentId
            ? this.room.state.players.get(currentOpponentId)
            : undefined;
          if (currentOpponent && !currentOpponent.connected && !this.room.state.winnerId) {
            log("GameState", "Showing overlay: Opponent disconnected (confirmed after debounce)");
            this.overlayManager.showWaitingOverlay(
              "Opponent disconnected. Waiting...",
              true,
            );
          }
          this.disconnectTimer = null;
        }, this.DISCONNECT_DEBOUNCE_MS);
      }
      return;
    }

    // Opponent is connected (or no opponent yet) – cancel any pending disconnect timer.
    if (this.disconnectTimer) {
      log("GameState", "Opponent reconnected before debounce elapsed – cancelling disconnect overlay.");
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    // Priority 2: Opponent left room after start
    if (playerCount < 2 && gameStarted) {
      log("GameState", "Showing overlay: Opponent left room");
      this.overlayManager.showWaitingOverlay(
        "Opponent disconnected. Waiting...",
        true,
      );
      return;
    }

    // Priority 3: Normal waiting (Lobby/Ready check)
    if (playerCount < 2 || !gameStarted || (opponent && !opponent.ready)) {
      log("GameState", "Showing overlay: Generic waiting");
      this.overlayManager.showWaitingOverlay("Waiting for Opponent...");
    } else {
      log("GameState", "Hiding waiting overlay");
      this.overlayManager.hideWaitingOverlay();
    }
  }

  /**
   * Registers all state-related handlers and scene events.
   */
  public registerHandlers() {
    // 1. State Change Logs
    this.room.onStateChange((state) => {
      log("GameState", `[onStateChange] Phase: ${state.currentPhase}`);
      log(
        "GameState",
        `[onStateChange] Decks -> Player: ${state.players.get(this.room.sessionId)?.deck.length}, Opponent: ${state.players.get(this.findOpponentId(state))?.deck.length}`,
      );
      this.updateWaitingStatus(); // ✨ Sicherstellen, dass bei JEDEM State-Update (auch Disconnect) geprüft wird
    });

    // 2. Listen for network events from GameEventCoordinator
    this.scene.events.on(
      GameEvents.NET_CARDS_DRAWN,
      (data: { cardIds: string[] }) => {
        this.scene.game.events.emit(GameEvents.SYSTEM_PLAY_SOUND, "CARD_DRAW");

        if (!this.settingsManager.areAnimationsEnabled()) {
          return;
        }

        log(
          "GameState",
          `[net:cardsDrawn] Marking cards for animation: ${data.cardIds}`,
        );
        data.cardIds.forEach((cardId) => {
          this.animationManager.pendingDrawAnimations.add(cardId);
        });

        this.renderCallback();
      },
    );

    // 2.1 Listen for network events from GameEventCoordinator
    this.scene.events.on("net:pileShuffled", () => {
      this.scene.game.events.emit("playSound", "CARD_SHUFFLE");
    });

    // 2.2 Re-check waiting status on every state change
    this.scene.events.on("net:stateChanged", () => this.updateWaitingStatus());

    // ✨ FIX: Initialen Status sofort prüfen, falls Events bereits gefeuert wurden
    this.updateWaitingStatus();

    this.scene.events.on("net:gameOver", (data: { winnerId: string }) => {
      if (!data.winnerId) return; // ✨ FIX: Verhindert "Geister"-Game-Overs
      localStorage.removeItem("reconnectionToken");
      localStorage.removeItem("reconnectionRoomId");
      this.overlayManager.showGameOverOverlay(
        data.winnerId === this.room.sessionId,
      );
    });

    // 3. Card Interaction Actions
    this.scene.events.on(
      "request-card-action",
      (data: { cardId: string; action: string; currentValue: boolean }) => {
        let updates = {};

        if (data.action === "toggle-flip") {
          updates = { isFlipped: !data.currentValue };
        } else if (data.action === "toggle-face-down") {
          updates = { isFaceDown: !data.currentValue };
        }

        if (Object.keys(updates).length > 0) {
          this.room.send("updateCardState", {
            cardId: data.cardId,
            updates,
          });
        }
      },
    );
  }

  /**
   * Cleans up scene event listeners and any pending timers.
   */
  public destroy() {
    // Cancel pending disconnect timer to prevent ghost overlays after scene teardown.
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.scene.events.off("net:cardsDrawn");
    this.scene.events.off("net:pileShuffled");
    this.scene.events.off("net:stateChanged");
    this.scene.events.off("net:gameOver");
    this.scene.events.off("request-card-action");
  }
}
