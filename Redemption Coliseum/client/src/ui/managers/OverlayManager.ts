import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type SoundManager } from "../../managers/SoundManager";
import { log } from "../../utils/logger";

/**
 * Manages all UI overlays like "Waiting for Player", "Game Over", and the help screen.
 */
export class OverlayManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private soundManager: SoundManager;

  private waitingOverlay: Phaser.GameObjects.Container | null = null;
  private gameOverOverlay: Phaser.GameObjects.Container | null = null;
  private helpOverlay: HTMLElement | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    soundManager: SoundManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.soundManager = soundManager;
  }

  public registerHandlers() {
    this.room.onMessage("saveGameData", (data: any) => {
      this.downloadSaveFile(data);
    });
  }

  private downloadSaveFile(data: any) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.download = `redemption_save_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log("UI", "Save game downloaded.");
  }

  public destroy() {
    if (this.helpOverlay) {
      this.helpOverlay.remove();
      this.helpOverlay = null;
    }
    this.hideWaitingOverlay();
    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
    }
  }

  public showGameOverOverlay(isWinner: boolean) {
    if (this.gameOverOverlay) return;

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
        this.soundManager?.stopEverything();
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

  public toggleHelp() {
    if (this.helpOverlay) {
      const isVisible = this.helpOverlay.style.display !== "none";
      this.helpOverlay.style.display = isVisible ? "none" : "flex";
      return;
    }

    this.helpOverlay = document.createElement("div");
    this.helpOverlay.id = "game-help-overlay";
    Object.assign(this.helpOverlay.style, {
      position: "absolute",
      top: "10%",
      left: "10%",
      width: "80%",
      height: "80%",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      border: "2px solid #ffd700",
      borderRadius: "10px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 0 20px rgba(0,0,0,0.8)",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 20px",
      backgroundColor: "#1a1a2e",
      borderBottom: "1px solid #444",
      color: "#ffd700",
      fontFamily: "serif",
      fontSize: "24px",
    });
    header.innerHTML = "<span>Game Guide</span>";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "X";
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      color: "#ff6666",
      fontSize: "24px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    closeBtn.onclick = () => {
      if (this.helpOverlay) this.helpOverlay.style.display = "none";
    };
    header.appendChild(closeBtn);

    const iframe = document.createElement("iframe");
    iframe.src = "help.html";
    Object.assign(iframe.style, {
      flex: "1",
      border: "none",
      background: "#fff",
    });

    this.helpOverlay.appendChild(header);
    this.helpOverlay.appendChild(iframe);
    document.body.appendChild(this.helpOverlay);
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
