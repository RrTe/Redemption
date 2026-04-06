import Phaser from "phaser";
import { type PlayerState } from "../../../../shared/types";
import { CardUI } from "../CardUI";
import type { CardState } from "../../../../shared/types";
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

  /**
   * Loads a single card image (front or back) and calls a callback when complete.
   * @param imageKey The unique key for the image in Phaser's texture cache.
   * @param imageUrl The URL to the image file.
   * @param onComplete Callback function to execute once the image is loaded.
   */
  public loadCardImage(
    imageKey: string,
    imageUrl: string,
    onComplete: (key: string) => void,
  ) {
    if (this.scene.textures.exists(imageKey)) {
      onComplete(imageKey);
      return;
    }

    this.scene.load.once(`filecomplete-image-${imageKey}`, () => {
      onComplete(imageKey);
    });
    this.scene.load.image({
      key: imageKey,
      url: imageUrl,
      config: { mipmaps: true },
    } as any);
    this.scene.load.start();
  }
}