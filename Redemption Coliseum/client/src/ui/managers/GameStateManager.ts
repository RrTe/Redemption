import { type TypedRoom } from "../gameUI";
import { type OverlayManager } from "./OverlayManager";
import { type RoomState } from "../../../../shared/types";
import { log } from "../../utils/logger";

/**
 * Manages high-level game state synchronization, player connections,
 * and global UI state like waiting overlays.
 */
export class GameStateManager {
  private room: TypedRoom;
  private overlayManager: OverlayManager;

  constructor(room: TypedRoom, overlayManager: OverlayManager) {
    this.room = room;
    this.overlayManager = overlayManager;
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
}
