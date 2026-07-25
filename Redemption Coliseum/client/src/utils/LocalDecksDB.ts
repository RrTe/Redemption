import type { DeckMetadata, WrappedDeck } from "../types/DeckMetadata";
import { log, error } from "./logger";

const DB_NAME = "RedemptionLocalDecksDB";
const DB_VERSION = 1;

export class LocalDecksDB {
  private db: IDBDatabase | null = null;

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for File System Access API handles (directories)
        if (!db.objectStoreNames.contains("directories")) {
          db.createObjectStore("directories");
        }
        
        // Store for ultra-fast UI rendering (DeckMetadata cache)
        if (!db.objectStoreNames.contains("deck_cache")) {
          db.createObjectStore("deck_cache", { keyPath: "name" }); // File name is unique per folder
        }
        
        // Store for full decks in Mobile/PWA mode where real files aren't available
        if (!db.objectStoreNames.contains("virtual_decks")) {
          db.createObjectStore("virtual_decks", { keyPath: "meta.name" });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        error("LocalDecksDB", "Failed to open IndexedDB", request.error);
        reject(request.error);
      };
    });
  }

  // --- Directories (Desktop Mode) ---

  public async getDirectoryHandle(key: "source_dir" | "target_dir"): Promise<any | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("directories", "readonly");
      const store = tx.objectStore("directories");
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async saveDirectoryHandle(key: "source_dir" | "target_dir", handle: any): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("directories", "readwrite");
      const store = tx.objectStore("directories");
      const request = store.put(handle, key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Deck Cache (Metadata for UI) ---

  public async getCachedMetadata(name: string): Promise<DeckMetadata | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("deck_cache", "readonly");
      const store = tx.objectStore("deck_cache");
      const request = store.get(name);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async getAllCachedMetadata(): Promise<DeckMetadata[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("deck_cache", "readonly");
      const store = tx.objectStore("deck_cache");
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async saveCachedMetadata(meta: DeckMetadata): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("deck_cache", "readwrite");
      const store = tx.objectStore("deck_cache");
      const request = store.put(meta);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Virtual Decks (Mobile/PWA Mode) ---

  public async saveVirtualDeck(wrappedDeck: WrappedDeck): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("virtual_decks", "readwrite");
      const store = tx.objectStore("virtual_decks");
      const request = store.put(wrappedDeck);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getVirtualDeck(name: string): Promise<WrappedDeck | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("virtual_decks", "readonly");
      const store = tx.objectStore("virtual_decks");
      const request = store.get(name);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async getAllVirtualDecks(): Promise<WrappedDeck[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("virtual_decks", "readonly");
      const store = tx.objectStore("virtual_decks");
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Reset / Clear ---

  public async clearAll(): Promise<void> {
    const db = await this.initDB();
    const stores = ["directories", "deck_cache", "virtual_decks"];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      stores.forEach((storeName) => tx.objectStore(storeName).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
