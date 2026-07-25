import { LocalDecksDB } from "../utils/LocalDecksDB";
import { DeckUtils } from "../utils/DeckUtils";
import { LocalDeckMetadataGenerator } from "./LocalDeckMetadataGenerator";
import { log, error } from "../utils/logger";

export class MobileDeckScanner {
  private db: LocalDecksDB;
  private cardDatabase: any[];

  constructor(db: LocalDecksDB, cardDatabase: any[]) {
    this.db = db;
    this.cardDatabase = cardDatabase;
  }

  /**
   * Triggers a file input to allow the user to select deck files.
   * Processes them and stores them in the virtual_decks IndexedDB store.
   */
  public async scanDecks(
    onComplete: () => void,
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".txt,.dek,.json";

      input.onchange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;

        if (files && files.length > 0) {
          log("MobileDeckScanner", `Selected ${files.length} files to import.`);
          await this.processFiles(Array.from(files), onProgress);
        } else {
          log("MobileDeckScanner", "No files selected.");
        }
        
        onComplete();
        resolve();
      };

      // Handle cancellation somewhat (though unreliable across browsers)
      input.click();
    });
  }

  /**
   * Syncs all virtual_decks in IndexedDB to deck_cache.
   * Ensures manual edits or saved game stats in virtual_decks are reloaded.
   */
  public async syncVirtualToCache(): Promise<void> {
    try {
      const virtualDecks = await this.db.getAllVirtualDecks();
      for (const wrapped of virtualDecks) {
        if (wrapped && wrapped.meta) {
          await this.db.saveCachedMetadata(wrapped.meta);
        }
      }
    } catch (err) {
      log("MobileDeckScanner", "Could not sync virtual decks to cache", err);
    }
  }

  private async processFiles(
    files: File[],
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<void> {
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, total, file.name);
      }
      try {
        const content = await file.text();
        log("MobileDeckScanner", `Processing uploaded file: ${file.name}`);

        const deckData = DeckUtils.parseDeck(content, file.name);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const existingMeta = await this.db.getCachedMetadata(baseName);

        const meta = LocalDeckMetadataGenerator.generateMetadata(
          deckData,
          file.name,
          file.lastModified,
          this.cardDatabase,
          existingMeta,
          false // Keep stats by default on mobile import
        );
        const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(meta, deckData);

        // Save to cache and virtual storage
        await this.db.saveVirtualDeck(wrappedDeck);
        await this.db.saveCachedMetadata(meta);

        log("MobileDeckScanner", `Successfully imported ${file.name} to virtual DB.`);
      } catch (err) {
        error("MobileDeckScanner", `Failed to process file ${file.name}`, err);
      }
    }
  }
}
