import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { log } from "../../utils/logger";

/**
 * Manages all DOM-based UI elements, such as the help screen and file downloads.
 */
export class DomUIManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private helpOverlay: HTMLElement | null = null;

  constructor(scene: Phaser.Scene, room: TypedRoom) {
    this.scene = scene;
    this.room = room;
  }

  public registerHandlers() {
    this.room.onMessage("saveGameData", (data: any) => {
      this.downloadSaveFile(data);
    });
  }

  private downloadSaveFile(data: any) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.download = `redemption_save_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log("UI", "Save game downloaded.");
  }

  public toggleHelp() {
    if (this.helpOverlay) {
      const isVisible = this.helpOverlay.style.display !== "none";
      this.helpOverlay.style.display = isVisible ? "none" : "flex";
      return;
    }

    this.helpOverlay = document.createElement("div");
    this.helpOverlay.id = "game-help-overlay";
    Object.assign(this.helpOverlay.style, {
      position: "absolute",
      top: "10%",
      left: "10%",
      width: "80%",
      height: "80%",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      border: "2px solid #ffd700",
      borderRadius: "10px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 0 20px rgba(0,0,0,0.8)",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 20px",
      backgroundColor: "#1a1a2e",
      borderBottom: "1px solid #444",
      color: "#ffd700",
      fontFamily: "serif",
      fontSize: "24px",
    });
    header.innerHTML = "<span>Game Guide</span>";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "X";
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      color: "#ff6666",
      fontSize: "24px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    closeBtn.onclick = () => {
      if (this.helpOverlay) this.helpOverlay.style.display = "none";
    };
    header.appendChild(closeBtn);

    const iframe = document.createElement("iframe");
    iframe.src = "help.html";
    Object.assign(iframe.style, {
      flex: "1",
      border: "none",
      background: "#fff",
    });

    this.helpOverlay.appendChild(header);
    this.helpOverlay.appendChild(iframe);
    document.body.appendChild(this.helpOverlay);
  }

  public destroy() {
    if (this.helpOverlay) {
      this.helpOverlay.remove();
      this.helpOverlay = null;
    }
  }
}