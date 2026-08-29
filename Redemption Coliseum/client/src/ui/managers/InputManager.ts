import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js";
import { type AnimationManager } from "./AnimationManager.js";
import { type PreviewManager } from "./PreviewManager";
import { type TokenManager } from "./TokenManager.js"; // ✨ NEU
import { ElementManager } from "./ElementManager.js"; // ✨ NEU
import { type OverlayManager } from "./OverlayManager.js"; // ✨ NEU
import { DragDropHandler } from "../handlers/DragDropHandler.js"; // ✨ REFACTOR
import { CardInteractionHandler } from "../handlers/CardInteractionHandler.js"; // ✨ NEU
import { PileInteractionHandler } from "../handlers/PileInteractionHandler.js"; // ✨ NEU
import { InteractionHandler } from "../handlers/InteractionHandler.js";
import { KeyboardHandler } from "../handlers/KeyboardHandler"; // ✨ REFACTOR
import { MenuFactory } from "../factories/MenuFactory.js"; // ✨ NEU
import { CardUI } from "../CardUI"; // ✨ NEU
import { DomUIManager } from "./GameDomManager.js"; // ✨ NEU

/**
 * Verwaltet alle globalen Input-Handler der Szene,
 * insbesondere für Drag & Drop.
 */
export class InputManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private elementManager: ElementManager; // ✨ NEU
  private dragDropHandler: DragDropHandler; // ✨ REFACTOR
  private cardInteractionHandler: CardInteractionHandler; // ✨ NEU
  private pileInteractionHandler: PileInteractionHandler; // ✨ NEU
  private domUIManager: DomUIManager; // ✨ NEU
  private keyboardHandler: KeyboardHandler; // ✨ REFACTOR
  private interactionHandler: InteractionHandler;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    dragBounds: Phaser.Geom.Rectangle,
    elementManager: ElementManager, // ✨ NEU
    tokenManager: TokenManager, // ✨ NEU
    overlayManager: OverlayManager, // ✨ NEU
    domUIManager: DomUIManager, // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.elementManager = elementManager; // ✨ NEU
    this.domUIManager = domUIManager; // ✨ NEU

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

    // ✨ NEU: Factory für Menü-Aktionen (wird von Handlern benötigt)
    const menuFactory = new MenuFactory(scene, room, networkManager);

    // ✨ NEU: Spezialisierter Handler für Karten-Interaktionen
    this.cardInteractionHandler = new CardInteractionHandler(
      scene,
      room,
      networkManager,
      menuFactory,
      animationManager,
      previewManager,
    );

    // ✨ NEU: Spezialisierter Handler für Stapel-Interaktionen
    this.pileInteractionHandler = new PileInteractionHandler(
      scene,
      room,
      menuFactory,
      overlayManager,
    );

    // ✨ REFACTOR: InteractionHandler koordiniert nun die Sub-Handler
    this.interactionHandler = new InteractionHandler(
      scene,
      room,
      this.cardInteractionHandler,
      this.pileInteractionHandler,
      this.dragDropHandler,
      elementManager,
      tokenManager,
    );

    // ✨ REFACTOR: Create handler for keyboard inputs.
    this.keyboardHandler = new KeyboardHandler(
      scene,
      room,
      networkManager,
      tokenManager,
    );
  }

  /** ✨ NEU: Aufräumen von Timern und Listeners. */
  public destroy() {
    // ✨ REFACTOR: Delegate cleanup to the handler.
    this.dragDropHandler.destroy();
    this.cardInteractionHandler.destroy(); // CardInteractionHandler hat keine destroy, aber für Konsistenz
    this.interactionHandler.destroy();
    // Scene-Input-Listener werden von Phaser beim Scene-Shutdown automatisch entfernt.
  }

  /** Registriert alle globalen Input-Event-Handler für Drag & Drop. */
  public registerInputHandlers() {
    // ✨ REFACTOR: Delegate drag event registration to the handler.
    this.dragDropHandler.registerHandlers();
    this.interactionHandler.registerHandlers();
    this.keyboardHandler.registerHandlers();
  }

  /**
   * ✨ NEU: Zentralisiert die Phaser-Input-Konfiguration für eine Karte.
   */
  public setupCardInteractivity(card: CardUI) {
    this.cardInteractionHandler.setupCardInteractivity(card);
  }

  /**
   * ✨ NEU: Aktualisiert den interaktiven Bereich einer Karte bei Größenänderung.
   */
  public updateCardHitArea(card: CardUI) {
    this.cardInteractionHandler.updateCardHitArea(card);
  }
}
