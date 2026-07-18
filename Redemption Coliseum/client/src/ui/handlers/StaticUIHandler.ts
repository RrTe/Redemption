import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type ElementManager } from "../managers/ElementManager.js";
import { type DomUIManager } from "../managers/GameDomManager.js"; // ✨ NEU
import { log } from "../../utils/logger.js";

/**
 * Handles interactions for global UI buttons (Settings, Save, Help, Concede).
 */
export class StaticUIHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private elementManager: ElementManager;
  private domUIManager: DomUIManager; // ✨ NEU

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    elementManager: ElementManager,
    domUIManager: DomUIManager, // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.elementManager = elementManager;
    this.domUIManager = domUIManager; // ✨ NEU
  }

  public registerHandlers() {
    const { concedeButton } = this.elementManager.staticElements;

    this.scene.events.on("settings_button_clicked", () => {
      this.playClick();
      this.scene.scene.pause("CardGame");
      this.scene.scene.launch("SettingsDialogScene", {
        parentScene: "CardGame",
      });
    });

    this.scene.events.on("save_button_clicked", () => {
      this.playClick();
      log("UI", "Requesting save game from server...");
      this.room.send("requestSaveGame", {});
    });

    this.scene.events.on("help_button_clicked", () => {
      this.playClick();
      this.domUIManager.toggleHelp(); // ✨ NEU: Delegation an DomUIManager
    });

    concedeButton.on("pointerdown", () => {
      this.playClick();
      if (window.confirm("Are you sure you want to concede the game?")) {
        this.room.send("concede", {});
      }
    });
  }

  private playClick() {
    this.scene.game.events.emit("playSound", "UI_TOGGLE");
  }
}
