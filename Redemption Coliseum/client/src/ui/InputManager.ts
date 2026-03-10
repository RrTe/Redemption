import Phaser from "phaser";
import { type TypedRoom } from "./gameUI.js";
import { type NetworkManager } from "../network/NetworkManager.js";
import { type AnimationManager } from "./AnimationManager.js";
import { type PreviewManager } from "./PreviewManager.js";
import { ElementManager } from "./ElementManager.js"; // ✨ NEU
import { DragDropHandler } from "./DragDropHandler.js"; // ✨ REFACTOR
import { InteractionHandler } from "./InteractionHandler.js"; // ✨ REFACTOR

/**
 * Verwaltet alle globalen Input-Handler der Szene,
 * insbesondere für Drag & Drop.
 */
export class InputManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: NetworkManager;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private elementManager: ElementManager; // ✨ NEU
  private dragDropHandler: DragDropHandler; // ✨ REFACTOR
  private interactionHandler: InteractionHandler; // ✨ REFACTOR

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    dragBounds: Phaser.Geom.Rectangle,
    elementManager: ElementManager, // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.elementManager = elementManager; // ✨ NEU

    // ✨ REFACTOR: Create the dedicated handler for drag and drop.
    this.dragDropHandler = new DragDropHandler(
      scene,
      room,
      networkManager,
      animationManager,
      previewManager,
      elementManager,
      dragBounds,
    );

    // ✨ REFACTOR: Create the dedicated handler for interactions (clicks, hover, menu).
    this.interactionHandler = new InteractionHandler(
      scene,
      room,
      networkManager,
      animationManager,
      previewManager,
      this.dragDropHandler,
    );
  }

  /** ✨ NEU: Aufräumen von Timern und Listeners. */
  public destroy() {
    // ✨ REFACTOR: Delegate cleanup to the handler.
    this.dragDropHandler.destroy();
    this.interactionHandler.destroy();
    // Scene-Input-Listener werden von Phaser beim Scene-Shutdown automatisch entfernt.
  }

  /** Registriert alle globalen Input-Event-Handler für Drag & Drop. */
  public registerInputHandlers() {
    // ✨ REFACTOR: Delegate drag event registration to the handler.
    this.dragDropHandler.registerHandlers();
    this.interactionHandler.registerHandlers();
  }
}
