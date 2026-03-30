import Phaser from "phaser";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager"; // ✨ NEU
import { log, error, DEBUG } from "../utils/logger";
import { SettingsDialogScene } from "./SettingsDialogScene"; // ✨ FIX: Import missing scene
import { DeckUtils, type DeckData } from "../utils/DeckUtils"; // ✨ NEU: Import
import { LobbyUIManager } from "../ui/managers/LobbyUIManager";
import { LobbyDataManager } from "../ui/managers/LobbyDataManager";
import { LobbyNetworkManager } from "../network/LobbyNetworkManager";

export class LobbyScene extends Phaser.Scene {
  private uiManager!: LobbyUIManager;
  private networkManager!: LobbyNetworkManager;
  private dataManager!: LobbyDataManager;
  private soundManager!: SoundManager; // ✨ NEU

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
    // ✨ NEU: Help Button
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png",
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
    if (!this.scene.get("SettingsDialogScene")) {
      this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
    }

    this.soundManager = this.registry.get("soundManager");
    this.uiManager = new LobbyUIManager(this, this.soundManager);
    this.networkManager = new LobbyNetworkManager(this);
    this.dataManager = new LobbyDataManager();

    this.uiManager.create();
    const nameInput = this.uiManager.playerNameInput.getChildByName(
      "playerName",
    ) as HTMLInputElement;
    if (nameInput) nameInput.value = this.dataManager.playerName;

    // Debug Infos setzen
    this.uiManager.debugText.setText(
      `WS: ${this.networkManager.endpoint}\nHTTP: ${this.networkManager.httpEndpoint}`,
    );

    this.uiManager.createButtons({
      onCreate: () => this.createGame(),
      onSelectDeck: () => this.openDeckSelection(),
      onLoad: () => this.openLoadGameDialog(),
      onReconnect: () =>
        this.reconnectToGame(localStorage.getItem("reconnectionToken") || ""), // Token wird intern vom Manager validiert
      onClearSession: () => this.clearSession(),
    });

    // Callbacks für Network
    this.networkManager.onStatusChange = (status) =>
      this.uiManager.statusText.setText(status);
    this.networkManager.onRoomsUpdated = (rooms) =>
      this.uiManager.updateRoomList(rooms, (id, btn) => this.joinGame(id, btn));
    this.networkManager.onGameJoined = (room) => this.startGame(room);

    this.uiManager.helpButton.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.uiManager.toggleHelp();
    });

    // Musik-Logik verknüpfen (Delegation an NetworkManager)
    this.networkManager.onPlayMusic = (data) => {
      this.soundManager?.playMusicTrack(data.path, data.name, () => {
        this.networkManager.requestNextMusic();
      });
    };
    // Initialen Musik-Request senden
    this.networkManager.onMusicRequest = () =>
      this.networkManager.requestNextMusic();

    this.uiManager.settingsButton.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.scene.pause(); // Lobby pausieren
      this.scene.launch("SettingsDialogScene", { parentScene: "LobbyScene" }); // Dialog öffnen
    });

    this.uiManager.legalBtn.on("pointerdown", () => {
      window.open("/impressum.html", "_blank");
    });

    this.uiManager.privacyBtn.on("pointerdown", () => {
      window.open("/privacy.html", "_blank");
    });

    this.networkManager.connectToLobby();
    this.checkActiveSession();

    // ✨ NEU: Resize-Handler registrieren und initial aufrufen
    this.scale.on("resize", this.resize, this);

    // ✨ NEU: Aufräumen beim Beenden der Szene
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiManager.destroy();
    });
    this.resize({ width: this.scale.width, height: this.scale.height });
  }

  resize(gameSize: { width: number; height: number }) {
    this.uiManager?.resize(gameSize.width, gameSize.height);
  }

  openDeckSelection() {
    this.uiManager.openFileSelector(".txt,.json", (content, fileName) => {
      try {
        const deck = DeckUtils.parseDeck(content, fileName);
        this.dataManager.selectedDeck = deck;
        const totalCards = deck.main.length + deck.reserve.length;
        this.uiManager.updateDeckButtonText(fileName, totalCards);
        this.dataManager.selectedDeck.name = fileName.replace(/\.[^/.]+$/, "");
      } catch (err: any) {
        log("Lobby", "Error parsing deck:", err);
        this.uiManager.statusText.setText(
          "Error: " + (err?.message || "Invalid Deck File"),
        );
      }
    });
  }

  openLoadGameDialog() {
    this.uiManager.openFileSelector(".json", (content) => {
      try {
        this.createGame(JSON.parse(content));
      } catch (err) {
        log("Lobby", "Error parsing save file:", err);
        this.uiManager.statusText.setText("Invalid Save File");
      }
    });
  }

  checkActiveSession() {
    this.uiManager.reconnectBtn?.setVisible(this.networkManager.hasActiveSession());
  }

  clearSession() {
    this.networkManager.clearSession();
    this.uiManager.reconnectBtn?.setVisible(false);
    this.resize({ width: this.scale.width, height: this.scale.height });
  }

  async reconnectToGame(reconnectionToken: string) {
    this.uiManager.statusText.setText("Reconnecting...");
    try {
      await this.networkManager.reconnectToGame(reconnectionToken);
    } catch (e: any) {
      this.uiManager.statusText.setText("Session expired.");
      this.clearSession();
    }
  }

  async createGame(savedState?: any) {
    const nameInput = this.uiManager.playerNameInput.getChildByName(
      "playerName",
    ) as HTMLInputElement;
    this.dataManager.updateNameFromInput(nameInput);
    this.uiManager.statusText.setText("Creating game...");
    try {
      await this.networkManager.createGame({
        playerName: this.dataManager.playerName,
        deck: this.dataManager.selectedDeck,
        savedState,
      });
    } catch (e: any) {
      this.uiManager.statusText.setText("Error: " + e.message);
    }
  }

  async joinGame(roomId: string, btn: Phaser.GameObjects.Container) {
    const nameInput = this.uiManager.playerNameInput.getChildByName(
      "playerName",
    ) as HTMLInputElement;
    this.dataManager.updateNameFromInput(nameInput);
    this.uiManager.statusText.setText("Connecting...");
    try {
      await this.networkManager.joinGame(roomId, {
        playerName: this.dataManager.playerName,
        deck: this.dataManager.selectedDeck,
      });
    } catch (e: any) {
      this.uiManager.statusText.setText("Join Error: " + e.message);
    }
  }

  startGame(room: TypedRoom) {
    this.scene.start("GameLoadingScene", { room });
  }
}
