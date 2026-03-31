import { type TypedRoom } from "../gameUI";
import { type OverlayManager } from "./OverlayManager";
import { type AnimationManager } from "./AnimationManager";
import { type SettingsManager } from "../../managers/SettingsManager";
import { type RoomState } from "../../../../shared/types";
import { log } from "../../utils/logger";

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

  constructor(
    room: TypedRoom,
    overlayManager: OverlayManager,
    scene: Phaser.Scene,
    animationManager: AnimationManager,
    settingsManager: SettingsManager,
    renderCallback: () => void
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
   */
  public updateWaitingStatus() {
    const state = this.room.state;
    const playerCount = state.players.size;
    const opponentId = this.findOpponentId(state);
    const opponent = opponentId ? state.players.get(opponentId) : undefined;
    const gameStarted = !!state.activePlayer;

    // Priority 1: Disconnection
    if (opponent && !opponent.connected) {
      this.overlayManager.showWaitingOverlay(
        "Opponent disconnected. Waiting...",
        true,
      );
      return;
    }

    // Priority 2: Opponent timeout after start
    if (playerCount < 2 && gameStarted) {
      this.overlayManager.showWaitingOverlay(
        "Opponent disconnected. Waiting...",
        true,
      );
      return;
    }

    // Priority 3: Normal waiting (Lobby/Ready check)
    if (
      playerCount < 2 ||
      !state.activePlayer ||
      !gameStarted ||
      (opponent && !opponent.ready)
    ) {
      this.overlayManager.showWaitingOverlay("Waiting for Opponent...");
    } else {
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
        `[onStateChange] Decks -> Player: ${state.players.get(this.room.sessionId)?.deck.length}, Opponent: ${state.players.get(this.findOpponentId(state))?.deck.length}`
      );
    });

    // 2. Draw Animation Event
    this.scene.events.on("playDrawAnimation", (data: { cardIds: string[] }) => {
      this.scene.game.events.emit("playSound", "CARD_DRAW");

      if (!this.settingsManager.areAnimationsEnabled()) {
        return;
      }

      log("GameState", `Marking cards for animation: ${data.cardIds}`);
      data.cardIds.forEach((cardId) => {
        this.animationManager.pendingDrawAnimations.add(cardId);
      });
      
      this.renderCallback();
    });

    // 3. Card Interaction Actions
    this.scene.events.on("request-card-action", (data: {
      cardId: string;
      action: string;
      currentValue: boolean;
    }) => {
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
    });
  }

  /**
   * Cleans up scene event listeners.
   */
  public destroy() {
    this.scene.events.off("playDrawAnimation");
    this.scene.events.off("request-card-action");
  }
}
