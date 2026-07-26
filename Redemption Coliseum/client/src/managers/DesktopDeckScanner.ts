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
      if (!sourceDir || !(await this.verifyPermission(sourceDir))) {
        sourceDir = await (window as any).showDirectoryPicker({
          mode: "read",
        });
        await this.db.saveDirectoryHandle("source_dir", sourceDir);
      }

      let targetDir = await this.db.getDirectoryHandle("target_dir");
      if (!targetDir || !(await this.verifyPermission(targetDir))) {
        targetDir = await (window as any).showDirectoryPicker({
          mode: "readwrite",
        });
        await this.db.saveDirectoryHandle("target_dir", targetDir);
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
      onComplete();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log("DesktopDeckScanner", "User cancelled directory picker.");
      } else {
        error("DesktopDeckScanner", "Error during scan", err);
      }
    } finally {
      this.currentBulkAction = null;
    }
  }

  private async verifyPermission(handle: any): Promise<boolean> {
    try {
      const options = { mode: "readwrite" };
      if ((await handle.queryPermission(options)) === "granted") return true;
      if ((await handle.requestPermission(options)) === "granted") return true;
      return false;
    } catch (err) {
      log("DesktopDeckScanner", "Permission check failed", err);
      return false;
    }
  }

  /**
   * Reads all .json files in targetDirHandle and syncs their metadata into deck_cache.
   * Ensures manual edits to JSON files or game stat updates are reloaded on startup.
   */
  public async syncTargetJsonToCache(targetDirHandle: any): Promise<void> {
    try {
      const perm = await targetDirHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        log("DesktopDeckScanner", "No permission for target_dir during background sync. Using IndexedDB cache.");
        return;
      }
      for await (const entry of targetDirHandle.values()) {
        if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
          try {
            const file = await entry.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data && data.meta) {
              await this.db.saveCachedMetadata(data.meta);
            }
          } catch (err) {
            log("DesktopDeckScanner", `Could not sync target JSON ${entry.name}`, err);
          }
        }
      }
    } catch (err) {
      log("DesktopDeckScanner", "Could not iterate target directory for cache sync", err);
    }
  }

  private async getFilesFromDirectory(dirHandle: any): Promise<any[]> {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        const lowerName = entry.name.toLowerCase();
        if (lowerName.endsWith(".txt") || lowerName.endsWith(".dek") || lowerName.endsWith(".json")) {
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
    
    // Check existing metadata in cache or target JSON file
    const cachedMeta = await this.getExistingMeta(baseName, targetDirHandle);
    
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

  private async getExistingMeta(baseName: string, targetDirHandle: any): Promise<DeckMetadata | undefined> {
    const cached = await this.db.getCachedMetadata(baseName);
    if (cached) return cached;

    try {
      const targetFileName = `${baseName}.json`;
      const fileHandle = await targetDirHandle.getFileHandle(targetFileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (data && data.meta) {
        return data.meta as DeckMetadata;
      }
    } catch {
      // File doesn't exist in target directory yet
    }
    return undefined;
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
    
    await this.importAndSave(file, targetFileName, targetDirHandle, cachedMeta, resetStats);
  }

  private async importAndSave(
    file: File, 
    targetFileName: string, 
    targetDirHandle: any,
    existingMeta?: DeckMetadata,
    resetStats: boolean = false
  ): Promise<void> {
    try {
      const content = await file.text();
      const deckData = DeckUtils.parseDeck(content, file.name);
      
      const newMeta = LocalDeckMetadataGenerator.generateMetadata(
        deckData,
        file.name,
        file.lastModified,
        this.cardDatabase,
        existingMeta,
        resetStats
      );

      const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(newMeta, deckData);
      const jsonContent = JSON.stringify(wrappedDeck, null, 2);

      // Write to target directory
      const targetFileHandle = await targetDirHandle.getFileHandle(targetFileName, { create: true });
      const writable = await targetFileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      // Update cache & persistent IndexedDB backup
      await this.db.saveCachedMetadata(newMeta);
      await this.db.saveVirtualDeck(wrappedDeck);
      log("DesktopDeckScanner", `Successfully saved ${targetFileName}`);
    } catch (err) {
      error("DesktopDeckScanner", `Failed to import ${file.name}`, err);
    }
  }

  public async updateDeckMetadataOnDisk(meta: DeckMetadata): Promise<void> {
    try {
      const targetDir = await this.db.getDirectoryHandle("target_dir");
      if (!targetDir) return;
      const targetFileName = `${meta.name}.json`;
      const fileHandle = await targetDir.getFileHandle(targetFileName, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (data) {
        data.meta = meta;
        await this.db.saveVirtualDeck(data);
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        log("DesktopDeckScanner", `Updated target JSON file ${targetFileName} on disk and virtual DB.`);
      }
    } catch (err) {
      log("DesktopDeckScanner", `Could not update target JSON file on disk for ${meta.name}`, err);
    }
  }
}
