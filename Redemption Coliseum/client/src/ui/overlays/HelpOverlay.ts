export class HelpOverlay {
  private static helpOverlay: HTMLElement | null = null;

  public static toggle(): void {
    if (this.helpOverlay) {
      const isVisible = this.helpOverlay.style.display !== "none";
      this.helpOverlay.style.display = isVisible ? "none" : "flex";
      return;
    }

    this.helpOverlay = document.createElement("div");
    this.helpOverlay.id = "game-help-overlay";
    Object.assign(this.helpOverlay.style, {
      position: "fixed",
      top: "5%",
      left: "5%",
      width: "90%",
      height: "90%",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      border: "2px solid #ffd700",
      borderRadius: "10px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 0 30px rgba(0,0,0,0.9)",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 20px",
      backgroundColor: "#1a1a2e",
      borderBottom: "1px solid #b8860b",
      color: "#ffd700",
      fontFamily: "serif",
      fontSize: "24px",
    });
    header.innerHTML = "<span>Game Guide</span>";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
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
      borderRadius: "0 0 8px 8px",
    });

    this.helpOverlay.appendChild(header);
    this.helpOverlay.appendChild(iframe);
    document.body.appendChild(this.helpOverlay);
  }

  public static hide(): void {
    if (this.helpOverlay) {
      this.helpOverlay.style.display = "none";
    }
  }

  public static destroy(): void {
    if (this.helpOverlay) {
      this.helpOverlay.remove();
      this.helpOverlay = null;
    }
  }
}
