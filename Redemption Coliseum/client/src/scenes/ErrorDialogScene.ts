import Phaser from "phaser";
import { log } from "../utils/logger";
import { SoundManager } from "../managers/SoundManager";

interface ErrorDialogData {
  title: string;
  message: string;
  onOk?: () => void;
}

/**
 * A generic modal scene for displaying error messages with an OK button.
 */
export class ErrorDialogScene extends Phaser.Scene {
  private dialogData!: ErrorDialogData;
  private soundManager!: SoundManager;

  constructor() {
    super("ErrorDialogScene");
  }

  init(data: ErrorDialogData) {
    this.dialogData = data;
    this.soundManager = this.registry.get("soundManager");
  }

  create() {
    const width = 400;
    const height = 250;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2; 

    // Overlay (same as QuantitySelection)
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel (Dark gray box matching QuantitySelection)
    this.add
      .rectangle(cx, cy, width, height, 0x222222)
      .setStrokeStyle(2, 0x888888);

    // Title (English)
    this.add
      .text(cx, cy - height / 2 + 30, "Action Blocked", {
        fontSize: "24px", // ✨ FIX: Größe anpassen
        color: "#ffd700", // Gold für Warnung
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Message
    this.add
      .text(cx, cy - 10, this.dialogData.message, {
        fontSize: "20px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5)
      .setLineSpacing(5);

    // OK Button
    this.createStyledButton(cx, cy + height / 2 - 50, "OK", () => {
      this.soundManager.playSound("UI_CLICK");
      this.dialogData.onOk?.();
      this.scene.stop();
    });
  }

  /**
   * Creates a button in parchment style for consistency.
   */
  private createStyledButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
  ) {
    const container = this.add.container(x, y);
    const bg = this.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(130, 50);

    const fontSize = 24;
    const yOffset = fontSize * -0.25;
    const text = this.add.bitmapText(0, yOffset, "fairydust", label, fontSize);
    text.setOrigin(0.5);
    text.setTint(0xf4f6e1);
    text.setDropShadow(2, 2, 0x000000, 0.7);

    container.add([bg, text]);
    container.setSize(130, 50);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());
    container.on("pointerdown", callback);
  }
}
