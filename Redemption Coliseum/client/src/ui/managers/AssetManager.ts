import Phaser from "phaser";
import { type PlayerState } from "../../../../shared/types";
import { CardUI } from "../CardUI";
import type { CardState } from "../../../../shared/types";
import { log } from "../../utils/logger";

const IMAGE_BASE_URL = "/assets/cards/";

/**
 * Manages on-the-fly asset loading, such as card images for the deck.
 */
export class AssetManager {
  private scene: Phaser.Scene;
  private static preloadedSessions = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Preloads all image assets for the cards in a given player's deck and hand.
   */
  public preloadAllPlayerCards(player: PlayerState | null) {
    if (!player) return;

    if (AssetManager.preloadedSessions.has(player.sessionId)) {
      return;
    }

    const cardsToLoad = new Set<string>();
    const gatherCards = (cardList: any[]) => {
      cardList.forEach((c) => cardsToLoad.add(c.cardId));
    };

    gatherCards(player.deck);
    gatherCards(player.hand);
    gatherCards(player.discard);
    gatherCards(player.territory);
    gatherCards(player.land_of_bondage);
    gatherCards(player.reserve);
    gatherCards(player.land_of_redemption);
    gatherCards(player.banish);

    cardsToLoad.forEach((cardId) => {
      const textureKey = `card-${cardId}`;
      const url = `/assets/cards/${cardId}.jpg`;
      this.loadCardImage(textureKey, url, () => {});
    });

    AssetManager.preloadedSessions.add(player.sessionId);
  }

  /**
   * Loads a single card image (front or back) and calls a callback when complete.
   * @param imageKey The unique key for the image in Phaser's texture cache.
   * @param imageUrl The URL to the image file.
   * @param onComplete Callback function to execute once the image is loaded.
   * @param scene Optional: The scene whose loader should be used (important for paused scenes).
   */
  public loadCardImage(
    imageKey: string,
    imageUrl: string,
    onComplete: (key: string) => void,
    scene?: Phaser.Scene,
  ) {
    const loaderScene = scene || this.scene;

    if (loaderScene.textures.exists(imageKey)) {
      AssetManager.forceGPUUpload(loaderScene, imageKey);
      onComplete(imageKey);
      return;
    }

    const win = window as any;
    win.loadingTextures = win.loadingTextures || new Set<string>();
    const loadingTextures = win.loadingTextures;

    const cleanUpAndComplete = (success: boolean) => {
      loadingTextures.delete(imageKey);
      loaderScene.load.off(`filecomplete-image-${imageKey}`);
      loaderScene.load.off(`loaderror`);
      if (success) {
        AssetManager.forceGPUUpload(loaderScene, imageKey);
        onComplete(imageKey);
      }
    };

    if (loadingTextures.has(imageKey)) {
      // Texture is already in transit/loading. Register to get it when complete!
      loaderScene.load.once(`filecomplete-image-${imageKey}`, () => {
        onComplete(imageKey);
      });
    } else {
      // Texture does not yet exist and is not currently loading => start loading it
      loadingTextures.add(imageKey);

      loaderScene.load.once(`filecomplete-image-${imageKey}`, () => {
        cleanUpAndComplete(true);
      });

      loaderScene.load.once(`loaderror`, (file: any) => {
        if (file && file.key === imageKey) {
          cleanUpAndComplete(false);
        }
      });

      loaderScene.load.image({
        key: imageKey,
        url: imageUrl,
      } as any);

      loaderScene.load.start();
    }
  }

  /**
   * Forces the WebGL renderer to upload the texture to the GPU immediately.
   */
  public static forceGPUUpload(scene: Phaser.Scene, textureKey: string) {
    if (scene.renderer && scene.renderer.type === Phaser.WEBGL) {
      const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      const texture = scene.textures.get(textureKey);
      if (texture && texture.source && texture.source.length > 0) {
        const source = texture.source[0];
        if (source && !source.glTexture) {
          // @ts-ignore
          renderer.createTexture2D(source);
        }
      }
    }
  }
}
