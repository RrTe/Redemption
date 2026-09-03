import Phaser from "phaser";
import { SoundManager } from "../managers/SoundManager";

export interface ConfirmationDialogData {
  title?: string;
  message: string;
  confirmLabel?: string;
  declineLabel?: string;
  onConfirm: () => void;
  onDecline: () => void;
}

/**
 * A modal scene for yes/no confirmation prompts (e.g. undo requests).
 */
export class ConfirmationDialogScene extends Phaser.Scene {
  private dialogData!: ConfirmationDialogData;
  private soundManager!: SoundManager;

  constructor() {
    super("ConfirmationDialogScene");
  }

  init(data: ConfirmationDialogData) {
    this.dialogData = data;
    this.soundManager = this.registry.get("soundManager");
  }

  create() {
    const width = 420;
    const height = 260;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Overlay (dimmed background)
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Panel
    this.add
      .rectangle(cx, cy, width, height, 0x222222)
      .setStrokeStyle(2, 0x888888);

    // Title
    this.add
      .text(cx, cy - height / 2 + 32, this.dialogData.title || "Undo Request", {
        fontSize: "24px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Message
    this.add
      .text(cx, cy - 10, this.dialogData.message, {
        fontSize: "19px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5)
      .setLineSpacing(5);

    const buttonY = cy + height / 2 - 45;
    const confirmLabel = this.dialogData.confirmLabel || "Accept";
    const declineLabel = this.dialogData.declineLabel || "Decline";

    // Accept Button
    this.createStyledButton(cx - 75, buttonY, confirmLabel, 0x2ecc71, () => {
      this.soundManager?.playSound("UI_CLICK");
      this.dialogData.onConfirm();
      this.scene.stop();
    });

    // Decline Button
    this.createStyledButton(cx + 75, buttonY, declineLabel, 0xe74c3c, () => {
      this.soundManager?.playSound("UI_CLICK");
      this.dialogData.onDecline();
      this.scene.stop();
    });
  }

  private createStyledButton(
    x: number,
    y: number,
    label: string,
    tint: number,
    callback: () => void,
  ) {
    const container = this.add.container(x, y);
    const bg = this.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(120, 44);

    const fontSize = 20;
    const yOffset = fontSize * -0.25;
    const text = this.add.bitmapText(0, yOffset, "fairydust", label, fontSize);
    text.setOrigin(0.5);
    text.setTint(0xf4f6e1);
    text.setDropShadow(2, 2, 0x000000, 0.7);

    container.add([bg, text]);
    container.setSize(120, 44);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());
    container.on("pointerdown", callback);
  }
}
