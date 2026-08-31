import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js";
import { type TokenManager } from "../managers/TokenManager.js";

/**
 * KeyboardHandler placeholder.
 * All global keyboard capturing has been disabled to prevent interfering with text input fields.
 */
export class KeyboardHandler {
  constructor(
    _scene: Phaser.Scene,
    _room: TypedRoom,
    _networkManager: GameNetworkManager,
    _tokenManager: TokenManager,
  ) {}

  /**
   * Intentionally empty to prevent Phaser from capturing keydown events.
   */
  public registerHandlers(): void {
    // Keyboard handlers intentionally disabled.
  }
}

