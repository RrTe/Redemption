import Phaser from "phaser";
import { type PlayerState } from "../../../../shared/types";
import { log } from "../../utils/logger";

const IMAGE_BASE_URL = "/assets/cards/";

/**
 * Manages on-the-fly asset loading, such as card images for the deck.
 */
export class AssetManager {
  private scene: Phaser.Scene;
  private static preloadedSessions = new Set<string>();
  private static pendingCallbacks = new Map<string, Array<(key: string) => void>>();

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
      if (Array.isArray(cardList)) {
        cardList.forEach((c) => {
          if (c && c.cardId) cardsToLoad.add(c.cardId);
          else if (c && c.ImageFile) cardsToLoad.add(c.ImageFile);
        });
      }
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
      const url = `${IMAGE_BASE_URL}${cardId}.jpg`;
      this.loadCardImage(textureKey, url, () => {});
    });

    AssetManager.preloadedSessions.add(player.sessionId);
  }

  /**
   * Loads a single card image (front or back) and calls a callback when complete.
   * Uses native HTML Image loading to prevent Phaser Scene Loader conflicts.
   * @param imageKey The unique key for the image in Phaser's texture cache.
   * @param imageUrl The URL to the image file.
   * @param onComplete Callback function to execute once the image is loaded.
   * @param scene Optional: The scene whose texture manager should be used.
   */
  public loadCardImage(
    imageKey: string,
    imageUrl: string,
    onComplete: (key: string) => void,
    scene?: Phaser.Scene,
  ) {
    const loaderScene = scene || this.scene;

    if (loaderScene.textures && loaderScene.textures.exists(imageKey)) {
      AssetManager.forceGPUUpload(loaderScene, imageKey);
      onComplete(imageKey);
      return;
    }

    if (AssetManager.pendingCallbacks.has(imageKey)) {
      AssetManager.pendingCallbacks.get(imageKey)!.push(onComplete);
      return;
    }

    AssetManager.pendingCallbacks.set(imageKey, [onComplete]);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const callbacks = AssetManager.pendingCallbacks.get(imageKey) || [];
      AssetManager.pendingCallbacks.delete(imageKey);

      if (loaderScene.textures && !loaderScene.textures.exists(imageKey)) {
        loaderScene.textures.addImage(imageKey, img);
        AssetManager.forceGPUUpload(loaderScene, imageKey);
      }

      callbacks.forEach((cb) => cb(imageKey));
    };

    img.onerror = () => {
      log("AssetManager", `Failed to load card image: ${imageUrl}`);
      const callbacks = AssetManager.pendingCallbacks.get(imageKey) || [];
      AssetManager.pendingCallbacks.delete(imageKey);
      // Execute callbacks anyway so UI elements can unblock or show fallbacks
      callbacks.forEach((cb) => cb(imageKey));
    };

    img.src = imageUrl;
  }

  /**
   * Forces the WebGL renderer to upload the texture to the GPU immediately.
   */
  public static forceGPUUpload(scene: Phaser.Scene, textureKey: string) {
    if (scene && scene.renderer && scene.renderer.type === Phaser.WEBGL) {
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
