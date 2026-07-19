export class DeckIO {
  /**
   * Triggers a local browser file picker to load a file.
   * @param accept File extension or MIME type filter (e.g. '.json' or '.txt')
   * @param callback Callback executed with file content and filename when reading is completed.
   */
  public static loadDeckFile(
    accept: string,
    callback: (content: string, filename: string) => void
  ): void {
    let input = document.getElementById("loadLocalDeck") as HTMLInputElement | null;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "loadLocalDeck";
      input.style.display = "none";
      document.body.appendChild(input);
    }
    input.accept = accept;
    input.value = "";

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = (readerEvent) => {
        const content = readerEvent.target?.result as string | undefined;
        if (content !== undefined) {
          callback(content, file.name);
        }
      };
    };
    input.click();
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
   */
  public static async saveLackeyDeck(
    defaultFilename: string,
    contentProvider: (extension: string) => string
  ): Promise<void> {
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
        const content = contentProvider(ext === '.dek' ? '.dek' : '.txt');
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Save failed:", err);
        }
      }
    } else {
      // Fallback
      const content = contentProvider('.txt');
      this.saveDeckFile(defaultFilename + ".txt", content, "text/plain");
    }
  }
}
