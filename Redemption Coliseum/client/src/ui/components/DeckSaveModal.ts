import Phaser from "phaser";
import { ViewportManager } from "../managers/ViewportManager";

export interface DeckSaveModalOptions {
  scene: Phaser.Scene;
  initialName: string;
  formatLabel: string;
  onSave: (deckName: string) => void;
  onCancel?: () => void;
}

export class DeckSaveModal {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private blocker!: Phaser.GameObjects.Rectangle;
  private domElement!: Phaser.GameObjects.DOMElement;
  private initialName: string;
  private formatLabel: string;
  private onSave: (deckName: string) => void;
  private onCancel?: () => void;

  constructor(options: DeckSaveModalOptions) {
    this.scene = options.scene;
    this.initialName = options.initialName;
    this.formatLabel = options.formatLabel;
    this.onSave = options.onSave;
    this.onCancel = options.onCancel;
  }

  public show(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    // Set modal flag on scene and hide any active card zoom/tooltips
    (this.scene as any).isModalOpen = true;
    this.scene.events.emit("card-zoomed-out");
    this.scene.events.emit("ui:deck-card-unhovered");

    this.container = this.scene.add.container(0, 0).setDepth(100000);

    // Dark backdrop blocker
    this.blocker = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.75)
      .setOrigin(0)
      .setInteractive();

    const stopPropagation = (pointer: Phaser.Input.Pointer) => {
      if (pointer && pointer.event) {
        pointer.event.stopPropagation();
      }
    };

    this.blocker.on("pointerdown", stopPropagation);
    this.blocker.on("pointerup", stopPropagation);
    this.blocker.on("pointermove", stopPropagation);
    this.blocker.on("pointerover", stopPropagation);
    this.blocker.on("pointerout", stopPropagation);

    this.container.add(this.blocker);

    // Create HTML Modal Box
    const defaultName = this.initialName.replace(/\.[^/.]+$/, "") || "New Deck";

    const modalHtml = `
      <div id="deck-save-modal-box" style="
        width: 480px;
        max-width: 90vw;
        background: linear-gradient(135deg, rgba(28, 20, 15, 0.97) 0%, rgba(15, 10, 5, 0.99) 100%);
        border: 2px solid #ffd700;
        border-radius: 14px;
        box-shadow: 0 0 30px rgba(255, 215, 0, 0.35), inset 0 0 20px rgba(0, 0, 0, 0.85);
        padding: 26px 28px;
        color: #f0e6d2;
        font-family: 'Cinzel', 'Trajan Pro', Georgia, serif;
        box-sizing: border-box;
        text-align: center;
        user-select: none;
      ">
        <h2 style="
          margin: 0 0 10px 0;
          color: #ffd700;
          font-size: 26px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          letter-spacing: 1.5px;
        ">SAVE DECK AS</h2>

        <div style="
          font-size: 14px;
          color: #c8b898;
          margin-bottom: 18px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        ">Format: <span style="color: #ffd700; font-weight: bold;">${this.formatLabel}</span></div>

        <div style="text-align: left; margin-bottom: 8px; font-size: 16px; color: #ffd700; font-weight: bold; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
          Deck Name:
        </div>

        <input type="text" id="deck-save-name-input" value="${defaultName}" placeholder="Enter deck name..." style="
          width: 100%;
          padding: 12px 16px;
          font-size: 18px;
          font-weight: bold;
          font-family: inherit;
          background: rgba(0, 0, 0, 0.7);
          border: 1.5px solid #8a6828;
          border-radius: 8px;
          color: #ffffff;
          box-sizing: border-box;
          outline: none;
          box-shadow: inset 0 2px 5px rgba(0,0,0,0.7);
          transition: border-color 0.2s, box-shadow 0.2s;
        " onfocus="this.style.borderColor='#ffd700'; this.style.boxShadow='0 0 10px rgba(255,215,0,0.5)';" onblur="this.style.borderColor='#8a6828'; this.style.boxShadow='inset 0 2px 5px rgba(0,0,0,0.7)';" />

        <div style="
          margin-top: 12px;
          font-size: 13px;
          color: #f5e6c8;
          text-shadow: 0 1px 3px rgba(0,0,0,0.9);
          text-align: left;
          line-height: 1.45;
        ">
          💡 <i>This name will be used for your deck file and local deck tile.</i>
        </div>

        <div style="
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        ">
          <button id="deck-save-cancel-btn" style="
            padding: 8px 18px;
            background: linear-gradient(to bottom, #443322 0%, #221100 100%);
            border: 1px solid #665544;
            border-radius: 6px;
            color: #d0c0a0;
            font-size: 14px;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.15s;
          ">Cancel</button>

          <button id="deck-save-submit-btn" style="
            padding: 8px 22px;
            background: linear-gradient(to bottom, #b8860b 0%, #785404 100%);
            border: 1px solid #ffd700;
            border-radius: 6px;
            color: #ffffff;
            font-weight: bold;
            font-size: 14px;
            font-family: inherit;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
            transition: all 0.15s;
          ">Save Deck</button>
        </div>
      </div>
    `;

    this.domElement = this.scene.add.dom(width / 2, height / 2).createFromHTML(modalHtml);
    this.container.add(this.domElement);

    // Setup input autofocus & button handlers after DOM insertion
    setTimeout(() => {
      const inputEl = document.getElementById("deck-save-name-input") as HTMLInputElement;
      const submitBtn = document.getElementById("deck-save-submit-btn") as HTMLButtonElement;
      const cancelBtn = document.getElementById("deck-save-cancel-btn") as HTMLButtonElement;

      if (inputEl) {
        inputEl.focus();
        inputEl.select();

        inputEl.onkeydown = (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.handleSave(inputEl.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            this.destroy();
            if (this.onCancel) this.onCancel();
          }
        };
      }

      if (submitBtn) {
        submitBtn.onclick = () => {
          if (inputEl) this.handleSave(inputEl.value);
        };
      }

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          this.destroy();
          if (this.onCancel) this.onCancel();
        };
      }
    }, 50);
  }

  private handleSave(rawName: string): void {
    const cleanName = rawName.trim().replace(/\.[^/.]+$/, "");
    const finalName = cleanName.length > 0 ? cleanName : "New Deck";
    this.destroy();
    this.onSave(finalName);
  }

  public destroy(): void {
    if (this.scene) {
      (this.scene as any).isModalOpen = false;
    }
    if (this.container) {
      this.container.destroy();
    }
  }
}
