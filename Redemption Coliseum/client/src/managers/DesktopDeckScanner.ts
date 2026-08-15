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
  private currentBulkFormat: string | null = null;

  constructor(db: LocalDecksDB, cardDatabase: any[]) {
    this.db = db;
    this.cardDatabase = cardDatabase;
  }

  /**
   * Scans the desktop directories using the File System Access API.
   */
  /**
   * Scans the desktop directories using the File System Access API.
   */
  public async scanDecks(
    onComplete: () => void,
    onProgress?: (current: number, total: number, filename: string) => void,
    onDiskProgress?: (written: number, total: number) => void
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

      // 2. Iterate source files and deduplicate by base name (Pass 1)
      const allEntries = await this.getFilesFromDirectory(sourceDir);
      const groupedMap = new Map<string, any[]>();
      for (const entry of allEntries) {
        const baseName = entry.name.replace(/\.[^/.]+$/, "");
        if (!groupedMap.has(baseName)) {
          groupedMap.set(baseName, []);
        }
        groupedMap.get(baseName)!.push(entry);
      }

      // Select canonical handle per baseName (.json > .dek > .txt)
      const uniqueEntries: any[] = [];
      groupedMap.forEach((entries) => {
        entries.sort((a, b) => {
          const extA = a.name.split(".").pop()?.toLowerCase() || "";
          const extB = b.name.split(".").pop()?.toLowerCase() || "";
          const priority: Record<string, number> = { json: 1, dek: 2, txt: 3 };
          return (priority[extA] || 99) - (priority[extB] || 99);
        });
        uniqueEntries.push(entries[0]);
      });

      const total = uniqueEntries.length;
      log("DesktopDeckScanner", `Found ${allEntries.length} total files, deduplicated to ${total} unique deck names.`);

      // Reset bulk choices for this run
      this.currentBulkAction = null;
      this.currentBulkFormat = null;

      const metasToSave: DeckMetadata[] = [];
      const virtualDecksToSave: any[] = [];
      const diskWriteTasks: { targetFileName: string; jsonContent: string }[] = [];

      // Calculate dynamic frame delay so progress bar animates smoothly over ~1-2 seconds regardless of deck count
      const stepDelay = Math.max(4, Math.min(25, Math.floor(1500 / Math.max(1, total))));

      for (let i = 0; i < total; i++) {
        const entry = uniqueEntries[i];
        if (onProgress) {
          onProgress(i + 1, total, entry.name);
          // Yield to browser main thread so DOM repaints the progress bar animation smoothly
          await new Promise((resolve) => setTimeout(resolve, stepDelay));
        }
        const result = await this.processFile(entry, targetDir);
        if (result) {
          metasToSave.push(result.meta);
          virtualDecksToSave.push(result.wrappedDeck);
          diskWriteTasks.push({
            targetFileName: result.targetFileName,
            jsonContent: result.jsonContent,
          });
        }
      }

      // Single bulk transaction write to IndexedDB (Instant UI update)
      if (metasToSave.length > 0) {
        await this.db.saveCachedMetadataBatch(metasToSave);
        await this.db.saveVirtualDeckBatch(virtualDecksToSave);
      }

      log("DesktopDeckScanner", "Directory scan completed successfully. Unlocking UI.");
      if (onComplete) onComplete();

      // Non-blocking background flush of physical files to target disk folder
      if (diskWriteTasks.length > 0) {
        this.flushDiskFiles(targetDir, diskWriteTasks, onDiskProgress).catch((err) => {
          error("DesktopDeckScanner", "Background disk write error", err);
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log("DesktopDeckScanner", "User cancelled directory picker.");
      } else {
        error("DesktopDeckScanner", "Error during scan", err);
      }
    } finally {
      this.currentBulkAction = null;
      this.currentBulkFormat = null;
    }
  }

  private async flushDiskFiles(
    targetDir: any,
    tasks: { targetFileName: string; jsonContent: string }[],
    onDiskProgress?: (written: number, total: number) => void
  ): Promise<void> {
    const total = tasks.length;
    let written = 0;
    const DISK_BATCH_SIZE = 20;
    
    if (onDiskProgress) onDiskProgress(0, total);

    for (let i = 0; i < tasks.length; i += DISK_BATCH_SIZE) {
      const chunk = tasks.slice(i, i + DISK_BATCH_SIZE);
      await Promise.all(
        chunk.map(async (task) => {
          try {
            const targetFileHandle = await targetDir.getFileHandle(task.targetFileName, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(task.jsonContent);
            await writable.close();
          } catch (err) {
            error("DesktopDeckScanner", `Failed writing disk file ${task.targetFileName}`, err);
          } finally {
            written++;
            if (onDiskProgress) {
              onDiskProgress(written, total);
            }
          }
        })
      );
    }
    log("DesktopDeckScanner", `Finished background disk flush of ${tasks.length} JSON files.`);
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
      let perm = await targetDirHandle.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        try {
          perm = await targetDirHandle.requestPermission({ mode: "read" });
        } catch {
          // Ignore if permission request cannot be prompted automatically
        }
      }
      if (perm !== "granted") {
        log("DesktopDeckScanner", "No read permission for target_dir during background sync. Using IndexedDB cache.");
        return;
      }

      const metas: DeckMetadata[] = [];
      const virtuals: any[] = [];

      for await (const entry of targetDirHandle.values()) {
        if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
          try {
            const file = await entry.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data && data.meta) {
              metas.push(data.meta);
              virtuals.push(data);
            }
          } catch (err) {
            log("DesktopDeckScanner", `Could not sync target JSON ${entry.name}`, err);
          }
        }
      }

      if (metas.length > 0) {
        await this.db.saveCachedMetadataBatch(metas);
        await this.db.saveVirtualDeckBatch(virtuals);
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

  private async processFile(
    sourceFileHandle: any,
    targetDirHandle: any
  ): Promise<{ meta: DeckMetadata; wrappedDeck: any; targetFileName: string; jsonContent: string } | null> {
    const file = await sourceFileHandle.getFile();
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const targetFileName = `${baseName}.json`;
    
    // Check existing metadata in cache or target JSON file
    const cachedMeta = await this.getExistingMeta(baseName, targetDirHandle);
    const isConflict = cachedMeta !== undefined;
    
    if (isConflict) {
      log("DesktopDeckScanner", `Existing deck found: ${file.name}`);
      return await this.handleImportOrConflict(file, targetFileName, targetDirHandle, true, cachedMeta);
    } else {
      log("DesktopDeckScanner", `New deck found: ${file.name}`);
      return await this.handleImportOrConflict(file, targetFileName, targetDirHandle, false);
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

  private async handleImportOrConflict(
    file: File, 
    targetFileName: string, 
    targetDirHandle: any,
    isConflict: boolean,
    cachedMeta?: DeckMetadata
  ): Promise<{ meta: DeckMetadata; wrappedDeck: any; targetFileName: string; jsonContent: string } | null> {
    let action: ConflictAction = "import";
    let format = this.currentBulkFormat || cachedMeta?.format;

    const needConflictPrompt = isConflict && !this.currentBulkAction;
    const needFormatPrompt = !this.currentBulkFormat;

    if (needConflictPrompt || needFormatPrompt) {
      const promptResult = await ConflictResolutionManager.promptUser(
        file.name,
        isConflict,
        format || undefined
      );

      if (promptResult.bulkApply) {
        if (promptResult.format) {
          this.currentBulkFormat = promptResult.format;
        }
        if (promptResult.action && promptResult.action !== "import") {
          this.currentBulkAction = promptResult.action;
        }
      }

      action = isConflict ? promptResult.action : "import";
      format = promptResult.format;
    } else if (isConflict && this.currentBulkAction) {
      action = this.currentBulkAction;
    }

    const baseAction = action.replace("_all", "");
    if (baseAction === "skip") {
      log("DesktopDeckScanner", `Skipped update for ${file.name}`);
      return null;
    }

    const resetStats = baseAction === "update_reset_stats";
    log("DesktopDeckScanner", `Processing ${file.name} (Format: ${format}, Reset Stats: ${resetStats})`);
    
    return await this.importAndSave(file, targetFileName, targetDirHandle, cachedMeta, resetStats, format || undefined);
  }

  private async importAndSave(
    file: File, 
    targetFileName: string, 
    targetDirHandle: any,
    existingMeta?: DeckMetadata,
    resetStats: boolean = false,
    selectedFormat?: string
  ): Promise<{ meta: DeckMetadata; wrappedDeck: any; targetFileName: string; jsonContent: string } | null> {
    try {
      const content = await file.text();
      const deckData = DeckUtils.parseDeck(content, file.name);
      
      const newMeta = LocalDeckMetadataGenerator.generateMetadata(
        deckData,
        file.name,
        file.lastModified,
        this.cardDatabase,
        existingMeta,
        resetStats,
        selectedFormat
      );

      const wrappedDeck = LocalDeckMetadataGenerator.wrapDeck(newMeta, deckData);
      const jsonContent = JSON.stringify(wrappedDeck, null, 2);

      log("DesktopDeckScanner", `Successfully processed ${targetFileName} in memory`);
      return { meta: newMeta, wrappedDeck, targetFileName, jsonContent };
    } catch (err) {
      error("DesktopDeckScanner", `Failed to import ${file.name}`, err);
      return null;
    }
  }

  public async updateDeckMetadataOnDisk(meta: DeckMetadata): Promise<void> {
    try {
      const isPrebuilt = Boolean(meta.category && meta.category.toLowerCase() !== "local");
      const dirKey = isPrebuilt ? "prebuilt_target_dir" : "target_dir";
      const targetDir = await this.db.getDirectoryHandle(dirKey);

      // Always update virtual deck in IndexedDB
      const wrapped = await this.db.getVirtualDeck(meta.name);
      if (wrapped) {
        wrapped.meta = meta;
        await this.db.saveVirtualDeck(wrapped);
      }

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

  public async deleteFileFromTargetDir(deckName: string): Promise<boolean> {
    try {
      const cleanName = deckName.replace(/\.[^/.]+$/, "");
      const targetDir = await this.db.getDirectoryHandle("target_dir");
      if (!targetDir || !(await this.verifyPermission(targetDir))) {
        return false;
      }

      let deletedAny = false;
      const extensions = [".json", ".txt", ".dek"];
      for (const ext of extensions) {
        try {
          await targetDir.removeEntry(`${cleanName}${ext}`);
          deletedAny = true;
          log("DesktopDeckScanner", `Successfully deleted physical file ${cleanName}${ext} from target_dir on disk.`);
        } catch (err) {
          // File with this specific extension might not exist in targetDir
        }
      }
      return deletedAny;
    } catch (err) {
      error("DesktopDeckScanner", `Failed to delete physical file from target_dir for ${deckName}`, err);
      return false;
    }
  }
}
