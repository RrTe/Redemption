import Phaser from "phaser";
import { type PlayerState } from "../../../../shared/types";
import { CardUI } from "../CardUI";
import { log } from "../../utils/logger";

/**
 * Manages on-the-fly asset loading, such as card images for the deck.
 */
export class AssetManager {
  private scene: Phaser.Scene;
  private deckPreloaded: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Preloads all card images for a given player's deck if not already done.
   */
  public preloadDeck(player: PlayerState | null) {
    if (this.deckPreloaded || !player || !player.deck || player.deck.length === 0) {
      return;
    }

    this.deckPreloaded = true;
    log("AssetManager", `Preloading ${player.deck.length} card images...`);
    
    player.deck.forEach((card) => {
      CardUI.preloadContent(this.scene, card);
    });
    
    this.scene.load.start();
  }
}