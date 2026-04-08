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
  private preloadedSessions = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Preloads all card images (Deck & Reserve) for a player in the background.
   */
  public preloadAllPlayerCards(player: PlayerState | null) {
    if (!player || this.preloadedSessions.has(player.sessionId)) return;

    this.preloadedSessions.add(player.sessionId);
    log(
      "AssetManager",
      `Background preloading all cards for ${player.name}...`,
    );

    // Preload Main Deck
    player.deck?.forEach((card) => this.preloadCard(card));

    // Preload Reserve (Fixes the "missing on first search" issue)
    player.reserve?.forEach((card) => this.preloadCard(card));

    this.scene.load.start();
  }

  /** ✨ NEU: Interne Kapselung der Preload-Logik */
  private preloadCard(cardData: CardState) {
    if (!cardData.ImageFile) return;
    const key = `card-${cardData.ImageFile}`;
    const url = `${IMAGE_BASE_URL}${cardData.ImageFile}.jpg`;

    if (!this.scene.textures.exists(key)) {
      this.scene.load.image({
        key: key,
        url: url,
        config: { mipmaps: true },
      } as any);
    }
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
      onComplete(imageKey);
      return;
    }

    // ✨ FIX: Nutze den Loader der anfragenden Szene, damit Events auch bei pausierter Hauptszene feuern
    loaderScene.load.once(`filecomplete-image-${imageKey}`, () =>
      onComplete(imageKey),
    );
    loaderScene.load.image({
      key: imageKey,
      url: imageUrl,
      config: { mipmaps: true },
    } as any);
    loaderScene.load.start();
  }
}
