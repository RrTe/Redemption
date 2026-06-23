import { BaseDialog, type DialogSeverity, type DialogOptions } from "./BaseDialog";

/**
 * Dialog window for displaying warnings, errors, and informational messages.
 */
export class AlertDialog extends BaseDialog {
  private titleText: string;
  private messageText: string;

  /**
   * Initializes the AlertDialog instance.
   *
   * Args:
   *   title: Header title of the alert.
   *   message: Body/description of the alert.
   *   severity: The visual priority tier ('info', 'warning', 'error').
   *   options: Config options.
   *
   * Returns:
   *   None.
   */
  constructor(
    title: string,
    message: string,
    severity: DialogSeverity,
    options: DialogOptions = {}
  ) {
    super(severity, options);
    this.titleText = title;
    this.messageText = message;
  }

  /**
   * Injects the alert elements (Title, Message, Button) into the panel.
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
    title.className = `dialog-title dialog-title-${this.severity}`;
    title.textContent = this.titleText;
    this.panel.appendChild(title);

    // Body Message
    const subtitle = document.createElement("div");
    subtitle.className = "dialog-subtitle";
    subtitle.textContent = this.messageText;
    this.panel.appendChild(subtitle);

    // Button Row Container
    const btnContainer = document.createElement("div");
    btnContainer.className = "dialog-button-container";

    // Standard Confirm/Close Action Button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "OK";
    
    // Choose button styling depending on alert severity
    if (this.severity === "error") {
      confirmBtn.className = "dialog-button-red";
    } else {
      confirmBtn.className = "dialog-button-gold";
    }

    confirmBtn.onclick = () => {
      this.dismiss();
    };

    btnContainer.appendChild(confirmBtn);
    this.panel.appendChild(btnContainer);
  }
}
