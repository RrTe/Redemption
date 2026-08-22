import type { DeckMetadata, WrappedDeck } from "../types/DeckMetadata";
import { LocalDecksDB } from "../utils/LocalDecksDB";
import { PrebuiltDeckLoader } from "./PrebuiltDeckLoader";
import { ConflictResolutionManager, type ConflictAction } from "./ConflictResolutionManager";
import { DirectoryPicker } from "../utils/DirectoryPicker";
import { log, error } from "../utils/logger";

export class PrebuiltSyncManager {
  private static db = new LocalDecksDB();

  /**
   * Synchronizes static prebuilt project decks with LocalDecksDB (and disk folder if linked).
   *
   * @param forcePromptFolder If true, prompts native showDirectoryPicker for prebuilt_target_dir.
   * @returns Array of all local prebuilt decks after synchronization.
   */
  public static async syncPrebuiltDecks(
    forcePromptFolder: boolean = false,
    onProgress?: (current: number, total: number, deckName?: string) => void,
    onDiskProgress?: (written: number, total: number) => void
  ): Promise<DeckMetadata[]> {
    const projectDecks = PrebuiltDeckLoader.loadAllPrebuiltDecks();
    const cachedDecks = await this.db.getAllCachedMetadata();

    // Map cached prebuilt decks by ID or Name
    const cachedPrebuiltMap = new Map<string, DeckMetadata>();
    cachedDecks.forEach((d) => {
      if (d.category && d.category.toLowerCase() !== "local") {
        cachedPrebuiltMap.set(d.id || d.name, d);
      }
    });

    // 1. Directory Picker prompt for Desktop mode if explicitly requested
    let targetHandle = await this.db.getDirectoryHandle("prebuilt_target_dir");
    if ("showDirectoryPicker" in window && forcePromptFolder) {
      const picked = await DirectoryPicker.pickDirectory();
      if (picked && picked.handle) {
        targetHandle = picked.handle;
        await this.db.saveDirectoryHandle("prebuilt_target_dir", targetHandle);
        log("PrebuiltSyncManager", `Linked prebuilt_target_dir: ${picked.name}`);
      }
    }

    // 2. Process each project prebuilt deck
    let bulkAction: ConflictAction | null = null;
    let processed = 0;
    const total = projectDecks.length;

    const metasToSave: DeckMetadata[] = [];
    const virtualsToSave: WrappedDeck[] = [];
    const diskWriteTasks: { fileName: string; wrapped: WrappedDeck }[] = [];

    for (const projectDeck of projectDecks) {
      processed++;
      if (onProgress) {
        onProgress(processed, total, projectDeck.name);
      }

      const wrappedProject = PrebuiltDeckLoader.getWrappedDeck(projectDeck.name);
      if (!wrappedProject) continue;

      const cachedCopy = cachedPrebuiltMap.get(projectDeck.id) || cachedPrebuiltMap.get(projectDeck.name);

      if (!cachedCopy) {
        // Case A: New Prebuilt Deck -> Queue for batch insert
        log("PrebuiltSyncManager", `Auto-inserting new prebuilt deck: "${projectDeck.name}"`);
        metasToSave.push(projectDeck);
        virtualsToSave.push(wrappedProject);
        if (targetHandle) {
          diskWriteTasks.push({ fileName: `${wrappedProject.meta.name}.json`, wrapped: wrappedProject });
        }
      } else {
        const projModified = projectDeck.lastModified || 0;
        const cachedModified = cachedCopy.lastModified || 0;

        if (projModified > cachedModified) {
          // Case C: Updated Version -> Resolve Conflict
          let action: ConflictAction = "update_keep_stats";

          if (bulkAction) {
            action = bulkAction;
          } else {
            const promptRes = await ConflictResolutionManager.promptUser(projectDeck.name, true, projectDeck.format);
            action = promptRes.action;
            if (promptRes.bulkApply) {
              bulkAction = action;
            }
          }

          if (action === "update_keep_stats" || action === "update_keep_stats_all") {
            // Keep stats, update cards & metadata
            const preservedStats = cachedCopy.stats || { wins: { full: 0, partial: 0 }, losses: { full: 0, partial: 0 }, ties: 0 };
            const updatedMeta: DeckMetadata = {
              ...projectDeck,
              stats: preservedStats,
            };
            const updatedWrapped: WrappedDeck = {
              meta: updatedMeta,
              deckData: wrappedProject.deckData,
            };
            metasToSave.push(updatedMeta);
            virtualsToSave.push(updatedWrapped);
            if (targetHandle) {
              diskWriteTasks.push({ fileName: `${updatedWrapped.meta.name}.json`, wrapped: updatedWrapped });
            }
            log("PrebuiltSyncManager", `Updated prebuilt deck "${projectDeck.name}" (stats preserved).`);
          } else if (action === "update_reset_stats" || action === "update_reset_stats_all") {
            // Overwrite cards, metadata & reset stats
            metasToSave.push(projectDeck);
            virtualsToSave.push(wrappedProject);
            if (targetHandle) {
              diskWriteTasks.push({ fileName: `${wrappedProject.meta.name}.json`, wrapped: wrappedProject });
            }
            log("PrebuiltSyncManager", `Updated prebuilt deck "${projectDeck.name}" (stats reset).`);
          } else {
            // Skip action -> Keep cached local copy untouched
            log("PrebuiltSyncManager", `Skipped update for prebuilt deck "${projectDeck.name}".`);
          }
        }
      }
    }

    // Batch save all metadata and virtual decks in a single IndexedDB transaction
    if (metasToSave.length > 0) {
      await this.db.saveCachedMetadataBatch(metasToSave);
      await this.db.saveVirtualDeckBatch(virtualsToSave);
    }

    // Non-blocking background flush of physical files to target disk folder
    if (diskWriteTasks.length > 0 && targetHandle) {
      this.flushDiskFiles(targetHandle, diskWriteTasks, onDiskProgress).catch((err) => {
        error("PrebuiltSyncManager", "Background disk write error", err);
      });
    }

    // 3. Return refreshed list of prebuilt decks from LocalDecksDB
    return this.getCachedPrebuiltDecks();
  }

  /**
   * Gets all currently cached prebuilt decks from LocalDecksDB without triggering sync.
   */
  public static async getCachedPrebuiltDecks(): Promise<DeckMetadata[]> {
    const allCached = await this.db.getAllCachedMetadata();
    return allCached.filter((d) => d.category && d.category.toLowerCase() !== "local");
  }

  /**
   * Resets prebuilt decks cache and directory handle.
   */
  public static async resetPrebuiltDirectory(): Promise<void> {
    await this.db.clearPrebuiltDecks();
    log("PrebuiltSyncManager", "Reset prebuilt decks and directory handle.");
  }

  /**
   * Flushes physical files to target disk folder asynchronously in concurrent batches.
   */
  private static async flushDiskFiles(
    dirHandle: any,
    tasks: { fileName: string; wrapped: WrappedDeck }[],
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
            const fileHandle = await dirHandle.getFileHandle(task.fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(task.wrapped, null, 2));
            await writable.close();
          } catch (err) {
            error("PrebuiltSyncManager", `Failed to write prebuilt deck "${task.fileName}" to disk`, err);
          } finally {
            written++;
            if (onDiskProgress) {
              onDiskProgress(written, total);
            }
          }
        })
      );
    }
    log("PrebuiltSyncManager", `Finished background disk flush of ${tasks.length} prebuilt decks.`);
  }
}
