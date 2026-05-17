import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type SoundManager } from "../../managers/SoundManager";
import { type DialogManager } from "./DialogManager"; // ✨ NEU
import { log } from "../../utils/logger";
import { DomUIManager } from "./GameDomManager"; // ✨ NEU

/**
 * Manages all UI overlays like "Waiting for Player", "Game Over", and the help screen.
 */
export class OverlayManager {
  private scene: Phaser.Scene;
  private room: TypedRoom; // ✨ FIX: Muss Member sein für Buttons
  private soundManager: SoundManager;
  private domUIManager: DomUIManager; // ✨ NEU
  private dialogManager!: DialogManager; // ✨ NEU: Setter-Injection für zirkuläre Abhängigkeit

  private waitingOverlay: Phaser.GameObjects.Container | null = null;
  private gameOverOverlay: Phaser.GameObjects.Container | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    soundManager: SoundManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.soundManager = soundManager;
    this.domUIManager = new DomUIManager(scene, room); // ✨ NEU
  }

  public registerHandlers() {
    this.domUIManager.registerHandlers(); // ✨ NEU
  }

  public setDialogManager(dialogManager: DialogManager) {
    this.dialogManager = dialogManager;
  }

  public destroy() {
    this.domUIManager.destroy(); // ✨ NEU
    this.hideWaitingOverlay();
    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
    }
  }

  public showGameOverOverlay(isWinner: boolean) {
    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
    }

    log(
      "UI",
      `Showing Game Over overlay. Player has ${isWinner ? "won" : "lost"}.`,
    );

    const { width, height } = this.scene.scale;
    this.gameOverOverlay = this.scene.add.container(0, 0).setDepth(11000);

    const bg = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0)
      .setInteractive();

    const titleText = isWinner ? "Victory!" : "Defeat";
    const titleColor = isWinner ? 0xffd700 : 0xaaaaaa;

    const title = this.scene.add
      .bitmapText(width / 2, height / 2 - 100, "fairydust", titleText, 96)
      .setOrigin(0.5)
      .setTint(titleColor)
      .setDropShadow(4, 4, 0x000000, 0.9);

    const backButton = this.createStyledButton(
      width / 2,
      height / 2 + 80,
      "Back to Lobby",
      () => {
        this.soundManager?.stopMusic();
        this.soundManager?.stopEverything(); // Sicherstellen, dass alle Sounds gestoppt werden
        this.room.leave();
        localStorage.removeItem("reconnectionToken");
        localStorage.removeItem("reconnectionRoomId"); // ✨ NEU: Filter löschen
        this.scene.scene.start("LobbyScene");
      },
    );

    this.gameOverOverlay.add([bg, title, backButton]);
    this.gameOverOverlay.setAlpha(0);

    this.scene.tweens.add({
      targets: this.gameOverOverlay,
      alpha: 1,
      duration: 1000,
      ease: "Power1",
    });
  }

  /**
   * Displays a modal error dialog with an OK button.
   * @param message The error message to display.
   * @param onOk Optional callback function when the OK button is pressed.
   */
  public showErrorDialog(message: string, onOk?: () => void) {
    this.dialogManager.showErrorDialog(message, onOk); // ✨ NEU: Delegation an DialogManager
  }

  /**
   * Displays a temporary notification text that fades out.
   */
  public showNotification(message: string, color: number = 0xff6666) {
    // For temporary notifications, we can still use the fading text,
    // or decide to use the modal dialog for all errors.
    // For now, let's keep the fading text for non-critical notifications
    // and use the modal for gameError messages.
    // If you want all notifications to be modal, uncomment the line below:
    // this.showErrorDialog(message);
    // return;

    const { width } = this.scene.scale;

    const text = this.scene.add
      .bitmapText(width / 2, 100, "fairydust", message, 32)
      .setOrigin(0.5)
      .setDepth(20000) // High depth to stay above everything
      .setTint(color)
      .setDropShadow(2, 2, 0x000000, 0.8);

    this.scene.tweens.add({
      targets: text,
      y: 70,
      alpha: 0,
      delay: 2000,
      duration: 1000,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }

  public toggleHelp() {
    this.domUIManager.toggleHelp(); // ✨ NEU: Delegation an DomUIManager
  }

  public showWaitingOverlay(message: string, showBackButton: boolean = false) {
    const { width, height } = this.scene.scale;

    if (this.waitingOverlay) {
      const textObj = this.waitingOverlay.getByName(
        "waitingText",
      ) as Phaser.GameObjects.BitmapText;
      if (textObj) textObj.setText(message);

      const backButton = this.waitingOverlay.getByName("backButton");
      if (showBackButton && !backButton) {
        this.addBackButtonToOverlay(width, height);
      } else if (!showBackButton && backButton) {
        backButton.destroy();
      }
      return;
    }

    this.waitingOverlay = this.scene.add.container(0, 0).setDepth(10000);

    const bg = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();

    const text = this.scene.add
      .bitmapText(width / 2, height / 2, "fairydust", message, 48)
      .setOrigin(0.5)
      .setTint(0xffd700)
      .setDropShadow(4, 4, 0x000000, 0.8)
      .setName("waitingText");

    this.scene.tweens.add({
      targets: text,
      alpha: 0.6,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    this.waitingOverlay.add([bg, text]);

    if (showBackButton) {
      this.addBackButtonToOverlay(width, height);
    }
  }

  public hideWaitingOverlay() {
    if (this.waitingOverlay) {
      this.waitingOverlay.destroy();
      this.waitingOverlay = null;
    }
  }

  private createStyledButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
    width: number = 300,
    height: number = 60,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(width, height);

    const fontSize = Math.min(32, height * 0.6);
    const yOffset = fontSize * -0.25;
    const text = this.scene.add
      .bitmapText(0, yOffset, "fairydust", label, fontSize)
      .setOrigin(0.5)
      .setTint(0xf4f6e1)
      .setDropShadow(2, 2, 0x000000, 0.7);

    container.add([bg, text]);
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());

    container.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      callback();
    });

    return container;
  }

  private addBackButtonToOverlay(width: number, height: number) {
    if (!this.waitingOverlay) return;
    const backButton = this.createStyledButton(
      width / 2,
      height / 2 + 80,
      "Back to Lobby",
      () => {
        this.soundManager?.stopMusic();
        this.soundManager?.stopEverything();
        this.room.leave();
        localStorage.removeItem("reconnectionToken");
        localStorage.removeItem("reconnectionRoomId"); // ✨ NEU: Filter löschen
        this.scene.scene.start("LobbyScene");
      },
    );
    backButton.setName("backButton");
    this.waitingOverlay.add(backButton);
  }
}
