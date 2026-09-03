import Phaser from "phaser";

export interface WaitingDialogData {
  title?: string;
  message?: string;
}

/**
 * A modal scene that dims and blocks the entire game board while waiting
 * for an opponent to accept or decline an action (e.g. undo request).
 */
export class WaitingDialogScene extends Phaser.Scene {
  private dialogData!: WaitingDialogData;

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
  }

  /**
   * Creates the visual elements and modal blocker.
   */
  create() {
    const width = 420;
    const height = 190;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Dimmed background overlay that absorbs all pointer input to block the scene
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    // Dialog background panel (exact match to ConfirmationDialogScene)
    this.add
      .rectangle(cx, cy, width, height, 0x222222)
      .setStrokeStyle(2, 0x888888);

    // Title text
    this.add
      .text(cx, cy - height / 2 + 32, this.dialogData.title || "Undo Request", {
        fontSize: "24px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Informational message
    const messageText = this.add
      .text(
        cx,
        cy + 15,
        this.dialogData.message || "Waiting for opponent to respond...",
        {
          fontSize: "19px",
          color: "#ffffff",
          align: "center",
          wordWrap: { width: width - 40 },
        },
      )
      .setOrigin(0.5)
      .setLineSpacing(5);

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
