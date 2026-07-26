export class OnboardingOverlay {
  private static overlayContainer: HTMLElement | null = null;

  public static show(onConfirm: () => void, onCancel?: () => void) {
    if (this.overlayContainer) return;

    // Create container
    this.overlayContainer = document.createElement("div");
    this.overlayContainer.style.position = "fixed";
    this.overlayContainer.style.top = "0";
    this.overlayContainer.style.left = "0";
    this.overlayContainer.style.width = "100%";
    this.overlayContainer.style.height = "100%";
    this.overlayContainer.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
    this.overlayContainer.style.display = "flex";
    this.overlayContainer.style.justifyContent = "center";
    this.overlayContainer.style.alignItems = "center";
    this.overlayContainer.style.zIndex = "2000";
    this.overlayContainer.style.backdropFilter = "blur(10px)";

    const isDesktop = "showDirectoryPicker" in window;

    // Create modal
    const modal = document.createElement("div");
    modal.style.position = "relative";
    modal.style.backgroundColor = "#1e1e1e";
    modal.style.border = "2px solid #b8860b"; // Gold border
    modal.style.borderRadius = "12px";
    modal.style.padding = "30px";
    modal.style.maxWidth = "600px";
    modal.style.width = "90%";
    modal.style.boxShadow = "0 0 30px rgba(184, 134, 11, 0.3)";
    modal.style.color = "#ffffff";
    modal.style.fontFamily = "Arial, sans-serif";
    modal.style.textAlign = "center";

    // Close cross button (gold circle with X)
    const closeCross = document.createElement("input");
    closeCross.type = "image";
    closeCross.className = "dialog-close-cross";
    closeCross.src = "/assets/deck-editor/symbols/cross_circle_small_compressed.png";
    closeCross.style.position = "absolute";
    closeCross.style.top = "14px";
    closeCross.style.right = "14px";
    closeCross.style.width = "26px";
    closeCross.style.height = "26px";
    closeCross.style.cursor = "pointer";
    closeCross.style.transition = "transform 0.15s ease";
    closeCross.title = "Cancel / Close";

    closeCross.onmouseenter = () => {
      closeCross.style.transform = "scale(1.15)";
    };
    closeCross.onmouseleave = () => {
      closeCross.style.transform = "scale(1)";
    };

    let isClosed = false;
    const handleCancel = () => {
      if (isClosed) return;
      isClosed = true;
      this.hide();
      if (onCancel) onCancel();
    };

    closeCross.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      handleCancel();
    };
    modal.appendChild(closeCross);

    // Title
    const title = document.createElement("h2");
    title.innerText = "Welcome to the Catacombs";
    title.style.color = "#ffd700";
    title.style.marginBottom = "20px";
    modal.appendChild(title);

    // Description
    const description = document.createElement("p");
    description.style.fontSize = "16px";
    description.style.lineHeight = "1.5";
    description.style.marginBottom = "30px";
    
    if (isDesktop) {
      description.innerHTML = `
        To import your existing decks into Redemption Coliseum, we need to link two folders:<br><br>
        <strong>1. Source Folder:</strong> Your existing LackeyCCG deck folder.<br>
        <strong>2. Target Folder:</strong> The Coliseum folder where we will store the upgraded .json versions (including your stats!).<br><br>
        Click the button below to select these folders and begin the initiation.
      `;
    } else {
      description.innerHTML = `
        You are in Mobile/PWA mode! We use a virtual file system to store your decks securely on this device.<br><br>
        Click the button below to upload your existing .txt or .dek files into your virtual Coliseum storage.
      `;
    }
    modal.appendChild(description);

    // Confirm Button
    const confirmBtn = document.createElement("button");
    confirmBtn.innerText = isDesktop ? "Link Folders Now" : "Select Files";
    confirmBtn.style.backgroundColor = "#b8860b";
    confirmBtn.style.color = "#ffffff";
    confirmBtn.style.border = "none";
    confirmBtn.style.padding = "15px 30px";
    confirmBtn.style.fontSize = "18px";
    confirmBtn.style.fontWeight = "bold";
    confirmBtn.style.borderRadius = "8px";
    confirmBtn.style.cursor = "pointer";
    confirmBtn.style.transition = "background-color 0.2s, transform 0.1s";
    
    confirmBtn.onmouseenter = () => {
      confirmBtn.style.backgroundColor = "#daa520";
      confirmBtn.style.transform = "scale(1.05)";
    };
    confirmBtn.onmouseleave = () => {
      confirmBtn.style.backgroundColor = "#b8860b";
      confirmBtn.style.transform = "scale(1)";
    };

    confirmBtn.onclick = () => {
      if (isClosed) return;
      isClosed = true;
      this.hide();
      onConfirm();
    };
    
    modal.appendChild(confirmBtn);
    this.overlayContainer.appendChild(modal);
    document.body.appendChild(this.overlayContainer);

    // ESC Key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.removeEventListener("keydown", handleKeyDown);
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
  }

  public static hide() {
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
  }
}
