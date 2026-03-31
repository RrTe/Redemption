import { log } from "./logger";

/**
 * Static utility for browser-level file operations.
 */
export class FileService {
  /**
   * Downloads any data as a JSON file.
   */
  static downloadJson(data: any, prefix: string = "redemption_save") {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.download = `${prefix}_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log("FileService", `File ${a.download} downloaded.`);
  }

  /**
   * Opens a native file picker and returns content and filename.
   */
  static openFilePicker(accept: string, callback: (content: string, fileName: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => callback(event.target?.result as string, file.name);
      reader.readAsText(file);
    };
    input.click();
  }
}