import Phaser from "phaser";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager"; // ✨ NEU
import { log, error, DEBUG } from "../utils/logger";
import { SettingsDialogScene } from "./SettingsDialogScene"; // ✨ FIX: Import missing scene
import { DeckUtils, type DeckData } from "../utils/DeckUtils"; // ✨ NEU: Import
import { LobbyUIManager } from "../ui/managers/LobbyUIManager";
import { LobbyDataManager } from "../ui/managers/LobbyDataManager";
import { LobbyNetworkManager } from "../network/LobbyNetworkManager";
import { LobbyDomManager } from "../ui/managers/LobbyDomManager";
import { LobbyInputHandler } from "../ui/handlers/LobbyInputHandler";

export class LobbyScene extends Phaser.Scene {
  private uiManager!: LobbyUIManager;
  private networkManager!: LobbyNetworkManager;
  private dataManager!: LobbyDataManager;
  private domManager!: LobbyDomManager;
  private soundManager!: SoundManager; // ✨ NEU
  private inputHandler!: LobbyInputHandler;
  private initialDeckData?: DeckData;

  constructor() {
    super("LobbyScene");
  }

  init(data?: { deck?: DeckData }) {
    if (data && data.deck) {
      this.initialDeckData = data.deck;
    }
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
    this.domManager = new LobbyDomManager(this);
    this.networkManager = new LobbyNetworkManager(this);
    this.dataManager = new LobbyDataManager();

    this.inputHandler = new LobbyInputHandler(
      this,
      this.uiManager,
      this.domManager,
      this.soundManager,
      this.networkManager,
      this.dataManager
    );

    this.uiManager.create();
    this.domManager.createPlayerNameInput(this.scale.width / 2, this.scale.height * 0.28, this.dataManager.playerName);

    // Debug Infos setzen
    this.uiManager.debugText.setText(
      `WS: ${this.networkManager.endpoint}\nHTTP: ${this.networkManager.httpEndpoint}`,
    );

    // Callbacks für Network
    this.networkManager.onStatusChange = (status) =>
      this.uiManager.statusText.setText(status);
    this.networkManager.onRoomsUpdated = (rooms) =>
      this.uiManager.updateRoomList(rooms, (id) => this.inputHandler.handleJoinGame(id));
    this.networkManager.onGameJoined = (room) => this.startGame(room);

    // Musik über globalen SoundManager starten (zufällige Playlist vom Server)
    this.soundManager?.startBackgroundMusic();

    this.inputHandler.registerHandlers();

    if (this.initialDeckData) {
      this.dataManager.selectedDeck = this.initialDeckData;
      const totalCards = this.initialDeckData.main.length + this.initialDeckData.reserve.length;
      const deckName = this.initialDeckData.name || "Edited Deck";
      this.uiManager.updateDeckButtonText(deckName, totalCards);
    }

    this.networkManager.connectToLobby();
    this.inputHandler.checkActiveSession();

    // ✨ NEU: Resize-Handler registrieren und initial aufrufen
    this.scale.on("resize", this.resize, this);

    // ✨ NEU: Aufräumen beim Beenden der Szene
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiManager.destroy();
      this.domManager.destroy();
      this.inputHandler.destroy(); // ✨ NEU: InputHandler aufräumen
    });
    this.resize({ width: this.scale.width, height: this.scale.height });
  }

  resize(gameSize: { width: number; height: number }) {
    this.uiManager?.resize(gameSize.width, gameSize.height);
    const uiScale = Math.min(1, gameSize.height / 800);
    
    // 2-Spalten Layout NUR für flache Bildschirme (Handy im Querformat)
    let inputX = gameSize.width / 2;
    let nameY = gameSize.height * 0.35;

    if (gameSize.width > gameSize.height && gameSize.height <= 600) {
        // In 2-column mode, we moved nameY up
        nameY = gameSize.height * 0.28;
        // Inputfeld etwas nach oben schieben (damit es mit dem BitmapText-Label auf einer visuellen Linie liegt)
        nameY -= 5 * uiScale;
        
        // Input linksbündig mit etwas Abstand zur Mitte platzieren
        // Mitte + 15px Abstand + halbe Input-Breite (160px) -> 175
        inputX = (gameSize.width / 2) + 175 * uiScale;
    }
    
    this.domManager?.setInputPosition(inputX, nameY);
    if (this.domManager?.playerNameInput) {
        this.domManager.playerNameInput.setScale(uiScale);
    }
  }

  startGame(room: TypedRoom) {
    this.scene.start("GameLoadingScene", {
      targetScene: "CardGame",
      targetData: { room },
      backgroundKey: "bg_temple"
    });
  }
}
