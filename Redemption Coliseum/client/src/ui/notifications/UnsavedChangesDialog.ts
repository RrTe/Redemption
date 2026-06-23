import { BaseDialog } from "./BaseDialog";

export class UnsavedChangesDialog extends BaseDialog {
  private onSaveJSON: () => void;
  private onSaveLackey: () => void;
  private onDiscard: () => void;

  constructor(callbacks: {
    onSaveJSON: () => void;
    onSaveLackey: () => void;
    onDiscard: () => void;
  }) {
    super("warning", {});
    this.onSaveJSON = callbacks.onSaveJSON;
    this.onSaveLackey = callbacks.onSaveLackey;
    this.onDiscard = callbacks.onDiscard;
  }

  protected override renderContent(): void {
    if (!this.panel) return;

    // Apply custom layout size for 4 buttons to fit nicely
    this.panel.style.width = "520px";
    this.panel.style.height = "auto";
    this.panel.style.minHeight = "250px";

    // Header Title
    const title = document.createElement("div");
    title.className = "dialog-title dialog-title-warning";
    title.textContent = "Unsaved Changes";
    this.panel.appendChild(title);

    // Body Message
    const subtitle = document.createElement("div");
    subtitle.className = "dialog-subtitle";
    subtitle.textContent = "You have unsaved changes. How would you like to proceed?";
    this.panel.appendChild(subtitle);

    // Button Row Container
    const btnContainer = document.createElement("div");
    btnContainer.className = "dialog-button-container";
    btnContainer.style.flexWrap = "wrap";
    btnContainer.style.justifyContent = "center";

    // 1. Save JSON Button
    const saveJsonBtn = document.createElement("button");
    saveJsonBtn.className = "dialog-button-gold";
    saveJsonBtn.textContent = "Save JSON";
    saveJsonBtn.onclick = () => {
      this.onSaveJSON();
      this.dismiss();
    };
    btnContainer.appendChild(saveJsonBtn);

    // 2. Save Lackey (TXT) Button
    const saveTxtBtn = document.createElement("button");
    saveTxtBtn.className = "dialog-button-gold";
    saveTxtBtn.textContent = "Save TXT";
    saveTxtBtn.onclick = () => {
      this.onSaveLackey();
      this.dismiss();
    };
    btnContainer.appendChild(saveTxtBtn);

    // 3. Don't Save Button (Proceed anyway)
    const discardBtn = document.createElement("button");
    discardBtn.className = "dialog-button-red";
    discardBtn.textContent = "Don't Save";
    discardBtn.onclick = () => {
      this.onDiscard();
      this.dismiss();
    };
    btnContainer.appendChild(discardBtn);

    // 4. Cancel Button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-button-dark";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => {
      this.dismiss();
    };
    btnContainer.appendChild(cancelBtn);

    this.panel.appendChild(btnContainer);
  }
}
