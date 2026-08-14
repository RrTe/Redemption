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
  public static async syncPrebuiltDecks(forcePromptFolder: boolean = false): Promise<DeckMetadata[]> {
    const projectDecks = PrebuiltDeckLoader.loadAllPrebuiltDecks();
    const cachedDecks = await this.db.getAllCachedMetadata();

    // Map cached prebuilt decks by ID or Name
    const cachedPrebuiltMap = new Map<string, DeckMetadata>();
    cachedDecks.forEach((d) => {
      if (d.category && d.category.toLowerCase() !== "local") {
        cachedPrebuiltMap.set(d.id || d.name, d);
      }
    });

    // 1. Directory Picker prompt for Desktop mode if requested or no target handle linked yet
    let targetHandle = await this.db.getDirectoryHandle("prebuilt_target_dir");
    if ("showDirectoryPicker" in window && (forcePromptFolder || !targetHandle)) {
      if (forcePromptFolder || !targetHandle) {
        const picked = await DirectoryPicker.pickDirectory();
        if (picked && picked.handle) {
          targetHandle = picked.handle;
          await this.db.saveDirectoryHandle("prebuilt_target_dir", targetHandle);
          log("PrebuiltSyncManager", `Linked prebuilt_target_dir: ${picked.name}`);
        }
      }
    }

    // 2. Process each project prebuilt deck
    let bulkAction: ConflictAction | null = null;

    for (const projectDeck of projectDecks) {
      const wrappedProject = PrebuiltDeckLoader.getWrappedDeck(projectDeck.name);
      if (!wrappedProject) continue;

      const cachedCopy = cachedPrebuiltMap.get(projectDeck.id) || cachedPrebuiltMap.get(projectDeck.name);

      if (!cachedCopy) {
        // Case A: New Prebuilt Deck -> Auto-insert into LocalDecksDB & Disk
        log("PrebuiltSyncManager", `Auto-inserting new prebuilt deck: "${projectDeck.name}"`);
        await this.db.saveCachedMetadata(projectDeck);
        await this.db.saveVirtualDeck(wrappedProject);
        if (targetHandle) {
          await this.writeDeckToDisk(targetHandle, wrappedProject);
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
            await this.db.saveCachedMetadata(updatedMeta);
            await this.db.saveVirtualDeck(updatedWrapped);
            if (targetHandle) {
              await this.writeDeckToDisk(targetHandle, updatedWrapped);
            }
            log("PrebuiltSyncManager", `Updated prebuilt deck "${projectDeck.name}" (stats preserved).`);
          } else if (action === "update_reset_stats" || action === "update_reset_stats_all") {
            // Overwrite cards, metadata & reset stats
            await this.db.saveCachedMetadata(projectDeck);
            await this.db.saveVirtualDeck(wrappedProject);
            if (targetHandle) {
              await this.writeDeckToDisk(targetHandle, wrappedProject);
            }
            log("PrebuiltSyncManager", `Updated prebuilt deck "${projectDeck.name}" (stats reset).`);
          } else {
            // Skip action -> Keep cached local copy untouched
            log("PrebuiltSyncManager", `Skipped update for prebuilt deck "${projectDeck.name}".`);
          }
        }
      }
    }

    // 3. Return refreshed list of prebuilt decks from LocalDecksDB
    const allCached = await this.db.getAllCachedMetadata();
    return allCached.filter((d) => d.category && d.category.toLowerCase() !== "local");
  }

  /**
   * Resets the linked prebuilt directory handle.
   */
  public static async resetPrebuiltDirectory(): Promise<void> {
    await this.db.saveDirectoryHandle("prebuilt_target_dir", null);
    log("PrebuiltSyncManager", "Reset prebuilt_target_dir handle.");
  }

  /**
   * Writes a WrappedDeck JSON to disk directory handle.
   */
  private static async writeDeckToDisk(dirHandle: any, wrapped: WrappedDeck): Promise<void> {
    try {
      const fileName = `${wrapped.meta.name}.json`;
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(wrapped, null, 2));
      await writable.close();
      log("PrebuiltSyncManager", `Wrote prebuilt deck "${fileName}" to disk.`);
    } catch (err) {
      error("PrebuiltSyncManager", `Failed to write prebuilt deck "${wrapped.meta.name}" to disk`, err);
    }
  }
}
