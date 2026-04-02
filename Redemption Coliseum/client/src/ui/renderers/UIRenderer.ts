import Phaser from "phaser";
import { type RoomState, type PlayerState } from "../../../../shared/types";
import { type HUDManager } from "../managers/HUDManager";
import { type CardRenderer } from "./CardRenderer";
import { type AssetManager } from "../managers/AssetManager";
import { type AnimationManager } from "../managers/AnimationManager";
import { log } from "../../utils/logger";

/**
 * Coordinates the rendering process by delegating state updates
 * to specialized managers (HUD, Cards, Assets).
 */
export class UIRenderer {
  private scene: Phaser.Scene;
  private hudManager: HUDManager;
  private cardRenderer: CardRenderer;
  private assetManager: AssetManager;
  private animationManager: AnimationManager;

  constructor(
    scene: Phaser.Scene,
    hudManager: HUDManager,
    cardRenderer: CardRenderer,
    assetManager: AssetManager,
    animationManager: AnimationManager,
  ) {
    this.scene = scene;
    this.hudManager = hudManager;
    this.cardRenderer = cardRenderer;
    this.assetManager = assetManager;
    this.animationManager = animationManager;
  }

  public render(state: RoomState, mySessionId: string) {
    if (!state) return;

    const player = state.players.get(mySessionId);
    let opponent: PlayerState | undefined;

    // Find opponent session
    for (const [sessionId, playerState] of state.players.entries()) {
      if (sessionId !== mySessionId) {
        opponent = playerState;
        break;
      }
    }

    this.hudManager.updateGameStateUI(state, mySessionId, opponent);

    if (!player) {
      this.cardRenderer.cleanupAllCards();
      this.hudManager.updatePileCounts(null, opponent);
      return;
    }

    this.hudManager.updatePileCounts(player, opponent);
    this.cardRenderer.renderAllCards(player, opponent);

    // Handle Asset Preloading
    if (this.animationManager.activeDrawTweens.size === 0) {
      this.assetManager.preloadDeck(player);
    } else {
      this.scene.events.once("all-draw-animations-complete", () => {
        this.assetManager.preloadDeck(player);
      });
    }
  }
}
