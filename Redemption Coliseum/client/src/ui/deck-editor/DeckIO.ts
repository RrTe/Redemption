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
}
