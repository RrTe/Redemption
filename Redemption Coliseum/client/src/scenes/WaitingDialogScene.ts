import Phaser from "phaser";

export interface WaitingDialogData {
  title?: string;
  message?: string;
}

/**
 * A modal scene that dims and blocks the entire game board while waiting
 * for an opponent to accept or decline an action (e.g. phase transition, undo).
 * Styled in dark glassmorphism with double gold borders to match ConfirmationDialogScene.
 */
export class WaitingDialogScene extends Phaser.Scene {
  private dialogData!: WaitingDialogData;

  private onResize = () => {
    if (this.scene.isActive()) {
      this.scene.restart(this.dialogData);
    }
  };

  constructor() {
    super("WaitingDialogScene");
  }

  /**
   * Initializes dialog data.
   *
   * @param data Configuration options including title and message.
   */
  init(data: WaitingDialogData) {
    this.dialogData = data || {};
    this.events.once("shutdown", () => {
      this.game.events.off("viewport-changed", this.onResize, this);
    });
  }

  /**
   * Creates the visual elements and modal blocker.
   */
  create() {
    this.game.events.on("viewport-changed", this.onResize, this);

    const baseW = 460;
    const baseH = 200;

    // Responsive scaling factor based on current viewport
    const scaleFactor = Math.min(
      1,
      (this.scale.width * 0.92) / baseW,
      (this.scale.height * 0.90) / baseH,
    );

    const width = Math.round(baseW * scaleFactor);
    const height = Math.round(baseH * scaleFactor);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Dimmed background overlay that absorbs all pointer input to block the scene
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setInteractive();

    // Dark glassmorphism panel with double gold borders (matching ConfirmationDialogScene)
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.96);
    bg.fillRoundedRect(cx - width / 2, cy - height / 2, width, height, 14);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.strokeRoundedRect(cx - width / 2, cy - height / 2, width, height, 14);
    bg.lineStyle(1, 0xd4af37, 0.35);
    bg.strokeRoundedRect(cx - width / 2 + 5, cy - height / 2 + 5, width - 10, height - 10, 10);

    const titleY = cy - height / 2 + Math.round(42 * scaleFactor);
    const messageY = cy + Math.round(20 * scaleFactor);
    const wrapW = width - Math.round(40 * scaleFactor);

    // Title text (Cinzel gold serif typography, matching ConfirmationDialogScene)
    this.add
      .text(cx, titleY, this.dialogData.title || "Phase Transition", {
        fontSize: `${Math.max(14, Math.round(22 * scaleFactor))}px`,
        fontFamily: "'Cinzel', 'Trajan Pro', Georgia, serif",
        fontStyle: "bold",
        color: "#ffd700",
        align: "center",
        wordWrap: { width: wrapW },
        shadow: { offsetX: 2, offsetY: 2, color: "#000000", blur: 2, fill: true },
      })
      .setOrigin(0.5);

    // Informational message (Segoe UI typography + pulsing waiting tween)
    const messageText = this.add
      .text(
        cx,
        messageY,
        this.dialogData.message || "Waiting for opponent confirmation...",
        {
          fontSize: `${Math.max(12, Math.round(18 * scaleFactor))}px`,
          fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
          color: "#e2e8f0",
          align: "center",
          wordWrap: { width: wrapW },
        },
      )
      .setOrigin(0.5)
      .setLineSpacing(Math.round(5 * scaleFactor));

    // Subtle breathing/pulse animation indicating active waiting state
    this.tweens.add({
      targets: messageText,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }
}
