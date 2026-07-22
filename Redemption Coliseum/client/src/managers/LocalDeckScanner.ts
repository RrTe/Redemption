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
