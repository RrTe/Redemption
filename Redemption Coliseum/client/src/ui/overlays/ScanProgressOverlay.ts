export class ScanProgressOverlay {
  private static overlayContainer: HTMLElement | null = null;
  private static barElement: HTMLElement | null = null;
  private static waitTextElement: HTMLElement | null = null;
  private static activeAnimation: Animation | null = null;

  public static show(initialText: string = "Searching the Catacombs...") {
    if (this.overlayContainer) return;

    // Create container
    this.overlayContainer = document.createElement("div");
    this.overlayContainer.style.position = "fixed";
    this.overlayContainer.style.top = "0";
    this.overlayContainer.style.left = "0";
    this.overlayContainer.style.width = "100%";
    this.overlayContainer.style.height = "100%";
    this.overlayContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    this.overlayContainer.style.display = "flex";
    this.overlayContainer.style.flexDirection = "column";
    this.overlayContainer.style.justifyContent = "center";
    this.overlayContainer.style.alignItems = "center";
    this.overlayContainer.style.zIndex = "3000"; // Above everything
    
    // Title
    const title = document.createElement("h2");
    title.innerText = initialText;
    title.style.color = "#ffd700";
    title.style.fontFamily = "Arial, sans-serif";
    title.style.marginBottom = "30px";
    title.style.letterSpacing = "2px";
    this.overlayContainer.appendChild(title);

    // Progress Bar Container
    const barContainer = document.createElement("div");
    barContainer.style.width = "400px";
    barContainer.style.maxWidth = "85%";
    barContainer.style.height = "14px";
    barContainer.style.backgroundColor = "#222";
    barContainer.style.border = "1px solid #b8860b";
    barContainer.style.borderRadius = "7px";
    barContainer.style.overflow = "hidden";
    barContainer.style.position = "relative";
    
    // Progress Bar Fill
    this.barElement = document.createElement("div");
    this.barElement.style.width = "0%";
    this.barElement.style.height = "100%";
    this.barElement.style.backgroundColor = "#ffd700";
    this.barElement.style.position = "absolute";
    this.barElement.style.left = "0";
    this.barElement.style.top = "0";
    this.barElement.style.borderRadius = "5px";
    this.barElement.style.transition = "width 0.15s ease-out";
    
    // Indeterminate animation by default until numerical updates start
    this.activeAnimation = this.barElement.animate([
      { left: "-30%", width: "30%" },
      { left: "100%", width: "30%" }
    ], {
      duration: 1500,
      iterations: Infinity,
      easing: "ease-in-out"
    });
    
    barContainer.appendChild(this.barElement);
    this.overlayContainer.appendChild(barContainer);
    
    // Status text
    this.waitTextElement = document.createElement("p");
    this.waitTextElement.innerText = "Please wait...";
    this.waitTextElement.style.color = "#ccc";
    this.waitTextElement.style.fontFamily = "Arial, sans-serif";
    this.waitTextElement.style.fontSize = "14px";
    this.waitTextElement.style.marginTop = "15px";
    this.waitTextElement.style.textAlign = "center";
    this.overlayContainer.appendChild(this.waitTextElement);

    document.body.appendChild(this.overlayContainer);
  }

  public static updateProgress(current: number, total: number, filename?: string) {
    if (!this.overlayContainer || !this.barElement || !this.waitTextElement) return;

    // Stop indeterminate animation once explicit progress is reported
    if (this.activeAnimation) {
      this.activeAnimation.cancel();
      this.activeAnimation = null;
      this.barElement.style.left = "0";
    }

    const percentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
    this.barElement.style.width = `${percentage}%`;

    const fileLabel = filename ? ` (${filename})` : "";
    this.waitTextElement.innerText = `Loading Deck ${current} of ${total}${fileLabel} - ${percentage}%`;
  }

  public static hide() {
    if (this.activeAnimation) {
      this.activeAnimation.cancel();
      this.activeAnimation = null;
    }
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
      this.barElement = null;
      this.waitTextElement = null;
    }
  }
}
