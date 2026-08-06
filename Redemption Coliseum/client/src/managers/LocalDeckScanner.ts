import type { DeckMetadata } from "../types/DeckMetadata";
import { LocalDecksDB } from "../utils/LocalDecksDB";
import { DesktopDeckScanner } from "./DesktopDeckScanner";
import { MobileDeckScanner } from "./MobileDeckScanner";
import { DeckUtils } from "../utils/DeckUtils";
import { LocalDeckMetadataGenerator } from "./LocalDeckMetadataGenerator";
import { log } from "../utils/logger";

export class LocalDeckScanner {
  private db: LocalDecksDB;
  private desktopScanner: DesktopDeckScanner;
  private mobileScanner: MobileDeckScanner;
  private cardDatabase: any[];

  constructor(cardDatabase: any[]) {
    this.db = new LocalDecksDB();
    this.cardDatabase = cardDatabase;
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
   * Deletes physical file from disk in desktop mode if linked.
   */
  public async deleteDeckFile(deckName: string): Promise<boolean> {
    if ("showDirectoryPicker" in window) {
      return await this.desktopScanner.deleteFileFromTargetDir(deckName);
    }
    return false;
  }

  /**
   * Centralized method to parse deck content, generate metadata, wrap deck, and save to cache & database.
   */
  public async importAndSaveDeck(
    filename: string,
    content: string,
    format?: string
  ): Promise<DeckMetadata> {
    const deckData = DeckUtils.parseDeck(content, filename);
    const baseName = filename.replace(/\.[^/.]+$/, "");
    const existingMeta = await this.db.getCachedMetadata(baseName);

    const newMeta = LocalDeckMetadataGenerator.generateMetadata(
      deckData,
      filename,
      Date.now(),
      this.cardDatabase,
      existingMeta || undefined,
      false,
      format
    );

    const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(newMeta, deckData);
    await this.db.saveCachedMetadata(newMeta);
    await this.db.saveVirtualDeck(wrappedDeck);

    if ("showDirectoryPicker" in window) {
      await this.desktopScanner.updateDeckMetadataOnDisk(newMeta);
    }

    return newMeta;
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
    onProgress?: (current: number, total: number, filename: string) => void,
    onDiskProgress?: (written: number, total: number) => void
  ): Promise<void> {
    if ("showDirectoryPicker" in window) {
      log("LocalDeckScanner", "File System Access API supported. Using Desktop Mode.");
      await this.desktopScanner.scanDecks(onComplete, onProgress, onDiskProgress);
    } else {
      log("LocalDeckScanner", "File System Access API not supported. Using Mobile/PWA Mode.");
      await this.mobileScanner.scanDecks(onComplete, onProgress);
    }
  }
}
