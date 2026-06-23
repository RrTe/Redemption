import Phaser from "phaser";
import { type RoomAvailable } from "colyseus.js";
import { type SoundManager } from "../../managers/SoundManager";
import { log } from "../../utils/logger";

export class LobbyUIManager {
  private scene: Phaser.Scene;
  private soundManager: SoundManager;

  // UI Elemente
  public listContainer!: Phaser.GameObjects.Container;
  public titleText!: Phaser.GameObjects.BitmapText;
  public subtitleText!: Phaser.GameObjects.BitmapText;
  public statusText!: Phaser.GameObjects.BitmapText;
  public debugText!: Phaser.GameObjects.Text;
  public nameLabel!: Phaser.GameObjects.BitmapText;
  public createBtn!: Phaser.GameObjects.Container;
  public deckSelectBtn!: Phaser.GameObjects.Container;
  public loadGameBtn!: Phaser.GameObjects.Container;
  public reconnectBtn!: Phaser.GameObjects.Container;
  public settingsButton!: Phaser.GameObjects.Image;
  public helpButton!: Phaser.GameObjects.Image;
  public legalBtn!: Phaser.GameObjects.Text;
  public privacyBtn!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Image; // ✨ NEU: Hintergrundbild-Referenz

  // Layout Props
  private itemHeight = 60;
  private scrollY = 0;
  private maxScrollY = 0;
  private visibleItems = 0;
  public upArrow!: Phaser.GameObjects.Image;
  public downArrow!: Phaser.GameObjects.Image;
  private listMaskGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, soundManager: SoundManager) {
    this.scene = scene;
    this.soundManager = soundManager;
  }

  public create() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    // Hintergrund
    this.background = this.scene.add
      .image(0, 0, "bg_temple")
      .setOrigin(0.5)
      .setAlpha(0.4)
      .setPosition(width / 2, height / 2);
    // Titel & Untertitel
    this.titleText = this.scene.add
      .bitmapText(
        width / 2,
        height * 0.1,
        "fairydust",
        "Redemption Coliseum",
        64,
      )
      .setOrigin(0.5)
      .setTint(0xfff0a0)
      .setDropShadow(4, 4, 0x000000, 0.8);

    this.subtitleText = this.scene.add
      .bitmapText(width / 2, height * 0.18, "fairydust", "Lobby", 32)
      .setOrigin(0.5)
      .setTint(0xcccccc)
      .setDropShadow(2, 2, 0x000000, 0.8);

    // Status Text
    this.statusText = this.scene.add
      .bitmapText(width / 2, height - 40, "fairydust", "Initializing...", 24)
      .setOrigin(0.5)
      .setTint(0xaaaaaa);

    // Debug Text (Bottom Right)
    this.debugText = this.scene.add
      .text(width - 10, height - 10, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#666666",
      })
      .setOrigin(1, 1);

    // Name Label
    this.nameLabel = this.scene.add
      .bitmapText(width / 2, height * 0.28 - 40, "fairydust", "Your Name:", 24)
      .setOrigin(0.5)
      .setTint(0xdaa520);

    // Liste Container & Maske
    this.listContainer = this.scene.add.container(0, 0);
    this.listMaskGraphics = this.scene.add.graphics().setVisible(false);
    const mask = this.listMaskGraphics.createGeometryMask();
    this.listContainer.setMask(mask);

    // Scroll Pfeile
    this.upArrow = this.scene.add
      .image(0, 0, "arrow_up")
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.downArrow = this.scene.add
      .image(0, 0, "arrow_down")
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    // Settings & Help Buttons
    this.settingsButton = this.scene.add
      .image(width + 12, height * 0.18, "button_settings")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6);

    this.helpButton = this.scene.add
      .image(-12, height * 0.7, "button_help")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6);

    // Footer Links
    this.legalBtn = this.scene.add
      .text(10, height - 10, "Legal / Impressum", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#666666",
      })
      .setOrigin(0, 1)
      .setInteractive({ useHandCursor: true });

    this.privacyBtn = this.scene.add
      .text(160, height - 10, "Privacy Policy", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#666666",
      })
      .setOrigin(0, 1)
      .setInteractive({ useHandCursor: true });
  }

  /** ✨ FIX: Fehlende destroy-Methode für Type-Safety hinzugefügt */
  public destroy() {
    // Phaser GameObjects werden beim Scene-Shutdown automatisch zerstört.
    // Diese Methode dient aktuell der Konsistenz für den Aufruf in LobbyScene.
  }

  public createButtons(callbacks: {
    onCreate: () => void;
    onSelectDeck: () => void;
    onLoad: () => void;
    onReconnect: () => void;
    onClearSession: () => void;
  }) {
    // Hilfsfunktion für Buttons
    const createBtn = (text: string, cb: () => void, tint = 0xffffff) => {
      const btn = this.createStyledButton(0, 0, text, cb); // Implementierung unten
      btn.setData("defaultTint", tint);
      return btn;
    };

    this.createBtn = createBtn("Create New Game", callbacks.onCreate);
    this.scene.add.existing(this.createBtn);

    this.deckSelectBtn = createBtn(
      "Select Deck (Random)",
      callbacks.onSelectDeck,
    );
    this.scene.add.existing(this.deckSelectBtn);

    this.loadGameBtn = createBtn("Load Game", callbacks.onLoad);
    this.scene.add.existing(this.loadGameBtn);

    // Reconnect Button (nur bei Bedarf sichtbar)
    this.reconnectBtn = createBtn(
      "Reconnect to Game",
      callbacks.onReconnect,
      0xccffcc,
    );
    this.scene.add.existing(this.reconnectBtn);

    // X Button für Reconnect
    const dismissBtn = this.scene.add
      .text(200, 0, "✖", {
        fontSize: "28px",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    dismissBtn.on("pointerdown", callbacks.onClearSession);
    this.reconnectBtn.add(dismissBtn);
  }

  public updateRoomList(
    rooms: RoomAvailable[],
    joinCallback: (roomId: string, btn: Phaser.GameObjects.Container) => void,
  ) {
    this.listContainer.removeAll(true);
    this.scrollY = 0;

    if (rooms.length === 0) {
      const txt = this.scene.add
        .text(0, 50, "No open games.", { color: "#888" })
        .setOrigin(0.5);
      this.listContainer.add(txt);
    } else {
      rooms.forEach((room, index) => {
        const y = index * this.itemHeight + this.itemHeight / 2;
        const name =
          room.metadata?.name || `Game ${room.roomId.substring(0, 4)}`; // Kürzere ID als Fallback
        const label = `${name} (${room.clients}/${room.maxClients})`; // Spielername im Label anzeigen

        const btn = this.createStyledButton(
          0,
          y,
          label,
          () => joinCallback(room.roomId, btn),
          450,
          50,
        );
        this.listContainer.add(btn);
      });
    }
    this.updateScrollLimits(rooms.length);
  }

  public updateDeckButtonText(filename: string, count: number) {
    const textObj = this.deckSelectBtn.getByName(
      "text",
    ) as Phaser.GameObjects.BitmapText;
    const shortName =
      filename.length > 15 ? filename.substring(0, 12) + "..." : filename;
    textObj.setText(`Deck: ${shortName} (${count})`);
  }

  public resize(width: number, height: number) {
    if (this.titleText) {
      this.background?.setPosition(width / 2, height / 2); // ✨ FIX: Hintergrund neu positionieren
      this.titleText.setPosition(width / 2, height * 0.1);
      this.titleText.setFontSize(Math.max(32, Math.min(80, height * 0.1)));
    }
    if (this.subtitleText) {
      this.subtitleText.setPosition(width / 2, height * 0.18);
      this.subtitleText.setFontSize(Math.max(20, Math.min(40, height * 0.05)));
    }

    const baseInputY = height * 0.28;
    let currentY = baseInputY + 80;

    this.nameLabel.setPosition(width / 2, baseInputY - 40);

    if (this.reconnectBtn && this.reconnectBtn.visible) {
      this.reconnectBtn.setPosition(width / 2, currentY);
      currentY += 70;
    }
    if (this.createBtn) this.createBtn.setPosition(width / 2, currentY);
    currentY += 70;
    if (this.deckSelectBtn) this.deckSelectBtn.setPosition(width / 2, currentY);
    currentY += 80;
    if (this.loadGameBtn) this.loadGameBtn.setPosition(width / 2, currentY);
    currentY += 80;

    // Liste positionieren
    const listY = Math.max(height * 0.55, currentY);
    this.listContainer.setPosition(width / 2, listY);

    // Maske und Scroll aktualisieren
    const availableHeight = height - listY - 80;
    this.visibleItems = Math.max(
      1,
      Math.floor(availableHeight / this.itemHeight),
    );
    const maskHeight = this.visibleItems * this.itemHeight;

    this.listMaskGraphics.clear();
    this.listMaskGraphics.fillStyle(0xffffff);
    this.listMaskGraphics.fillRect(width / 2 - 250, listY, 500, maskHeight);

    this.upArrow.setPosition(width / 2 + 280, listY + 30);
    this.downArrow.setPosition(width / 2 + 280, listY + maskHeight - 30);

    this.statusText?.setPosition(width / 2, height - 40);
    this.debugText?.setPosition(width - 10, height - 10);
    this.settingsButton?.setPosition(width + 12, height * 0.18);
    this.helpButton?.setPosition(-12, height * 0.7);
    this.legalBtn?.setPosition(10, height - 10);
    this.privacyBtn?.setPosition(160, height - 10);
  }

  public scrollList(delta: number) {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + delta, this.maxScrollY, 0);
    let index = 0;
    this.listContainer.each((child: any) => {
      if (child instanceof Phaser.GameObjects.Container) {
        child.y = index * this.itemHeight + this.itemHeight / 2 + this.scrollY;
        index++;
      }
    });
    this.upArrow.setVisible(this.scrollY < 0);
    this.downArrow.setVisible(this.scrollY > this.maxScrollY);
  }

  private updateScrollLimits(itemCount: number) {
    const totalH = itemCount * this.itemHeight;
    const visibleH = this.visibleItems * this.itemHeight;
    this.maxScrollY = Math.min(0, visibleH - totalH);
    this.scrollList(0); // Refresh
  }

  /** ✨ REFACTOR: Schaltet die Eingaben wieder frei (bei Fehlern) */
  public unlockInput() {
    this.createBtn?.setAlpha(1.0);
    this.deckSelectBtn?.setAlpha(1.0);
    this.loadGameBtn?.setAlpha(1.0);
  }

  /** ✨ NEU: Sperrt die UI visuell (wird beim Start-Versuch gerufen) */
  public lockAllButtons() {
    this.createBtn?.setAlpha(0.5);
    this.deckSelectBtn?.setAlpha(0.5);
    this.loadGameBtn?.setAlpha(0.5);
    this.reconnectBtn?.setAlpha(0.5);
  }

  private createStyledButton(
    x: number,
    y: number,
    label: string,
    cb: () => void,
    w = 300,
    h = 50,
  ) {
    const container = this.scene.add.container(x, y);
    const bg = this.scene.add
      .image(0, 0, "button_parchment")
      .setDisplaySize(w, h)
      .setName("bg");
    const text = this.scene.add
      .bitmapText(0, -5, "fairydust", label, 24)
      .setOrigin(0.5)
      .setTint(0xf4f6e1)
      .setName("text");

    container.add([bg, text]);
    container.setSize(w, h).setInteractive({ useHandCursor: true });
    container.setData("defaultTint", 0xffffff);

    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () =>
      bg.setTint(container.getData("defaultTint")),
    );
    container.on("pointerdown", () => {
      log("LobbyUI", `Button clicked: "${label}"`);

      this.soundManager.playSound("UI_TOGGLE");
      cb();
    });
    return container;
  }
}
