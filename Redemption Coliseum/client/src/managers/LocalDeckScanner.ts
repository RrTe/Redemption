import type { DeckMetadata } from "../types/DeckMetadata";
import { LocalDecksDB } from "../utils/LocalDecksDB";
import { DesktopDeckScanner } from "./DesktopDeckScanner";
import { MobileDeckScanner } from "./MobileDeckScanner";
import { log } from "../utils/logger";

export class LocalDeckScanner {
  private db: LocalDecksDB;
  private desktopScanner: DesktopDeckScanner;
  private mobileScanner: MobileDeckScanner;

  constructor(cardDatabase: any[]) {
    this.db = new LocalDecksDB();
    this.desktopScanner = new DesktopDeckScanner(this.db, cardDatabase);
    this.mobileScanner = new MobileDeckScanner(this.db, cardDatabase);
  }

  /**
   * Syncs existing JSON target files or virtual decks to deck_cache.
   * Ensures manual edits or updated stats are reflected in the UI on scene load.
   */
  public async syncAllToCache(): Promise<void> {
    if ("showDirectoryPicker" in window) {
      const targetDir = await this.db.getDirectoryHandle("target_dir");
      if (targetDir) {
        await this.desktopScanner.syncTargetJsonToCache(targetDir);
      }
    }
    await this.mobileScanner.syncVirtualToCache();
  }

  /**
   * Permanently updates deck metadata in both cache and target storage (disk JSON or virtual deck).
   */
  public async saveMetadataPermanently(meta: DeckMetadata): Promise<void> {
    await this.db.saveCachedMetadata(meta);

    if ("showDirectoryPicker" in window) {
      await this.desktopScanner.updateDeckMetadataOnDisk(meta);
    } else {
      await this.mobileScanner.updateDeckMetadataInVirtual(meta);
    }
  }

  /**
   * Initiates the deck scanning process, choosing the appropriate strategy based on browser capabilities.
   */
  public async scanDecks(
    onComplete: () => void,
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<void> {
    if ("showDirectoryPicker" in window) {
      log("LocalDeckScanner", "File System Access API supported. Using Desktop Mode.");
      await this.desktopScanner.scanDecks(onComplete, onProgress);
    } else {
      log("LocalDeckScanner", "File System Access API not supported. Using Mobile/PWA Mode.");
      await this.mobileScanner.scanDecks(onComplete, onProgress);
    }
  }
}
