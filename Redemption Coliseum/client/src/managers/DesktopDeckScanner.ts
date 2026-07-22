import { LocalDecksDB } from "../utils/LocalDecksDB";
import { DeckUtils } from "../utils/DeckUtils";
import { LocalDeckMetadataGenerator } from "./LocalDeckMetadataGenerator";
import { ConflictResolutionManager } from "./ConflictResolutionManager";
import type { ConflictAction } from "./ConflictResolutionManager";
import { log, error } from "../utils/logger";
import type { DeckMetadata } from "../types/DeckMetadata";

export class DesktopDeckScanner {
  private db: LocalDecksDB;
  private cardDatabase: any[];
  private currentBulkAction: ConflictAction | null = null;

  constructor(db: LocalDecksDB, cardDatabase: any[]) {
    this.db = db;
    this.cardDatabase = cardDatabase;
  }

  /**
   * Scans the desktop directories using the File System Access API.
   */
  public async scanDecks(
    onComplete: () => void,
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<void> {
    try {
      // 1. Get or prompt for directories
      let sourceDir = await this.db.getDirectoryHandle("source_dir");
      if (!sourceDir) {
        sourceDir = await (window as any).showDirectoryPicker({
          mode: "read",
        });
        await this.db.saveDirectoryHandle("source_dir", sourceDir);
      } else {
        await this.verifyPermission(sourceDir);
      }

      let targetDir = await this.db.getDirectoryHandle("target_dir");
      if (!targetDir) {
        targetDir = await (window as any).showDirectoryPicker({
          mode: "readwrite",
        });
        await this.db.saveDirectoryHandle("target_dir", targetDir);
      } else {
        await this.verifyPermission(targetDir);
      }

      // 2. Iterate source files
      const entries = await this.getFilesFromDirectory(sourceDir);
      const total = entries.length;
      log("DesktopDeckScanner", `Found ${total} valid deck files in source.`);

      // Reset bulk action for this run
      this.currentBulkAction = null;

      for (let i = 0; i < total; i++) {
        const entry = entries[i];
        if (onProgress) {
          onProgress(i + 1, total, entry.name);
        }
        await this.processFile(entry, targetDir);
      }
      
      log("DesktopDeckScanner", "Directory scan completed successfully.");
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log("DesktopDeckScanner", "User cancelled directory picker.");
      } else {
        error("DesktopDeckScanner", "Error during scan", err);
      }
    } finally {
      this.currentBulkAction = null;
      onComplete();
    }
  }

  private async verifyPermission(handle: any): Promise<void> {
    const options = { mode: "readwrite" };
    if ((await handle.queryPermission(options)) !== "granted") {
      if ((await handle.requestPermission(options)) !== "granted") {
        throw new Error("Permission to directory not granted");
      }
    }
  }

  private async getFilesFromDirectory(dirHandle: any): Promise<any[]> {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        const lowerName = entry.name.toLowerCase();
        if (lowerName.endsWith(".txt") || lowerName.endsWith(".dek")) {
          files.push(entry);
        }
      }
    }
    return files;
  }

  private async processFile(sourceFileHandle: any, targetDirHandle: any): Promise<void> {
    const file = await sourceFileHandle.getFile();
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const targetFileName = `${baseName}.json`;
    
    // Check cache
    const cachedMeta = await this.db.getCachedMetadata(baseName);
    
    if (cachedMeta) {
      if (file.lastModified > cachedMeta.lastModified) {
        log("DesktopDeckScanner", `Conflict: ${file.name} is newer than cache.`);
        await this.handleConflict(file, targetFileName, targetDirHandle, cachedMeta);
      } else {
        log("DesktopDeckScanner", `Skipping ${file.name} (unchanged)`);
      }
    } else {
      log("DesktopDeckScanner", `New deck found: ${file.name}`);
      await this.importAndSave(file, targetFileName, targetDirHandle);
    }
  }

  private async handleConflict(
    file: File, 
    targetFileName: string, 
    targetDirHandle: any,
    cachedMeta: DeckMetadata
  ): Promise<void> {
    let action = this.currentBulkAction;
    
    if (!action) {
      action = await ConflictResolutionManager.promptUser(file.name);
      
      if (action.endsWith("_all")) {
        this.currentBulkAction = action;
      }
    }

    // Strip "_all" for logic processing
    const baseAction = action.replace("_all", "");

    if (baseAction === "skip") {
      log("DesktopDeckScanner", `Skipped update for ${file.name}`);
      return;
    }

    const resetStats = baseAction === "update_reset_stats";
    log("DesktopDeckScanner", `Updating ${file.name} (Reset Stats: ${resetStats})`);
    
    await this.importAndSave(file, targetFileName, targetDirHandle, resetStats ? undefined : cachedMeta);
  }

  private async importAndSave(
    file: File, 
    targetFileName: string, 
    targetDirHandle: any,
    existingMeta?: DeckMetadata
  ): Promise<void> {
    try {
      const content = await file.text();
      const deckData = DeckUtils.parseDeck(content, file.name);
      
      const newMeta = LocalDeckMetadataGenerator.generateMetadata(
        deckData,
        file.name,
        file.lastModified,
        this.cardDatabase
      );

      // Preserve stats if required
      if (existingMeta) {
        newMeta.stats = existingMeta.stats;
      }

      const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(newMeta, deckData);
      const jsonContent = JSON.stringify(wrappedDeck, null, 2);

      // Write to target directory
      const targetFileHandle = await targetDirHandle.getFileHandle(targetFileName, { create: true });
      const writable = await targetFileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      // Update cache
      await this.db.saveCachedMetadata(newMeta);
      log("DesktopDeckScanner", `Successfully saved ${targetFileName}`);
    } catch (err) {
      error("DesktopDeckScanner", `Failed to import ${file.name}`, err);
    }
  }
}
