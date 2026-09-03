import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js";
import { type TokenManager } from "../managers/TokenManager.js";
import { GameEvents } from "../../constants/EventNames.js";

/**
 * Handles keyboard shortcuts safely without interfering with text inputs.
 */
export class KeyboardHandler {
  private scene: Phaser.Scene;
  private onKeyDownBound?: (e: KeyboardEvent) => void;

  constructor(
    scene: Phaser.Scene,
    _room: TypedRoom,
    _networkManager: GameNetworkManager,
    _tokenManager: TokenManager,
  ) {
    this.scene = scene;
  }

  /**
   * Registers global shortcut listeners while ignoring input when typing in form fields.
   */
  public registerHandlers(): void {
    this.onKeyDownBound = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+Z -> Open count dialog for batch undo
          this.scene.events.emit(GameEvents.UI_UNDO_CLICKED, {
            isLongPress: true,
          });
        } else {
          // Ctrl+Z -> Single undo
          this.scene.events.emit(GameEvents.UI_UNDO_CLICKED, {
            isLongPress: false,
          });
        }
      }
    };

    window.addEventListener("keydown", this.onKeyDownBound);
  }

  /**
   * Cleans up window event listeners.
   */
  public destroy(): void {
    if (this.onKeyDownBound) {
      window.removeEventListener("keydown", this.onKeyDownBound);
    }
  }
}
