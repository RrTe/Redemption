import { BaseDialog, type DialogOptions } from "./BaseDialog";

/**
 * Custom sharing modal dialog showing a read-only deck validation URL.
 * Offers click-to-copy functionality and copy-success feedbacks.
 */
export class DeckURLDialog extends BaseDialog {
  private deckURLString: string;
  private copyFeedbackTimeoutId: number | null = null;

  /**
   * Initializes the DeckURLDialog instance.
   *
   * Args:
   *   deckURLString: The sharing deck URL to display.
   *   options: Config options.
   *
   * Returns:
   *   None.
   */
  constructor(deckURLString: string, options: DialogOptions = {}) {
    super("info", options);
    this.deckURLString = deckURLString;
  }

  /**
   * Injects the sharing elements (Title, Subtitle, Input link field, Copy and Close buttons) into the panel.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  protected override renderContent(): void {
    if (!this.panel) return;

    // Header Title
    const title = document.createElement("div");
    title.className = "dialog-title dialog-title-info";
    title.textContent = "Share your Deck";
    this.panel.appendChild(title);

    // Instruction Subtitle
    const subtitle = document.createElement("div");
    subtitle.className = "dialog-subtitle";
    subtitle.textContent = "Copy the URL below to share your deck with others:";
    this.panel.appendChild(subtitle);

    // Read-only monospaced URL Input
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.readOnly = true;
    urlInput.className = "dialog-input";
    urlInput.value = this.deckURLString;
    this.panel.appendChild(urlInput);

    // Button Row Container
    const btnContainer = document.createElement("div");
    btnContainer.className = "dialog-button-container";

    // Copy Action Button
    const copyBtn = document.createElement("button");
    copyBtn.className = "dialog-button-gold";
    copyBtn.textContent = "Copy Link";

    // Reusable copy trigger
    const triggerCopy = () => {
      urlInput.select();
      navigator.clipboard.writeText(this.deckURLString);

      // Visual feedback change to green/Copied
      copyBtn.textContent = "Copied!";
      copyBtn.style.background = "#28a745";
      copyBtn.style.color = "#ffffff";

      if (this.copyFeedbackTimeoutId) {
        window.clearTimeout(this.copyFeedbackTimeoutId);
      }

      this.copyFeedbackTimeoutId = window.setTimeout(() => {
        copyBtn.textContent = "Copy Link";
        copyBtn.style.background = ""; // Reverts to CSS class standard
        copyBtn.style.color = "";
        this.copyFeedbackTimeoutId = null;
      }, 2000);
    };

    urlInput.onclick = triggerCopy;
    copyBtn.onclick = triggerCopy;
    btnContainer.appendChild(copyBtn);

    // Close Dialog Button
    const closeBtn = document.createElement("button");
    closeBtn.className = "dialog-button-dark";
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => {
      this.dismiss();
    };
    btnContainer.appendChild(closeBtn);

    this.panel.appendChild(btnContainer);
  }

  /**
   * Extends destruction cleanup to stop the copy feedback timer.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  public override destroy(): void {
    if (this.copyFeedbackTimeoutId) {
      window.clearTimeout(this.copyFeedbackTimeoutId);
      this.copyFeedbackTimeoutId = null;
    }
    super.destroy();
  }
}
