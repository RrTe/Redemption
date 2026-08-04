export class DeckIO {
  /**
   * Triggers a local browser upload for deck files.
   * @param accept File extension pattern (e.g. ".txt", ".json", ".dek")
   * @param onLoaded Callback invoked with (fileContent, filename)
   */
  public static loadDeckFile(
    accept: string,
    onLoaded: (content: string, filename: string) => void
  ): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          const content = event.target?.result as string;
          if (content) {
            onLoaded(content, file.name);
          }
        };
        reader.readAsText(file);
      }
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  /**
   * Triggers a local browser download or file picker for JSON file contents.
   * @param defaultFilename Desired name of the file.
   * @param content String contents of the file.
   * @returns Saved deck base name (without extension) if saved, or null if cancelled.
   */
  public static async saveJSONDeck(
    defaultFilename: string,
    content: string
  ): Promise<string | null> {
    const filename = defaultFilename.endsWith(".json") ? defaultFilename : `${defaultFilename}.json`;
    const defaultBaseName = defaultFilename.replace(/\.[^/.]+$/, "");

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "JSON Deck (.json)",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const file = await handle.getFile();
        const savedBaseName = file.name.replace(/\.[^/.]+$/, "");
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return savedBaseName;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Save JSON failed:", err);
        }
        return null;
      }
    } else {
      const actualFilename = `${defaultBaseName}.json`;
      this.saveDeckFile(actualFilename, content, "application/json");
      return defaultBaseName;
    }
  }

  /**
   * Triggers a local browser download for file contents.
   * @param filename Desired name of the file.
   * @param content String contents of the file.
   * @param contentType MIME type of the file.
   */
  public static saveDeckFile(
    filename: string,
    content: string,
    contentType: string = "application/json"
  ): void {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /**
   * Triggers a local browser file picker to save a file, allowing the user to select
   * between .txt and .dek formats. Fallbacks to .txt if File System Access API is not available.
   * @param defaultFilename Suggested filename without extension
   * @param contentProvider Function to generate content based on chosen extension
   * @returns Saved deck base name (without extension) if saved, or null if cancelled.
   */
  public static async saveLackeyDeck(
    defaultFilename: string,
    contentProvider: (extension: string) => string
  ): Promise<string | null> {
    const defaultBaseName = defaultFilename.replace(/\.[^/.]+$/, "");
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [
            {
              description: 'Lackey Deck (.txt)',
              accept: { 'text/plain': ['.txt'] }
            },
            {
              description: 'Lackey Deck (.dek)',
              accept: { 'application/xml': ['.dek'] }
            }
          ]
        });
        const file = await handle.getFile();
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        const savedBaseName = file.name.replace(/\.[^/.]+$/, "");
        const content = contentProvider(ext === '.dek' ? '.dek' : '.txt');
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return savedBaseName;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Save failed:", err);
        }
        return null;
      }
    } else {
      const content = contentProvider('.txt');
      this.saveDeckFile(defaultBaseName + ".txt", content, "text/plain");
      return defaultBaseName;
    }
  }
}
