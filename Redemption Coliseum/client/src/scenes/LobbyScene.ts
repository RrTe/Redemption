import Phaser from "phaser";
import { Client, type RoomAvailable, type Room } from "colyseus.js";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager"; // ✨ NEU
import { log, error, DEBUG } from "../utils/logger";
import { DeckUtils, type DeckData } from "../utils/DeckUtils"; // ✨ NEU: Import

export class LobbyScene extends Phaser.Scene {
  private client!: Client;
  private listContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.BitmapText; // ✨ FIX: Jetzt BitmapText für konsistenten Look
  private rooms: RoomAvailable[] = [];
  private lobbyRoom?: Room; // ✨ NEU: Referenz auf den Lobby-Raum
  private endpoint!: string; // ✨ NEW: Store endpoint for HTTP fallback
  private httpEndpoint!: string; // ✨ NEU: Speichere auch den HTTP-Endpoint für Debugging

  // ✨ NEU: Referenzen für Responsive Layout
  private background!: Phaser.GameObjects.Image;
  private titleText!: Phaser.GameObjects.BitmapText; // ✨ FIX: BitmapText statt Text
  private subtitleText!: Phaser.GameObjects.BitmapText; // ✨ FIX: BitmapText statt Text
  private createBtn!: Phaser.GameObjects.Container;
  private debugText!: Phaser.GameObjects.Text; // ✨ NEU: Debug-Anzeige für Server-URL
  private deckSelectBtn!: Phaser.GameObjects.Container; // ✨ NEU: Button für Deckwahl
  private reconnectBtn!: Phaser.GameObjects.Container; // ✨ NEU: Button für Reconnect
  private loadGameBtn!: Phaser.GameObjects.Container; // ✨ NEU: Button für Spiel laden
  private selectedDeck: DeckData = { main: [], reserve: [] }; // ✨ FIX: Nutze nun das zentrale Interface
  private playerNameInput!: Phaser.GameObjects.DOMElement; // ✨ NEU: HTML Input
  private playerName: string = "Player 1"; // ✨ NEU: Standardname
  private soundManager!: SoundManager; // ✨ NEU
  private nameLabel!: Phaser.GameObjects.BitmapText; // ✨ NEU: Label für den Namen
  private legalBtn!: Phaser.GameObjects.Text; // ✨ NEU: Legal Button

  // ✨ NEU: Scrolling Variablen
  private settingsButton!: Phaser.GameObjects.Image; // ✨ NEU: Settings Button
  private scrollY = 0;
  private maxScrollY = 0;
  private listMaskGraphics!: Phaser.GameObjects.Graphics;
  private upArrow!: Phaser.GameObjects.Image;
  private downArrow!: Phaser.GameObjects.Image;
  private itemHeight = 60; // ✨ NEU: Konstante Zeilenhöhe
  private visibleItems = 0; // ✨ NEU: Anzahl der sichtbaren Zeilen

  constructor() {
    super("LobbyScene");
  }

  preload() {
    // ✨ FIX: Load background image, as this is now the start scene
    this.load.image(
      "bg_temple",
      "assets/backgrounds/Copilot_Hintergrrund_Temple_ganz_neu.png",
    );
    // ✨ NEU: Assets für Buttons und Schriftart laden (da CardGameScene noch nicht lief)
    this.load.image(
      "button_parchment",
      "assets/ui/buttons/ChatGPT_Parchment_Button_dark_cracked_transp1_small.png",
    );
    this.load.bitmapFont(
      "fairydust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml",
    );
    // ✨ NEU: Spezifische Pfeile für Hoch/Runter laden
    this.load.image("arrow_up", "assets/ui/buttons/arrow-up_small.png");
    this.load.image("arrow_down", "assets/ui/buttons/arrow-down_small.png");
    // ✨ NEU: Settings Button laden (gleiches Asset wie im Spiel)
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png",
    );

    // ✨ NEU: Fehlende Assets für den SettingsDialog und UI-Sounds laden
    this.load.image("scroll_bg", "assets/ui/paper-8527340_optimised.png");
    this.load.image("chat_bg", "assets/ui/paper-548643_small_optimised.jpg"); // ✨ NEU: Chat-Hintergrund

    // Sounds für UI-Interaktionen
    this.load.audio(
      "ui_switch",
      "assets/sounds/effects/49053354-switch-2-307459.mp3",
    );
    this.load.audio("menu_select", "assets/sounds/effects/menu/select.mp3");
    this.load.audio("page_flip", "assets/sounds/effects/pageflip_01-81244.mp3");
  }

  create() {
    // 1. Background (dimmed) - Referenz speichern
    this.background = this.add
      .image(0, 0, "bg_temple")
      .setOrigin(0.5)
      .setAlpha(0.4);

    // 2. Titel
    this.titleText = this.add
      .bitmapText(0, 0, "fairydust", "Redemption Coliseum", 64)
      .setOrigin(0.5)
      .setTint(0xfff0a0) // ✨ NEU: Hellerer Goldton
      .setDropShadow(4, 4, 0x000000, 0.8); // ✨ NEU: Schlagschatten für Lesbarkeit

    this.subtitleText = this.add
      .bitmapText(0, 0, "fairydust", "Lobby", 32)
      .setOrigin(0.5)
      .setTint(0xcccccc)
      .setDropShadow(2, 2, 0x000000, 0.8);

    // 3. Status Text (Bottom)
    this.statusText = this.add
      .bitmapText(0, 0, "fairydust", "Connecting...", 24)
      .setOrigin(0.5)
      .setTint(0xaaaaaa)
      .setDropShadow(2, 2, 0x000000, 0.7);

    // ✨ NEU: Label für das Eingabefeld
    this.nameLabel = this.add
      .bitmapText(0, 0, "fairydust", "Your Name:", 24)
      .setOrigin(0.5)
      .setTint(0xdaa520); // Gold

    // ✨ NEU: HTML Input für Spielernamen
    // Wir nutzen ein einfaches HTML-Element, das über dem Canvas liegt.
    this.playerNameInput = this.add.dom(0, 0).createFromHTML(`
        <input type="text" name="playerName" value="Player 1" placeholder="Enter Name" 
               style="font-size: 24px; padding: 10px; width: 320px; text-align: center; 
                      border-radius: 8px; border: 2px solid #daa520; background-color: rgba(0, 0, 0, 0.5); 
                      color: #daa520; font-family: monospace; outline: none; text-shadow: 1px 1px 0 #000;">
    `);
    this.playerNameInput.addListener("input");
    this.playerNameInput.on("input", (event: any) => {
      this.playerName = event.target.value;
    });
    // Zufälligen Namen generieren
    const rndName = `Hero ${Phaser.Math.Between(100, 999)}`;
    (
      this.playerNameInput.getChildByName("playerName") as HTMLInputElement
    ).value = rndName;
    this.playerName = rndName;

    // 4. "Create Game" Button
    this.createBtn = this.createButton(
      0,
      0,
      "Create New Game",
      () => this.createGame(),
      350,
      60, // ✨ NEU: Breite/Höhe übergeben
    );
    this.add.existing(this.createBtn);

    // ✨ NEU: "Select Deck" Button (unter Create Game)
    this.deckSelectBtn = this.createButton(
      0,
      0,
      "Select Deck (Random)", // Initialer Text
      () => this.openDeckSelection(),
      350,
      50,
    );
    this.add.existing(this.deckSelectBtn);

    // ✨ FIX: "Load Game" Button muss in create() erstellt werden, nicht in resize().
    // Sonst wird er beim Szenen-Neustart nicht neu erstellt, da die Variable noch belegt ist.
    this.loadGameBtn = this.createButton(
      0,
      0,
      "Load Game",
      () => this.openLoadGameDialog(),
      350,
      50
    );
    this.add.existing(this.loadGameBtn);

    // ✨ NEU: Prüfe auf aktive Sitzung und zeige ggf. Reconnect-Button
    this.checkActiveSession();

    // 5. Container for room list
    this.listContainer = this.add.container(0, 0);

    // ✨ NEU: Maske für die Liste erstellen
    this.listMaskGraphics = this.add.graphics().setVisible(false);
    const mask = this.listMaskGraphics.createGeometryMask();
    this.listContainer.setMask(mask);

    // ✨ NEU: Scroll-Pfeile erstellen (initial unsichtbar)
    this.upArrow = this.add
      .image(0, 0, "arrow_up")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.downArrow = this.add
      .image(0, 0, "arrow_down")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    // Scroll-Events
    this.upArrow.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.scrollList(100);
    });
    this.downArrow.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.scrollList(-100);
    });

    // Mausrad-Support
    this.input.on(
      "wheel",
      (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
        // Nur scrollen, wenn wir über der Liste sind (grob)
        if (pointer.y > this.listContainer.y && pointer.y < this.statusText.y) {
          this.scrollList(-deltaY * 0.5); // Scroll-Geschwindigkeit anpassen
        }
      },
    );

    // ✨ NEU: Settings Button (Oben Rechts, versteckt)
    this.settingsButton = this.add
      .image(0, 0, "button_settings")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6);

    // Hover-Effekt (Hineingleiten)
    this.settingsButton.on("pointerover", () => {
      this.tweens.add({
        targets: this.settingsButton,
        x: this.scale.width - 24, // Sichtbar
        duration: 200,
        ease: "Sine.easeOut",
      });
    });
    this.settingsButton.on("pointerout", () => {
      this.tweens.add({
        targets: this.settingsButton,
        x: this.scale.width + 12, // Versteckt
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    this.settingsButton.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.scene.pause(); // Lobby pausieren
      this.scene.launch("SettingsDialogScene", { parentScene: "LobbyScene" }); // Dialog öffnen
    });

    // ✨ NEU: Legal / Impressum Link (Unten Links, dezent)
    this.legalBtn = this.add.text(10, this.scale.height - 10, "Legal / Impressum", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#666666"
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true });
    
    this.legalBtn.on('pointerdown', () => {
        // Hier deine URL einfügen (z.B. Link zu Google Doc oder Unterseite)
        window.open("https://deine-impressum-url.com", "_blank");
    });

    // 6. Initialize Colyseus Client
    // We use the same logic as connectToRoom to determine the endpoint
    const protocol = window.location.protocol.replace("http", "ws");
    const port = window.location.port ? `:${window.location.port}` : "";
    // In Dev-Mode port is often 2567 for the server, in Prod-Mode it is the same port

    // ✨ FIX: Robustere Port-Erkennung.
    // Wenn wir lokal sind (localhost/127.0.0.1) ODER den Vite-Port (5173) nutzen,
    // gehen wir davon aus, dass der Server auf 2567 läuft.
    let serverPort = port;
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      port === ":5173"
    ) {
      serverPort = ":2567";
    }

    // ✨ FIX: Produktions-URL Logik
    // Wenn wir auf Vercel sind (oder einer anderen Domain), nutzen wir die Render-URL.
    // Du musst diese URL anpassen, sobald du deinen Render-Server hast!
    if (window.location.hostname.includes("vercel.app")) {
        this.endpoint = "wss://redemption-coliseum-server.onrender.com"; // BEISPIEL! Anpassen!
    } else {
    this.endpoint = `${protocol}//${window.location.hostname}${serverPort}`;
    }

    this.httpEndpoint = this.endpoint
      .replace("wss", "https")
      .replace("ws", "http");

    // ✨ NEU: Musik-Logik
    this.soundManager = this.registry.get("soundManager");

    log("Lobby", "Connecting to Colyseus at", this.endpoint);
    this.client = new Client(this.endpoint);

    // 7. Connect to Lobby Room (WebSocket)
    this.connectToLobby();

    // ✨ NEU: Debug-Anzeige der Server-URL unten rechts
    this.debugText = this.add
      .text(0, 0, `WS: ${this.endpoint}\nHTTP: ${this.httpEndpoint}`, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#666666",
      })
      .setOrigin(1, 1);

    // ✨ NEU: Resize-Handler registrieren und initial aufrufen
    this.scale.on("resize", this.resize, this);
    this.resize({ width: this.scale.width, height: this.scale.height });
  }

  /**
   * ✨ NEU: Passt alle Elemente an die neue Fenstergröße an.
   */
  resize(gameSize: { width: number; height: number }) {
    const { width, height } = gameSize;

    // 1. Hintergrund (Cover Mode: Füllt den Bildschirm, behält Ratio)
    if (this.background) {
      const scaleX = width / this.background.width;
      const scaleY = height / this.background.height;
      const scale = Math.max(scaleX, scaleY);
      this.background.setScale(scale).setPosition(width / 2, height / 2);
    }

    // 2. Titel & Untertitel (Position & Größe dynamisch)
    if (this.titleText) {
      this.titleText.setPosition(width / 2, height * 0.1); // 10% von oben
      // Schriftgröße basierend auf Höhe, aber mit Min/Max-Grenzen
      const fontSize = Math.max(32, Math.min(80, height * 0.1)); // ✨ FIX: Etwas größer erlaubt
      this.titleText.setFontSize(fontSize);
    }

    if (this.subtitleText) {
      this.subtitleText.setPosition(width / 2, height * 0.18); // 18% von oben
      const fontSize = Math.max(20, Math.min(40, height * 0.05));
      this.subtitleText.setFontSize(fontSize);
    }

    // 3. Inputs & Buttons
    const baseInputY = height * 0.28;
    let currentButtonY = baseInputY + 80; // ✨ FIX: Startposition für Buttons (unter Input)

    if (this.playerNameInput) {
      this.playerNameInput.setPosition(width / 2, baseInputY); // Input oben
      if (this.nameLabel) {
        this.nameLabel.setPosition(width / 2, baseInputY - 40); // Label darüber
      }
    }

    // ✨ FIX: Reconnect Button zuerst prüfen und platzieren (dynamisches Stacking)
    if (this.reconnectBtn && this.reconnectBtn.visible) {
      this.reconnectBtn.setPosition(width / 2, currentButtonY);
      currentButtonY += 70; // Platz für den nächsten Button schaffen
    }

    if (this.createBtn) {
      this.createBtn.setPosition(width / 2, currentButtonY);
      currentButtonY += 70;

      // ✨ NEU: Deck Button direkt darunter
      this.deckSelectBtn.setPosition(width / 2, currentButtonY);
      currentButtonY += 80; // Puffer zur Liste
    }

    // ✨ NEU: Load Game Button (unter Deck Select)
    if (this.loadGameBtn) {
        this.loadGameBtn.setPosition(width / 2, currentButtonY);
        currentButtonY += 80;
    }

    // 4. Liste
    if (this.listContainer) {
      // ✨ FIX: Positioniere die Liste relativ zum untersten Button (Deck Select),
      // damit sie diesen niemals überdeckt.
      // Wir nutzen currentButtonY, das jetzt dynamisch berechnet wurde.
      const listY = Math.max(height * 0.55, currentButtonY);
      this.listContainer.setPosition(width / 2, listY);

      // ✨ FIX: Dynamische Berechnung der sichtbaren Zeilen
      // Wir berechnen, wie viel Platz bis unten ist und runden auf ganze Zeilen ab.
      const bottomMargin = 80; // Platz für Status-Text und Puffer
      const availableHeight = height - listY - bottomMargin;

      // Mindestens 1 Zeile, sonst so viele wie ganz reinpassen
      this.visibleItems = Math.max(
        1,
        Math.floor(availableHeight / this.itemHeight),
      );
      const maskHeight = this.visibleItems * this.itemHeight;
      const maskWidth = 500; // Etwas breiter als die Buttons (450)

      this.listMaskGraphics.clear();
      this.listMaskGraphics.fillStyle(0xffffff);
      this.listMaskGraphics.fillRect(
        width / 2 - maskWidth / 2,
        listY, // Startet exakt bei der Container-Position
        maskWidth,
        maskHeight,
      );

      // Pfeile positionieren (rechts neben der Liste)
      // Zentriert zur ersten und letzten sichtbaren Zeile
      this.upArrow.setPosition(width / 2 + 280, listY + this.itemHeight / 2);
      this.downArrow.setPosition(
        width / 2 + 280,
        listY + maskHeight - this.itemHeight / 2,
      );

      // Scroll-Grenzen aktualisieren, da sich die sichtbare Höhe geändert hat
      if (this.rooms.length > 0) {
        this.updateScrollLimits();
      }
    }

    // 5. Status Text (Unten)
    if (this.statusText) {
      this.statusText.setPosition(width / 2, height - 40);
    }

    // 6. Debug Text (Unten Rechts)
    if (this.debugText) {
      this.debugText.setPosition(width - 10, height - 10);
    }

    // 8. Legal Button
    if (this.legalBtn) {
        this.legalBtn.setPosition(10, height - 10);
    }

    // 7. Settings Button (Position analog zu GameUI)
    if (this.settingsButton) {
      // Berechnung analog zu layout.ts (ca. 18% von oben)
      // GameUI: opponentHand.y + opponentHand.height + standardLoBHeight / 2
      // Vereinfacht für Lobby:
      const y = height * 0.18;
      this.settingsButton.setPosition(width + 12, y); // Initial versteckt (rechts)
    }
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
    width: number = 300, // ✨ NEU: Standardbreite
    height: number = 50, // ✨ NEU: Standardhöhe
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // ✨ NEU: Pergament-Hintergrund statt Rechteck
    const bg = this.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(width, height);
    bg.setName("bg"); // ✨ NEU: Name für Zugriff

    // ✨ NEU: BitmapText mit Pergament-Stil (Cremefarben + Schatten)
    const fontSize = Math.min(28, height * 0.6);
    const yOffset = fontSize * -0.25; // Zentrierung für BitmapFont
    const text = this.add
      .bitmapText(0, yOffset, "fairydust", label, fontSize)
      .setOrigin(0.5)
      .setTint(0xf4f6e1)
      .setDropShadow(2, 2, 0x000000, 0.7);
    text.setName("text"); // ✨ NEU: Name für Zugriff

    container.add([bg, text]);
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });

    // ✨ NEU: Speichere den Standard-Tint (Weiß), damit wir ihn ändern können (z.B. Grün für Reconnect)
    container.setData("defaultTint", 0xffffff);

    // ✨ NEU: Hover-Effekt (Tint auf Hintergrund)
    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());
    container.on("pointerout", () =>
      bg.setTint(container.getData("defaultTint")),
    ); // ✨ FIX: Nutze gespeicherten Tint

    container.on("pointerdown", () => {
      log("UI", `Button '${label}' clicked.`); // ✨ FIX: Use central logger
      this.soundManager.playSound("UI_TOGGLE");
      callback();
    });

    return container;
  }

  async connectToLobby() {
    try {
      this.statusText.setText("Joining Lobby...");

      // ✨ FIX: Verbinde mit dem dedizierten Lobby-Raum statt HTTP-Polling
      this.lobbyRoom = await this.client.joinOrCreate("lobby");

      log("Lobby", "Joined Lobby Room successfully.");
      this.statusText.setText("Ready");

      // Lausche auf Updates vom Server (gesendet von LobbyRoom.js)
      this.lobbyRoom.onMessage("rooms", (rooms: RoomAvailable[]) => {
        log("Lobby", "Received room list update:", rooms);
        this.rooms = rooms;
        this.updateList();
      });

      // ✨ NEU: Musik-Handler für die Lobby (Server-gesteuert)
      this.lobbyRoom.onMessage(
        "playMusic",
        (message: { path: string; name: string }) => {
          if (this.soundManager) {
            this.soundManager.playMusicTrack(message.path, message.name, () => {
              this.lobbyRoom?.send("requestMusic"); // Wenn fertig, nächstes anfordern
            });
          }
        },
      );

      // ✨ NEU: Musik anfordern, sobald wir verbunden sind
      this.lobbyRoom.send("requestMusic");
    } catch (e: any) {
      error("Lobby", e); // ✨ FIX: Nur loggen wenn DEBUG=true
      this.statusText.setText("Lobby Error: " + e.message);
      // Retry logic könnte hier hin
    }
  }

  updateList() {
    this.listContainer.removeAll(true);
    this.scrollY = 0; // Reset Scroll bei Update

    if (this.rooms.length === 0) {
      const noRoomsText = this.add
        .text(0, 50, "No open games found.", {
          fontSize: "20px",
          color: "#888888",
        })
        .setOrigin(0.5);
      this.listContainer.add(noRoomsText);
      return;
    }

    this.rooms.forEach((room, index) => {
      // ✨ FIX: Button vertikal in der Zeile zentrieren.
      // Zeile geht von index*60 bis (index+1)*60. Mitte ist +30.
      const y = index * this.itemHeight + this.itemHeight / 2;
      // ✨ NEU: Nutze den Raumnamen aus den Metadaten, falls vorhanden
      const roomName = room.metadata?.name || `Game ${index + 1}`;
      const label = `${roomName} (${room.clients}/${room.maxClients})`;

      // ✨ FIX: Button-Referenz für Callback verfügbar machen
      let btn: Phaser.GameObjects.Container;

      btn = this.createButton(
        0,
        y,
        label,
        () => this.joinGame(room.roomId, btn), // ✨ NEU: Button übergeben
        450,
        50, // ✨ NEU: Breite/Höhe für Listen-Buttons
      );

      this.listContainer.add(btn);
    });

    this.updateScrollLimits();
  }

  // ✨ NEU: Berechnet die Scroll-Grenzen basierend auf Inhalt und sichtbarem Bereich
  updateScrollLimits() {
    const totalHeight = this.rooms.length * this.itemHeight;
    const visibleHeight = this.visibleItems * this.itemHeight;

    // Max Scroll ist negativ (wir schieben den Inhalt nach oben)
    // Wenn Inhalt kleiner als Sichtbereich -> 0
    this.maxScrollY = Math.min(0, visibleHeight - totalHeight);

    this.updateScrollVisuals();
  }

  // ✨ NEU: Scroll-Logik
  scrollList(delta: number) {
    const newY = Phaser.Math.Clamp(this.scrollY + delta, this.maxScrollY, 0);
    this.scrollY = newY;
    this.updateScrollVisuals();
  }

  updateScrollVisuals() {
    // Container-Inhalt verschieben (nicht den Container selbst, sondern die Kinder)
    // Da das mühsam ist, verschieben wir den Container Y, aber passen die Maske an?
    // Nein, einfacher: Wir nutzen y des Containers als Basis und addieren scrollY.
    // Aber die Maske ist fix.
    // Trick: Wir lassen listContainer fix und bewegen die Kinder darin?
    // Oder wir nutzen einen Wrapper. Da wir listContainer.removeAll machen, ist es einfach:
    this.listContainer.each((child: any) => {
      // Wir müssten die ursprüngliche Y-Position kennen.
      // Da wir das nicht speichern, berechnen wir es neu oder nutzen einen Offset-Container.
      // Einfachste Lösung: Wir setzen y basierend auf Index neu.
      // Aber wir haben keine Referenz auf den Index im Child.
      // Besser: Wir setzen listContainer.y NICHT um, sondern nutzen einen Tween oder setzen y der Kinder.
    });

    // KORREKTUR: Wir bauen updateList so um, dass es scrollY berücksichtigt.
    // Aber das ist ineffizient bei jedem Scroll.
    // BESSER: Wir nutzen einen 'innerContainer' im 'listContainer'.
    // Da das jetzt zu viel Umbau wäre, machen wir es simpel:
    // Wir iterieren über die Kinder und setzen y = initialY + scrollY.

    let index = 0;
    this.listContainer.each((child: Phaser.GameObjects.Container) => {
      // Wir gehen davon aus, dass die Reihenfolge stimmt (was bei add() der Fall ist)
      // und dass nur Buttons drin sind.
      if (child instanceof Phaser.GameObjects.Container) {
        // Basis-Y (Zentriert in Zeile) + Scroll-Offset
        child.y = index * this.itemHeight + this.itemHeight / 2 + this.scrollY;
        index++;
      }
    });

    // Pfeile anzeigen/ausblenden
    this.upArrow.setVisible(this.scrollY < 0); // Zeigen wenn wir runtergescrollt haben
    this.downArrow.setVisible(this.scrollY > this.maxScrollY); // Zeigen wenn noch mehr unten ist
  }

  // ✨ NEU: Öffnet den nativen Datei-Dialog des Browsers
  openDeckSelection() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.json"; // Erlaubte Formate
    input.style.display = "none";

    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          try {
            this.selectedDeck = DeckUtils.parseDeck(content, file.name);
            const totalCards =
              this.selectedDeck.main.length + this.selectedDeck.reserve.length;
            this.updateDeckButtonText(file.name, totalCards);
            this.selectedDeck.name = file.name.replace(/\.[^/.]+$/, "");
          } catch (err: any) {
            log("Lobby", "Error parsing deck:", err);
            // ✨ FIX: Zeige die echte Fehlermeldung an, um das Problem zu verstehen
            this.statusText.setText("Error: " + (err?.message || "Invalid Deck File"));
          }
        }
      };
      reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  // ✨ NEU: Öffnet Dialog zum Laden eines Spielstands
  openLoadGameDialog() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none";

      input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (event) => {
              const content = event.target?.result as string;
              if (content) {
                  try {
                      const savedState = JSON.parse(content);
                      this.createGame(savedState); // Übergebe den State an createGame
                  } catch (err) {
                      log("Lobby", "Error parsing save file:", err);
                      this.statusText.setText("Invalid Save File");
                  }
              }
          };
          reader.readAsText(file);
      };

      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
  }

  // ✨ NEU: Aktualisiert den Text des Deck-Buttons
  updateDeckButtonText(filename: string, count: number) {
    const textObj = this.deckSelectBtn.getByName(
      "text",
    ) as Phaser.GameObjects.BitmapText;
    // Dateinamen kürzen falls zu lang
    const shortName =
      filename.length > 15 ? filename.substring(0, 12) + "..." : filename;
    textObj.setText(`Deck: ${shortName} (${count})`);
  }

  // ✨ NEU: Prüft, ob eine Sitzung im LocalStorage gespeichert ist
  checkActiveSession() {
    const reconnectionToken = localStorage.getItem("reconnectionToken");

    console.log("[Lobby] Checking for active session:", { reconnectionToken }); // ✨ DEBUG
    if (reconnectionToken) {
      log("Lobby", "Found active session token.");

      this.reconnectBtn = this.createButton(
        0,
        0, // Position wird in resize gesetzt
        "Reconnect to Game",
        () => this.reconnectToGame(reconnectionToken),
        350,
        60,
      );
      (this.reconnectBtn.getByName("bg") as Phaser.GameObjects.Image)?.setTint(
        0xccffcc,
      ); // ✨ FIX: Cast zu Image für setTint
      // ✨ FIX: Setze den Standard-Tint auf Grün, damit er nach Hover erhalten bleibt
      this.reconnectBtn.setData("defaultTint", 0xccffcc);
      (this.reconnectBtn.getByName("bg") as Phaser.GameObjects.Image)?.setTint(
        0xccffcc,
      );

      // ✨ NEU: "X" Button zum Verwerfen der Sitzung
      // Wir platzieren ihn rechts neben dem Button (Button-Breite ist 350, also reicht 200 vom Zentrum)
      const dismissBtn = this.add
        .text(200, 0, "✖", {
          fontSize: "28px",
          color: "#ff4444",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      // Hover-Effekt für das X
      dismissBtn.on("pointerover", () => dismissBtn.setScale(1.2));
      dismissBtn.on("pointerout", () => dismissBtn.setScale(1.0));

      dismissBtn.on("pointerdown", () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.clearSession();
      });

      this.reconnectBtn.add(dismissBtn);
      this.add.existing(this.reconnectBtn);
    }
  }

  // ✨ NEU: Hilfsmethode zum Löschen der Sitzung und Aktualisieren der UI
  clearSession() {
    log("Lobby", "Clearing session data.");
    localStorage.removeItem("reconnectionToken"); // ✨ FIX: Token entfernen
    this.reconnectBtn.setVisible(false);
    // Layout aktualisieren, damit die anderen Buttons nach oben rutschen
    this.resize({ width: this.scale.width, height: this.scale.height });
  }

  // ✨ NEU: Versucht, die Verbindung wiederherzustellen
  async reconnectToGame(reconnectionToken: string) {
    console.log("[Lobby] reconnectToGame triggered", { reconnectionToken }); // ✨ DEBUG
    log(
      "Lobby",
      `Attempting to reconnect with token.`,
    ); // ✨ FIX: Use central logger
    this.statusText.setText("Reconnecting...");

    if (!this.client) {
      console.error("[Lobby] Client not initialized"); // ✨ DEBUG
      error("Lobby", "Client is not initialized!"); // ✨ FIX: Use central logger
      this.statusText.setText("Client Error");
      return;
    }

    try {
      console.log("[Lobby] Calling client.reconnect..."); // ✨ DEBUG
      // ✨ FIX: Cast zu any, um Typkonflikte mit SchemaConstructor zu vermeiden
      const room = await (this.client as any).reconnect(reconnectionToken);
      console.log("[Lobby] Reconnect successful", room); // ✨ DEBUG
      log("Lobby", "Reconnected successfully!", room); // ✨ FIX: Use central logger
      this.startGame(room as TypedRoom);
    } catch (e: any) {
      console.error("[Lobby] Reconnect failed:", e.message); // ✨ DEBUG: Nur die Nachricht loggen
      error("Lobby", "Reconnection failed:", e); // ✨ FIX: Use central logger
      this.statusText.setText("Session expired.");
      this.clearSession(); // ✨ FIX: Nutze die zentrale Methode
    }
  }

  async createGame(savedState?: any) { // ✨ NEU: Optionaler Parameter
    // ✨ NEU: Visuelles Feedback beim Erstellen
    const btn = this.createBtn;
    const text = btn.getByName("text") as Phaser.GameObjects.BitmapText;
    const bg = btn.getByName("bg") as Phaser.GameObjects.Image;
    const originalLabel = text.text;

    // Button deaktivieren
    btn.disableInteractive();
    text.setText("Creating...");
    bg.setTint(0x888888); // Ausgrauen
    this.statusText.setText("Creating game...");

    try {
      // ✨ NEU: Übergebe Optionen beim Erstellen
      // Hier könnten wir später auch das gewählte Deck übergeben: { deck: myDeckList }
      const roomOptions = {
        roomName: `${this.playerName}'s Game`, // ✨ NEU: Raumname basiert auf Spielername
        deck: this.selectedDeck, // ✨ NEU: Übergabe des gewählten Decks
        playerName: this.playerName, // ✨ NEU
        deckName: this.selectedDeck.name || "Random Deck", // ✨ FIX: 'as any' ist nicht mehr nötig
        savedState: savedState // ✨ NEU: Übergebe Savegame
      };

      const room = await this.client.create("game_room", roomOptions);
      this.startGame(room as TypedRoom);
    } catch (e: any) {
      this.statusText.setText("Error creating game: " + e.message);

      // Button wiederherstellen bei Fehler
      btn.setInteractive({ useHandCursor: true });
      text.setText(originalLabel);
      bg.clearTint();

      // Hover-Effekte müssen neu gebunden werden, da disableInteractive sie entfernt
      btn.off("pointerover");
      btn.off("pointerout");
      btn.on("pointerover", () => bg.setTint(0xdddddd));
      btn.on("pointerout", () => bg.clearTint());
    }
  }

  async joinGame(roomId: string, btn: Phaser.GameObjects.Container) {
    // ✨ NEU: Visuelles Feedback für Join-Button (wie bei Create)
    const text = btn.getByName("text") as Phaser.GameObjects.BitmapText;
    const bg = btn.getByName("bg") as Phaser.GameObjects.Image;
    const originalLabel = text.text;

    btn.disableInteractive();
    text.setText("Joining...");
    bg.setTint(0x888888);
    this.statusText.setText("Connecting...");

    try {
      // ✨ NEU: Auch beim Beitreten das eigene Deck senden
      const options = {
        deck: this.selectedDeck,
        playerName: this.playerName, // ✨ NEU
        deckName: this.selectedDeck.name || "Random Deck", // ✨ FIX: 'as any' ist nicht mehr nötig
      };
      const room = await this.client.joinById(roomId, options);
      this.startGame(room as TypedRoom);
    } catch (e: any) {
      this.statusText.setText("Error joining game: " + e.message);

      // Reset button state on error
      btn.setInteractive({ useHandCursor: true });
      text.setText(originalLabel);
      bg.clearTint();

      // Re-bind hover effects (lost on disableInteractive)
      btn.off("pointerover");
      btn.off("pointerout");
      btn.on("pointerover", () => bg.setTint(0xdddddd));
      btn.on("pointerout", () => bg.clearTint());
    }
  }

  startGame(room: TypedRoom) {
    // ✨ NEU: Sitzung speichern für Reconnect
    // ✨ FIX: Speichere den reconnectionToken statt roomId/sessionId
    localStorage.setItem("reconnectionToken", room.reconnectionToken);
    this.lobbyRoom?.leave(); // ✨ FIX: Lobby verlassen, wenn Spiel startet
    // ✨ NEU: Starte zuerst die Ladeszene, um Assets zu laden und Sync zu gewährleisten
    this.scene.start("GameLoadingScene", { room });
  }
}
