const DB_NAME = "RedemptionColiseumDB";
const STORE_NAME = "directories";
const DIR_KEY = "local_decks_handle";

export class DirectoryPicker {
  /**
   * Initializes IndexedDB
   */
  private static async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Tries to get the saved directory handle from IndexedDB or LocalStorage
   */
  public static async getSavedDirectory(): Promise<{ name: string; handle?: any } | null> {
    // 1. Try File System Access API via IndexedDB
    if ("showDirectoryPicker" in window) {
      try {
        const db = await this.initDB();
        const handle = await new Promise<any>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(DIR_KEY);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        if (handle) {
          // Check if we still have permission
          const options = { mode: "read" };
          if ((await handle.queryPermission(options)) === "granted") {
            return { name: handle.name, handle };
          }
          // Request permission if not granted
          if ((await handle.requestPermission(options)) === "granted") {
            return { name: handle.name, handle };
          }
        }
      } catch (err) {
        console.warn("Failed to retrieve directory from IndexedDB", err);
      }
    }

    // 2. Fallback: check localStorage for just the name
    const savedName = localStorage.getItem("local_decks_name");
    if (savedName) {
      return { name: savedName };
    }

    return null;
  }

  /**
   * Opens the directory picker (either native or fallback)
   */
  public static async pickDirectory(): Promise<{ name: string; handle?: any } | null> {
    // 1. Modern File System Access API
    if ("showDirectoryPicker" in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        
        // Save to IndexedDB
        const db = await this.initDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(handle, DIR_KEY);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        // Also save name in localStorage for consistency
        localStorage.setItem("local_decks_name", handle.name);

        return { name: handle.name, handle };
      } catch (err) {
        console.warn("User cancelled directory picker or it failed", err);
        return null;
      }
    }

    // 2. Fallback using <input type="file" webkitdirectory>
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");

      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          // The path usually looks like "FolderName/Subfolder/file.txt"
          const relativePath = files[0].webkitRelativePath;
          const folderName = relativePath ? relativePath.split("/")[0] : "Local Decks";

          localStorage.setItem("local_decks_name", folderName);
          resolve({ name: folderName });
        } else {
          resolve(null);
        }
      };

      // Handle cancellation somewhat (though unreliable across browsers)
      // We just do our best
      input.click();
    });
  }
}
