import Phaser from "phaser";
import { LobbyUIManager } from "../managers/LobbyUIManager";
import { LobbyDomManager } from "../managers/LobbyDomManager";
import { SoundManager } from "../../managers/SoundManager";
import { LobbyNetworkManager } from "../../network/LobbyNetworkManager";
import { LobbyDataManager } from "../managers/LobbyDataManager";
import { DeckUtils } from "../../utils/DeckUtils";
import { log } from "../../utils/logger";

/**
 * Handles all user interactions in the LobbyScene.
 */
export class LobbyInputHandler {
  private scene: Phaser.Scene;
  private uiManager: LobbyUIManager;
  private domManager: LobbyDomManager;
  private soundManager: SoundManager;
  private networkManager: LobbyNetworkManager;
  private dataManager: LobbyDataManager;

  constructor(
    scene: Phaser.Scene,
    uiManager: LobbyUIManager,
    domManager: LobbyDomManager,
    soundManager: SoundManager,
    networkManager: LobbyNetworkManager,
    dataManager: LobbyDataManager
  ) {
    this.scene = scene;
    this.uiManager = uiManager;
    this.domManager = domManager;
    this.soundManager = soundManager;
    this.networkManager = networkManager;
    this.dataManager = dataManager;
  }

  /**
   * Registers listeners for static UI elements.
   */
  public registerHandlers() {
    // Scroll Logic
    this.uiManager.upArrow.on("pointerdown", () => this.uiManager.scrollList(100));
    this.uiManager.downArrow.on("pointerdown", () => this.uiManager.scrollList(-100));
    
    this.scene.input.on("wheel", this.handleWheel, this);

    // Side Button Hover Tweens are now handled internally by SidebarButton
    // Click logic is also passed in the constructor of SidebarButton in LobbyUIManager
    this.scene.events.on("help_button_clicked", () => {
      this.domManager.toggleHelp();
    });

    this.uiManager.legalBtn.on("pointerdown", () => {
      window.open("/impressum.html", "_blank");
    });

    this.uiManager.privacyBtn.on("pointerdown", () => {
      window.open("/privacy.html", "_blank");
    });

    // Main Menu Actions
    this.uiManager.createButtons({
      onCreate: () => this.handleCreateGame(),
      onSelectDeck: () => this.handleDeckSelection(),
      onLoad: () => this.handleLoadGame(),
      onReconnect: () => this.handleReconnect(),
      onClearSession: () => this.handleClearSession(),
    });
  }

  public checkActiveSession() {
    this.uiManager.reconnectBtn?.setVisible(
      this.networkManager.hasActiveSession()
    );
  }

  private async handleCreateGame(savedState?: any) {
    try {
      const name = this.domManager.getPlayerName();
      if (name) this.dataManager.playerName = name;

      this.uiManager.lockAllButtons();
      this.uiManager.statusText.setText("Creating game...");

      await this.networkManager.createGame({
        playerName: this.dataManager.playerName,
        deck: this.dataManager.selectedDeck,
        savedState,
      });
    } catch (e: any) {
      this.uiManager.statusText.setText("Error: " + e.message);
      this.uiManager.unlockInput();
      this.networkManager.resetTransition();
    }
  }

  private handleDeckSelection() {
    this.domManager.openFileSelector(".txt,.json", (content, fileName) => {
      try {
        const deck = DeckUtils.parseDeck(content, fileName);
        this.dataManager.selectedDeck = deck;
        const mainCount = deck.main.length;
        const reserveCount = deck.reserve.length;
        const totalCards = mainCount + reserveCount;
        const cleanName = fileName.replace(/\.(json|dek|txt)$/i, "");
        this.dataManager.selectedDeck.name = cleanName;
        this.uiManager.updateDeckButtonText(cleanName, totalCards, mainCount, reserveCount);
      } catch (err: any) {
        log("Lobby", "Error parsing deck:", err);
        this.uiManager.statusText.setText(`Selection Failed: ${err?.message || "Invalid File"}`);
      }
    });
  }

  private handleLoadGame() {
    this.domManager.openFileSelector(".json", (content) => {
      try {
        this.handleCreateGame(JSON.parse(content));
      } catch (err) {
        log("Lobby", "Error parsing save file:", err);
        this.uiManager.statusText.setText("Invalid Save File");
      }
    });
  }

  private async handleReconnect() {
    const token = localStorage.getItem("reconnectionToken");
    if (!token) return;

    this.uiManager.statusText.setText("Reconnecting...");
    try {
      await this.networkManager.reconnectToGame(token);
    } catch (e: any) {
      this.uiManager.statusText.setText("Reconnect not possible. Session expired.");
      this.uiManager.unlockInput();
      this.handleClearSession();
    }
  }

  private handleClearSession() {
    this.networkManager.clearSession();
    this.uiManager.reconnectBtn?.setVisible(false);
    (this.scene as any).resize({ width: this.scene.scale.width, height: this.scene.scale.height });
  }

  public async handleJoinGame(roomId: string) {
    const name = this.domManager.getPlayerName();
    if (name) this.dataManager.playerName = name;

    this.uiManager.lockAllButtons();
    this.uiManager.statusText.setText("Connecting...");

    try {
      await this.networkManager.joinGame(roomId, {
        playerName: this.dataManager.playerName,
        deck: this.dataManager.selectedDeck,
      });
    } catch (e: any) {
      this.uiManager.statusText.setText("Join Error: " + e.message);
      this.uiManager.unlockInput();
      this.networkManager.resetTransition();
    }
  }

  private handleWheel(pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) {
    if (pointer.y > this.uiManager.listContainer.y) {
      this.uiManager.scrollList(-deltaY * 0.5);
    }
  }

  /**
   * Cleans up global listeners.
   */
  public destroy() {
    this.scene.input.off("wheel", this.handleWheel, this);
    this.scene.events.off("help_button_clicked");
  }

  private playClick() {
    if (this.soundManager) {
      this.soundManager.playSound("UI_TOGGLE");
    }
  }
}