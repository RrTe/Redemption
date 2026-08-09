import Phaser from "phaser";
import { type RoomAvailable } from "colyseus.js";
import { type SoundManager } from "../../managers/SoundManager";
import { log } from "../../utils/logger";
import { SidebarButton } from "../components/SidebarButton";

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
  public settingsButton!: SidebarButton;
  public exitButton!: SidebarButton;
  public helpButton!: SidebarButton;
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

    // Settings, Exit & Help Buttons
    this.settingsButton = new SidebarButton(
      this.scene,
      "button_settings",
      height * 0.18,
      true, // Right side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.scene.scene.pause();
        this.scene.scene.launch("SettingsDialogScene", { parentScene: "LobbyScene" });
      }
    );

    this.exitButton = new SidebarButton(
      this.scene,
      "button_exit",
      height * 0.18,
      false, // Left side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.scene.scene.start("HubScene");
      },
      "button_exit_to_hub"
    );

    this.helpButton = new SidebarButton(
      this.scene,
      "button_help",
      height * 0.7,
      false, // Left side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.scene.events.emit("help_button_clicked");
      }
    );

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
      .setInteractive({ useHandCursor: true })
      .setName("dismissBtn");
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
      // Dynamische Breite berechnen basierend auf dem längsten Spielnamen
      let maxTextWidth = 0;
      rooms.forEach((room) => {
        const name = room.metadata?.name || `Game ${room.roomId.substring(0, 4)}`;
        const label = `${name} (${room.clients}/${room.maxClients})`;
        const tempText = this.scene.add.bitmapText(0, 0, "fairydust", label, 28);
        maxTextWidth = Math.max(maxTextWidth, tempText.width);
        tempText.destroy();
      });
      // Minimal 200, Maximal 450. Wir addieren 60 Pixel Padding für die Ränder
      const dynamicWidth = Math.min(450, Math.max(200, maxTextWidth + 60));

      rooms.forEach((room, index) => {
        const y = index * this.itemHeight;
        const name =
          room.metadata?.name || `Game ${room.roomId.substring(0, 4)}`; // Kürzere ID als Fallback
        const label = `${name} (${room.clients}/${room.maxClients})`; // Spielername im Label anzeigen

        const width = this.scene.scale.gameSize.width;
        const height = this.scene.scale.gameSize.height;
        const isTwoColumn = width > height && height <= 600;

        // Im 2-Spalten-Layout richten wir den Button linksbündig mit dem Input-Feld aus.
        // Im normalen Layout (Desktop, Tablet) wird der Button einfach zentriert.
        let xOffset = 0;
        if (isTwoColumn) {
          xOffset = -160 + dynamicWidth / 2;
        }

        const btn = this.createStyledButton(
          xOffset,
          y,
          label,
          () => joinCallback(room.roomId, btn),
          dynamicWidth,
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

    // Dynamisches 2-Spalten Layout NUR für flache Handys im Querformat
    const isTwoColumn = width > height && height <= 600;
    const spread = Math.min(width * 0.2, 300); // Maximal 300px aus der Mitte rücken, damit Ultra-Wide nicht zerbricht
    const leftX = isTwoColumn ? (width / 2) - spread : width / 2;
    const rightX = isTwoColumn ? (width / 2) + spread : width / 2;

    // Y-Position für "Your Name" und Input
    let nameY = height * 0.35;
    
    // Y-Position für den Start der Buttons (links und rechts)
    let buttonStartY = height * 0.35 + height * 0.11;

    if (isTwoColumn) {
        nameY = height * 0.28; // Höher, zwischen Lobby und Buttons
        
        // Inputfeld etwas nach oben schieben (damit es mit dem BitmapText-Label auf einer visuellen Linie liegt)
        nameY -= 5 * uiScale;
        
        // Label ist mittig, direkt links neben dem Input-Feld platziert
        // Mitte - 15px Abstand
        this.nameLabel.setPosition(width / 2 - 15 * uiScale, nameY);
        this.nameLabel.setOrigin(1, 0.5); // Rechtsbündig
        
        buttonStartY = height * 0.45; // Buttons etwas nach unten setzen
    } else {
        // Label ist ÜBER dem Input (für schmale Hochformat-Handys und Desktop)
        const nameLabelOffset = height * 0.06;
        this.nameLabel.setPosition(width / 2, nameY - nameLabelOffset);
        this.nameLabel.setOrigin(0.5, 0.5);
    }
    this.nameLabel.setScale(uiScale);

    let currentY = buttonStartY;

    // Haupt-Buttons (in der linken Spalte)
    if (this.reconnectBtn && this.reconnectBtn.visible) {
      this.reconnectBtn.setPosition(leftX, currentY);
      this.reconnectBtn.setData("baseScale", uiScale);
      this.reconnectBtn.setScale(uiScale);

      const dismissBtn = this.reconnectBtn.getByName("dismissBtn") as Phaser.GameObjects.Text;
      if (dismissBtn) {
        if (isTwoColumn || width <= 800) {
          dismissBtn.setPosition(165, 0);
        } else {
          dismissBtn.setPosition(200, 0);
        }
      }

      currentY += 70 * uiScale;
    }
    if (this.createBtn) {
      this.createBtn.setPosition(leftX, currentY);
      this.createBtn.setData("baseScale", uiScale);
      this.createBtn.setScale(uiScale);
    }
    currentY += 70 * uiScale;
    if (this.deckSelectBtn) {
      this.deckSelectBtn.setPosition(leftX, currentY);
      this.deckSelectBtn.setData("baseScale", uiScale);
      this.deckSelectBtn.setScale(uiScale);
    }
    currentY += 70 * uiScale;
    if (this.loadGameBtn) {
      this.loadGameBtn.setPosition(leftX, currentY);
      this.loadGameBtn.setData("baseScale", uiScale);
      this.loadGameBtn.setScale(uiScale);
    }
    currentY += 80 * uiScale;

    // Liste positionieren (in der rechten Spalte)
    // Bei 2-Spalten startet die Liste exakt auf der Höhe des ersten Buttons
    let listY = isTwoColumn ? buttonStartY : currentY; 
    let listHeight = height - listY - 50; 

    this.listContainer.setPosition(rightX, listY);
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
        rightX - 250 * uiScale,
        listY - (this.itemHeight / 2) * uiScale,
        500 * uiScale,
        maskHeight,
      );

      this.upArrow.setPosition(rightX + 280 * uiScale, listY - 10 * uiScale);
      this.upArrow.setScale(uiScale);
      this.downArrow.setPosition(rightX + 280 * uiScale, listY + maskHeight - 40 * uiScale);
      this.downArrow.setScale(uiScale);
    }

    this.statusText?.setPosition(width / 2, height - 40);
    this.debugText?.setPosition(width - 10, height - 10);
    this.settingsButton?.resize(width, height * 0.18);
    this.exitButton?.resize(width, height * 0.18);
    if (this.helpButton) this.helpButton.resize(width, height * 0.7);
    this.legalBtn?.setPosition(10, height - 10);
    this.privacyBtn?.setPosition(160, height - 10);
  }

  public scrollList(delta: number) {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + delta, this.maxScrollY, 0);
    let index = 0;
    this.listContainer.each((child: any) => {
      if (child instanceof Phaser.GameObjects.Container) {
        child.y = index * this.itemHeight + this.scrollY;
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
    container.setData("baseScale", 1.0);

    container.on("pointerover", () => {
      bg.setTint(0xdddddd);
      const baseScale = container.getData("baseScale") || 1.0;
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        scale: baseScale * 1.08,
        duration: 120,
        ease: "Back.easeOut",
      });
    });
    container.on("pointerout", () => {
      bg.setTint(container.getData("defaultTint"));
      const baseScale = container.getData("baseScale") || 1.0;
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        scale: baseScale,
        duration: 120,
        ease: "Cubic.easeOut",
      });
    });
    container.on("pointerdown", () => {
      log("LobbyUI", `Button clicked: "${label}"`);

      this.soundManager.playSound("UI_TOGGLE");
      cb();
    });
    return container;
  }
}
