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

    // Name Label (Schriftgröße hier einstellbar)
    const nameLabelFontSize = 32; // Vorher 24
    this.nameLabel = this.scene.add
      .bitmapText(width / 2, height * 0.28 - 40, "fairydust", "Your Name:", nameLabelFontSize)
      .setOrigin(0.5)
      .setTint(0xffe44d)
      .setDropShadow(3, 3, 0x000000, 1);

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
    const newText = `Deck: ${shortName} (${count})`;
    textObj.setText(newText);

    // Update eventuell vorhandenen Schatten
    const shadowText = this.deckSelectBtn.getByName("text_shadow") as Phaser.GameObjects.BitmapText;
    if (shadowText) shadowText.setText(newText);
  }

  public resize(width: number, height: number) {
    const uiScale = Math.max(0.75, Math.min(1, height / 800));

    if (this.titleText) {
      this.background?.setPosition(width / 2, height / 2); // ✨ FIX: Hintergrund neu positionieren
      this.titleText.setPosition(width / 2, height * 0.1);
      this.titleText.setFontSize(Math.max(32, Math.min(80, height * 0.1)));
    }
    if (this.subtitleText) {
      this.subtitleText.setPosition(width / 2, height * 0.18);
      this.subtitleText.setFontSize(Math.max(20, Math.min(40, height * 0.05)));
    }

    // Auf extrem flachen Bildschirmen (Handy quer) positionieren wir die Haupt-Buttons 
    // links und die Spielliste rechts, damit beides genug Platz hat!
    const isLandscapeMobile = width > height && height <= 600;
    const uiX = isLandscapeMobile ? width * 0.35 : width / 2;
    const listX = isLandscapeMobile ? width * 0.75 : width / 2;

    // Y-Position für das Eingabefeld (weiter unten, damit es nicht in "Lobby" klebt)
    const baseInputY = height * 0.35;
    
    // HIER stellst du den Abstand zwischen dem Eingabefeld und dem ERSTEN Button ein (z.B. 10% der Bildschirmhöhe):
    const firstButtonOffset = height * 0.11; 
    let currentY = baseInputY + firstButtonOffset;

    // HIER kannst du den Abstand zwischen "Your Name:" und der Box völlig dynamisch einstellen (z.B. 8% der Bildschirmhöhe):
    const nameLabelOffset = height * 0.06;
    this.nameLabel.setPosition(uiX, baseInputY - nameLabelOffset);
    this.nameLabel.setScale(uiScale);

    if (this.reconnectBtn && this.reconnectBtn.visible) {
      this.reconnectBtn.setPosition(uiX, currentY);
      this.reconnectBtn.setScale(uiScale);
      currentY += 70 * uiScale;
    }
    if (this.createBtn) {
      this.createBtn.setPosition(uiX, currentY);
      this.createBtn.setScale(uiScale);
    }
    currentY += 70 * uiScale;
    if (this.deckSelectBtn) {
      this.deckSelectBtn.setPosition(uiX, currentY);
      this.deckSelectBtn.setScale(uiScale);
    }
    currentY += 70 * uiScale;
    if (this.loadGameBtn) {
      this.loadGameBtn.setPosition(uiX, currentY);
      this.loadGameBtn.setScale(uiScale);
    }
    currentY += 80 * uiScale;

    // Liste positionieren
    let listY = Math.max(height * 0.50, currentY);
    let listHeight = height - listY - 50; 

    // Im Handy-Querformat platzieren wir die Liste rechts daneben und geben ihr viel mehr Höhe!
    if (isLandscapeMobile) {
        listY = baseInputY - nameLabelOffset; // Startet auf Höhe des Namens
        listHeight = height - listY - 20;     // Geht fast bis ganz nach unten
    }

    this.listContainer.setPosition(listX, listY);
    this.listContainer.setScale(uiScale);

    // Maske und Scroll aktualisieren
    const scaledItemHeight = this.itemHeight * uiScale;
    this.visibleItems = Math.max(
      1,
      Math.floor(listHeight / scaledItemHeight),
    );
    // Die exakte Höhe für die Maske, damit sie nicht mitten im Item abschneidet
    const maskHeight = this.visibleItems * this.itemHeight * uiScale;

    if (listHeight > 0) {
      this.listMaskGraphics.clear();
      this.listMaskGraphics.fillStyle(0xffffff, 1);
      this.listMaskGraphics.fillRect(
        listX - 250 * uiScale,
        listY,
        500 * uiScale,
        maskHeight,
      );

      this.upArrow.setPosition(listX + 280 * uiScale, listY + 30 * uiScale);
      this.upArrow.setScale(uiScale);
      this.downArrow.setPosition(listX + 280 * uiScale, listY + maskHeight - 30 * uiScale);
      this.downArrow.setScale(uiScale);
    }

    this.statusText?.setPosition(width / 2, height - 40);
    this.debugText?.setPosition(width - 10, height - 10);
    this.settingsButton?.setPosition(width + 12, height * 0.1);
    this.helpButton?.setPosition(-12, height * 0.1);
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
    // ---------------------------------------------------------
    // HIER KANNST DU DIE SCHRIFT DER BUTTONS EINSTELLEN:
    const fontSize = 28;       // Etwas größer als vorher (26) für bessere Lesbarkeit
    const textColor = 0xffe44d; // Textfarbe (Gold)
    
    // Y-Verschiebung für perfekte Mitte: 
    // "fairydust" hat im Font-File asymmetrische Ränder. -5 bis -6 Pixel ziehen den Text optisch exakt in die Mitte!
    const textOffsetY = -5;    

    // SCHATTEN-EINSTELLUNGEN:
    const shadowX = 2;         // Verschiebung des Schattens nach rechts
    const shadowY = 3;         // Etwas weiter nach unten
    const shadowColor = 0x000000; // Farbe des Schattens (Schwarz)
    const shadowAlpha = 1.0;   // Volle Deckkraft für maximalen Kontrast!
    // ---------------------------------------------------------

    // Einfacher, dezenter Schlagschatten
    const shadow = this.scene.add.bitmapText(shadowX, textOffsetY + shadowY, "fairydust", label, fontSize)
      .setOrigin(0.5)
      .setTint(shadowColor)
      .setAlpha(shadowAlpha)
      .setName("text_shadow");

    const text = this.scene.add
      .bitmapText(0, textOffsetY, "fairydust", label, fontSize)
      .setOrigin(0.5)
      .setTint(textColor)
      .setName("text");

    container.add([bg, shadow, text]);
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
