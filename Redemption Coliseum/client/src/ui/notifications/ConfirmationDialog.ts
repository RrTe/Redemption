import { BaseDialog, type DialogSeverity } from "./BaseDialog";

export interface ConfirmationDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: DialogSeverity;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * Reusable modal confirmation dialog extending BaseDialog for Redemption Coliseum.
 * Maintains consistent styling across all user confirmation prompts.
 */
export class ConfirmationDialog extends BaseDialog {
  private titleText: string;
  private messageText: string;
  private confirmLabel: string;
  private cancelLabel: string;
  private onConfirm: () => void;
  private onCancel?: () => void;

  constructor(options: ConfirmationDialogOptions) {
    super(options.severity || "warning", {});
    this.titleText = options.title;
    this.messageText = options.message;
    this.confirmLabel = options.confirmLabel || "OK";
    this.cancelLabel = options.cancelLabel || "Cancel";
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;
  }

  protected override renderContent(): void {
    if (!this.panel) return;

    // Header Title
    const title = document.createElement("div");
    title.className = `dialog-title dialog-title-${this.severity}`;
    title.textContent = this.titleText;
    this.panel.appendChild(title);

    // Body Message
    const subtitle = document.createElement("div");
    subtitle.className = "dialog-subtitle";
    subtitle.style.lineHeight = "1.5";
    subtitle.style.marginBottom = "20px";
    subtitle.innerHTML = this.messageText;
    this.panel.appendChild(subtitle);

    // Button Row Container
    const btnContainer = document.createElement("div");
    btnContainer.className = "dialog-button-container";
    btnContainer.style.display = "flex";
    btnContainer.style.justifyContent = "flex-end";
    btnContainer.style.gap = "12px";

    // Cancel Button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-button-dark";
    cancelBtn.textContent = this.cancelLabel;
    cancelBtn.onclick = () => {
      this.dismiss();
      if (this.onCancel) this.onCancel();
    };
    btnContainer.appendChild(cancelBtn);

    // Confirm Action Button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = this.confirmLabel;
    confirmBtn.className = this.severity === "error" || this.severity === "warning" ? "dialog-button-red" : "dialog-button-gold";
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.dismiss();
    };
    btnContainer.appendChild(confirmBtn);

    this.panel.appendChild(btnContainer);
  }
}
