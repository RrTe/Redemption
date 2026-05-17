import Phaser from "phaser";
import { type Room } from "colyseus.js";
import {
  type SelectionDialogData,
  type SelectionAction,
} from "../scenes/SelectionDialogScene";
import { SelectionDialogScene } from "../scenes/SelectionDialogScene";
import { getStateCallbacks } from "../network/connection";
import { CARD_TYPES } from "../../../shared/card-constants"; // Dieser Import ist jetzt korrekt
import { calculateLayout, type GameLayout } from "../ui/layout";
import { CardUI } from "./CardUI"; // ✨ Importiere die neue CardUI-Klasse
import { ElementManager } from "./managers/ElementManager";
import { LayoutManager } from "./managers/LayoutManager"; // ✨ NEU
import { CardRenderer } from "./renderers/CardRenderer.js"; // ✨ FIX: Neuer Pfad
import { UIRenderer } from "./renderers/UIRenderer"; // ✨ NEU
import { InputManager } from "./managers/InputManager";
import { GameEventCoordinator } from "../network/GameEventCoordinator"; // ✨ NEU
import { PileUI } from "./PileUI"; // ✨ Importiere die neue PileUI-Klasse
import { GameNetworkManager } from "../network/GameNetworkManager.ts"; // ✨ NEU (SCHRITT 3)
import { PhaseManager } from "./managers/PhaseManager"; // ✨ NEU
import { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Schritt 1.1
import { SoundManager } from "../managers/SoundManager.ts"; // ✨ NEU: Schritt 1.2
import { AnimationManager } from "./managers/AnimationManager";
import { OverlayManager } from "./managers/OverlayManager"; // ✨ REFACTOR
import { DomUIManager } from "./managers/GameDomManager.ts"; // ✨ NEU
import { PersistenceManager } from "./managers/PersistenceManager"; // ✨ NEU
import { GameStateManager } from "./managers/GameStateManager"; // ✨ NEU
import { DialogManager } from "./managers/DialogManager"; // ✨ REFACTOR
import { PreviewManager } from "./managers/PreviewManager"; // ✨ NEU
import { ChatManager } from "./managers/ChatManager"; // ✨ NEU
import { HUDManager } from "./managers/HUDManager"; // ✨ REFACTOR
import { TokenManager } from "./managers/TokenManager.js"; // ✨ FIX: Import hinzufügen
import { AssetManager } from "./managers/AssetManager"; // ✨ NEU
import type {
  GameRoomMessages,
  MoveCardMessage,
} from "../../../shared/messages";
import { PHASES } from "../../../shared/phases.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones";
import type { CardState, PlayerState, RoomState } from "../../../shared/types";
import { log, DEBUG } from "../utils/logger";
import { DebugManager } from "./managers/DebugManager.ts";

// 🆕 Typisiertes Room-Interface
export type TypedRoom = Room & {
  send<K extends keyof GameRoomMessages>(
    type: K,
    payload: GameRoomMessages[K],
  ): void;
};
// ✨ KORREKTUR: Leite den Typ für den Callback-Handler direkt von der Funktion ab.
export type StateCallback = ReturnType<typeof getStateCallbacks<RoomState>>;

/**
 * ✨ REFACTORING STUFE 2 & 3: Die gesamte UI-Logik ist jetzt in einer Klasse gekapselt.
 * Sie verwaltet ihre eigenen Elemente, das Layout und die Zustände.
 */
export class GameUI {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private $: StateCallback; // ✨ NEU: Den Callback-Handler speichern
  private opponentIdSet: boolean = false; // ✨ NEU: Flag, um zu verhindern, dass die Gegner-ID mehrmals gesetzt wird.
  private layout: GameLayout;
  private elementManager: ElementManager;
  private layoutManager: LayoutManager; // ✨ NEU
  private inputManager: InputManager;
  private eventCoordinator: GameEventCoordinator; // ✨ NEU
  private networkManager: GameNetworkManager;
  private cardRenderer: CardRenderer;
  private uiRenderer: UIRenderer; // ✨ NEU
  private phaseManager: PhaseManager; // ✨ NEU
  public settingsManager: SettingsManager; // ✨ NEU: Öffentlich gemacht für Zugriff via Scene Registry
  public soundManager: SoundManager; // ✨ NEU: Öffentlich für Zugriff aus der Scene
  private animationManager: AnimationManager; // ✨ NEU
  private previewManager: PreviewManager; // ✨ NEU
  private dragBounds: Phaser.Geom.Rectangle;
  private debugManager: DebugManager; // ✨ NEU
  private chatManager: ChatManager; // ✨ NEU
  private dialogManager: DialogManager; // ✨ REFACTOR
  private overlayManager: OverlayManager; // ✨ REFACTOR
  private persistenceManager: PersistenceManager; // ✨ NEU
  private domUIManager: DomUIManager; // ✨ NEU
  private gameStateManager: GameStateManager; // ✨ NEU
  private assetManager: AssetManager; // ✨ NEU
  private hudManager: HUDManager; // ✨ REFACTOR
  private tokenManager: TokenManager; // ✨ FIX: Property hinzufügen

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    stateCallback: StateCallback,
  ) {
    this.scene = scene;
    this.room = room;
    this.$ = stateCallback;

    this.settingsManager = this.scene.registry.get("settingsManager");
    this.soundManager = this.scene.registry.get("soundManager");

    this.initCoreSystems();
    this.initNetworking();
    this.initLayoutAndRendering();
    this.initLogicAndInput();

    // ✨ NEU: DebugManager initialisieren
    this.debugManager = new DebugManager(this.scene, this.elementManager);
  }

  private initCoreSystems() {
    this.animationManager = new AnimationManager(
      this.scene,
      this.settingsManager,
    );
    this.previewManager = new PreviewManager(this.scene);
    this.assetManager = new AssetManager(this.scene);
    this.scene.registry.set("assetManager", this.assetManager); // ✨ FIX: Register for CardUI access
    this.domUIManager = new DomUIManager(this.scene, this.room); // ✨ NEU
    this.persistenceManager = new PersistenceManager(this.room);
    this.overlayManager = new OverlayManager(
      this.scene,
      this.room,
      this.soundManager,
    );
    // this.overlayManager.setDialogManager(this.dialogManager); // ✨ VERSCHOBEN: Wird später aufgerufen
  }

  private initNetworking() {
    this.networkManager = new GameNetworkManager(
      this.scene,
      this.room,
      this,
      this.$,
    );
    this.eventCoordinator = new GameEventCoordinator(
      this.scene,
      this.room,
      this.$,
    ); // ✨ FIX: Initialisierung hier
    this.chatManager = new ChatManager(
      this.scene,
      this.room,
      this.networkManager,
    );
    this.tokenManager = new TokenManager(
      this.scene,
      this.room,
      this.networkManager,
    );
  }

  private initLayoutAndRendering() {
    this.layout = calculateLayout(
      this.scene.scale.width,
      this.scene.scale.height,
      this.room.state.currentPhase,
    );
    this.elementManager = new ElementManager(
      this.scene,
      this.room,
      this.layout,
      this.networkManager,
    );
    this.elementManager.createAllElements();

    this.dragBounds = new Phaser.Geom.Rectangle(
      0,
      0,
      this.layout.GAME_WIDTH,
      this.layout.GAME_HEIGHT,
    );
    this.cardRenderer = new CardRenderer(
      this.scene,
      this.room,
      this.layout,
      this.elementManager,
      this.animationManager,
      this.dragBounds,
    );
    this.hudManager = new HUDManager(
      this.scene,
      this.room,
      this.elementManager,
      this.layout,
    );

    // Coordinator Initialization
    this.uiRenderer = new UIRenderer(
      this.scene,
      this.hudManager,
      this.cardRenderer,
      this.assetManager,
      this.animationManager,
    );
    this.layoutManager = new LayoutManager(
      this.scene,
      this.elementManager,
      this.hudManager,
      this.chatManager,
      this.cardRenderer,
      this.dragBounds,
    );
    this.layoutManager.layout = this.layout;
  }

  private initLogicAndInput() {
    this.gameStateManager = new GameStateManager(
      this.room,
      this.overlayManager,
      this.scene,
      this.animationManager,
      this.settingsManager,
      () => this.render(this.room.state, this.room.sessionId),
    );
    this.dialogManager = new DialogManager(
      this.scene,
      this.room,
      this.networkManager,
    );
    this.networkManager.setDialogManager(this.dialogManager);
    this.inputManager = new InputManager( // ✨ FIX: dialogManager-Parameter entfernt
      this.scene,
      this.room,
      this.networkManager,
      this.animationManager,
      this.previewManager,
      this.dragBounds,
      this.elementManager,
      this.tokenManager,
      this.overlayManager,
      this.domUIManager, // ✨ NEU: DomUIManager übergeben
    );
    this.overlayManager.setDialogManager(this.dialogManager); // ✨ FIX: Erst hier aufrufen, wenn dialogManager existiert

    this.scene.registry.set("inputManager", this.inputManager); // ✨ FIX: Register for CardUI access
    this.phaseManager = new PhaseManager(
      this.scene,
      this.room,
      this,
      this.elementManager,
      this.networkManager,
    );
    this.phaseManager.initialize();
  }

  // ✨ KORREKTUR: Die Initialisierung der Handler wird jetzt von der Scene gesteuert.
  public initializeScene() {
    // ✨ REFACTORING: Delegiere die Registrierung an den InputManager.
    this.inputManager.registerInputHandlers();

    // ✨ NEU: Melde dem Server, dass wir bereit sind (Assets geladen, UI erstellt).
    this.networkManager.sendPlayerReady();
  }
  /** Registriert Handler für Colyseus-Raum-Events. */
  public registerRoomHandlers() {
    // ✨ REFACTOR: NetworkManager kümmert sich nur noch um Connection/Heartbeat
    this.networkManager.registerHandlers();

    // --- Bridge Coordinator Events to UI Logic ---
    this.scene.events.on("net:playerJoined", (data: { sessionId: string }) => {
      if (data.sessionId !== this.room.sessionId) {
        this.setupOpponentUI(data.sessionId);
      }
      this.updateWaitingStatus();
    });

    this.scene.events.on("net:playerLeft", () => this.updateWaitingStatus());
    this.scene.events.on("net:stateChanged", () => this.updateWaitingStatus());

    // --- Bridge Connection Events to OverlayManager ---
    this.scene.events.on("net:offline", (data: { message: string }) =>
      this.overlayManager.showWaitingOverlay(data.message, false),
    );

    this.scene.events.on("net:online", (data: { message: string }) => {
      this.overlayManager.showWaitingOverlay(data.message, false);
      this.scene.time.delayedCall(1000, () =>
        this.overlayManager.hideWaitingOverlay(),
      );
    });

    this.scene.events.on("net:reconnecting", (data: { message: string }) =>
      this.overlayManager.showWaitingOverlay(data.message, false),
    );

    this.scene.events.on(
      "net:disconnected",
      (data: { message: string; fatal: boolean }) =>
        this.overlayManager.showWaitingOverlay(data.message, data.fatal),
    );

    // ✨ NEU: Delegiere Event- und State-Handling an GameStateManager
    this.gameStateManager.registerHandlers();

    // ✨ NEU: Delegiere Dialog-Handling
    this.dialogManager.registerHandlers();

    // ✨ NEU: Delegiere die Registrierung der Phasen-Handler.
    this.phaseManager.registerHandlers();

    // ✨ NEU: Delegiere Save-Handling an PersistenceManager
    this.persistenceManager.registerHandlers();

    // ✨ FIX: Erst GANZ AM ENDE registrieren, damit alle obigen Listener aktiv sind,
    // wenn die initialen State-Events (playerJoined) feuern!
    this.eventCoordinator.registerHandlers();
  }

  /** ✨ NEU: Zeigt das Game-Over-Overlay an. */
  public showGameOverOverlay(isWinner: boolean) {
    this.overlayManager.showGameOverOverlay(isWinner);
  }

  /** Positioniert alle UI-Elemente neu, z.B. bei einer Fenstergrößen-Änderung. */
  public repositionUI() {
    // ✨ REFACTORING: Delegiere an den LayoutManager
    this.layoutManager.updateLayout(
      this.scene.scale.width,
      this.scene.scale.height,
      this.room.state.currentPhase,
    );
    this.layout = this.layoutManager.layout;
    this.layoutManager.repositionUI();

    // ✨ REFACTORING: Delegiere Debug-Updates an den DebugManager
    this.debugManager.update();

    // Ein erneutes Rendering der Karten anstoßen, da sich ihre Zielpositionen geändert haben
    if (this.room?.state?.players) {
      this.render(this.room.state, this.room.sessionId);
    }
  }

  /** ✨ NEU: Startet die Animation für den Phasenwechsel. Wird vom PhaseManager aufgerufen. */
  public startPhaseChangeAnimation(endLayout: GameLayout) {
    this.layoutManager.startPhaseChangeAnimation(endLayout, () => {
      // ✨ FIX: Nutze die zentrale repositionUI Methode für einen kompletten Refresh nach der Animation.
      // Dies synchronisiert alle Manager (Renderer, HUD) und aktualisiert die Debug-Graphics.
      this.repositionUI();
    });
  }

  /**
   * Öffentliche Haupt-Render-Methode.
   */
  public render(state: RoomState, mySessionId: string) {
    // ✨ REFACTORING: Delegation an den UIRenderer
    this.uiRenderer.render(state, mySessionId);
  }

  /** Setzt den Text der Statusanzeige. */
  public setStatus(text: string, color = "#fff") {
    // ✨ FIX: Status-Text wurde entfernt. Wir könnten hier später eine Toast-Nachricht einbauen.
  }

  /** Zerstört alle UI-Elemente. */
  public destroy() {
    // ✨ REFACTORING: Delegiere das Aufräumen an den Renderer.
    this.cardRenderer.destroy();

    // ✨ NEU: DebugManager aufräumen
    this.debugManager?.destroy();

    // ✨ FIX: Destroy all sub-managers to prevent memory leaks and "zombie listeners".
    // This is crucial for a clean scene transition.
    this.inputManager?.destroy();
    this.networkManager?.destroy();
    this.chatManager?.destroy();
    this.overlayManager?.destroy(); // ✨ REFACTOR
    this.gameStateManager?.destroy(); // ✨ NEU
    this.previewManager?.hide(); // Hide any active preview
  }

  /** ✨ NEU: Richtet die UI für einen beigetretenen Gegner ein. Wird vom NetworkManager aufgerufen. */
  public setupOpponentUI(opponentId: string) {
    this.elementManager.setupOpponentUI(opponentId);
  }

  /** Hilfsmethode, um die ID des Gegners zu finden. */
  public findOpponentId(state: RoomState): string | undefined {
    return this.gameStateManager.findOpponentId(state);
  }

  /** ✨ NEU: Prüft den Spielerstatus und zeigt/versteckt das Warte-Overlay. */
  public updateWaitingStatus() {
    this.gameStateManager.updateWaitingStatus();
  }
}
