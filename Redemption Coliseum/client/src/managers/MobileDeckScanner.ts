import type { DeckMetadata } from "../types/DeckMetadata";
import { LocalDecksDB } from "../utils/LocalDecksDB";
import { DeckUtils } from "../utils/DeckUtils";
import { LocalDeckMetadataGenerator } from "./LocalDeckMetadataGenerator";
import { ConflictResolutionManager, type ConflictAction } from "./ConflictResolutionManager";
import { PrebuiltDeckLoader } from "./PrebuiltDeckLoader";
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
      const metas = virtualDecks.map((w) => w?.meta).filter(Boolean) as DeckMetadata[];
      if (metas.length > 0) {
        await this.db.saveCachedMetadataBatch(metas);
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
    let currentBulkAction: ConflictAction | null = null;
    let currentBulkFormat: string | null = null;

    const metasToSave: DeckMetadata[] = [];
    const virtualDecksToSave: any[] = [];

    const stepDelay = Math.max(4, Math.min(25, Math.floor(1500 / Math.max(1, total))));

    for (let i = 0; i < total; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, total, file.name);
        await new Promise((resolve) => setTimeout(resolve, stepDelay));
      }
      try {
        const content = await file.text();
        log("MobileDeckScanner", `Processing uploaded file: ${file.name}`);

        const deckData = DeckUtils.parseDeck(content, file.name);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const existingMeta = await this.db.getCachedMetadata(baseName);
        const isConflict = existingMeta !== undefined;

        let action: ConflictAction = "import";
        let format = currentBulkFormat || existingMeta?.format;

        const needConflictPrompt = isConflict && !currentBulkAction;
        const needFormatPrompt = !currentBulkFormat;

        if (needConflictPrompt || needFormatPrompt) {
          const promptResult = await ConflictResolutionManager.promptUser(
            file.name,
            isConflict,
            format || undefined
          );

          if (promptResult.bulkApply) {
            if (promptResult.format) {
              currentBulkFormat = promptResult.format;
            }
            if (promptResult.action && promptResult.action !== "import") {
              currentBulkAction = promptResult.action;
            }
          }

          action = isConflict ? promptResult.action : "import";
          format = promptResult.format;
        } else if (isConflict && currentBulkAction) {
          action = currentBulkAction;
        }

        const baseAction = action.replace("_all", "");
        if (baseAction === "skip") {
          log("MobileDeckScanner", `Skipped update for ${file.name}`);
          continue;
        }

        const resetStats = baseAction === "update_reset_stats";

        const meta = LocalDeckMetadataGenerator.generateMetadata(
          deckData,
          file.name,
          file.lastModified,
          this.cardDatabase,
          existingMeta,
          resetStats,
          format || undefined
        );
        const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(meta, deckData);

        metasToSave.push(meta);
        virtualDecksToSave.push(wrappedDeck);

        log("MobileDeckScanner", `Successfully imported ${file.name} to virtual DB.`);
      } catch (err) {
        error("MobileDeckScanner", `Failed to process file ${file.name}`, err);
      }
    }

    if (metasToSave.length > 0) {
      await this.db.saveVirtualDeckBatch(virtualDecksToSave);
      await this.db.saveCachedMetadataBatch(metasToSave);
    }
  }

  public async updateDeckMetadataInVirtual(meta: DeckMetadata): Promise<void> {
    try {
      let wrapped = await this.db.getVirtualDeck(meta.name);
      if (!wrapped) {
        const projectWrapped = PrebuiltDeckLoader.getWrappedDeck(meta.name);
        if (projectWrapped) {
          wrapped = {
            ...projectWrapped,
            meta: meta,
          };
        }
      } else {
        wrapped.meta = meta;
      }
      if (wrapped) {
        await this.db.saveVirtualDeck(wrapped);
        log("MobileDeckScanner", `Updated virtual deck metadata for ${meta.name}.`);
      }
    } catch (err) {
      log("MobileDeckScanner", `Could not update virtual deck metadata for ${meta.name}`, err);
    }
  }
}
