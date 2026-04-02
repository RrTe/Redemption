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
import { InputManager } from "./managers/InputManager";
import { PileUI } from "./PileUI"; // ✨ Importiere die neue PileUI-Klasse
import { GameNetworkManager } from "../network/GameNetworkManager.ts"; // ✨ NEU (SCHRITT 3)
import { PhaseManager } from "./managers/PhaseManager"; // ✨ NEU
import { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Schritt 1.1
import { SoundManager } from "../managers/SoundManager.ts"; // ✨ NEU: Schritt 1.2
import { DebugManager } from "./managers/DebugManager"; // ✨ NEU
import { AnimationManager } from "./managers/AnimationManager";
import { OverlayManager } from "./managers/OverlayManager"; // ✨ REFACTOR
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
  private networkManager: GameNetworkManager;
  private cardRenderer: CardRenderer;
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
    this.room = room; // ✨ FIX: Zuweisung nach oben verschoben
    this.$ = stateCallback; // ✨ FIX: Zuweisung nach oben verschoben

    // ✨ NEU: Globale Manager aus der Registry holen.
    this.settingsManager = this.scene.registry.get("settingsManager");

    // ✨ NEU: SoundManager aus der Registry holen.
    this.soundManager = this.scene.registry.get("soundManager");

    // ✨ NEU: Erstelle den AnimationManager.
    this.animationManager = new AnimationManager(
      this.scene,
      this.settingsManager,
    );

    // ✨ NEU: Erstelle den PreviewManager.
    this.previewManager = new PreviewManager(this.scene);

    // ✨ REFACTOR: Erstelle den OverlayManager.
    this.overlayManager = new OverlayManager(
      this.scene,
      this.room,
      this.soundManager,
    );

    // ✨ NEU: Erstelle den AssetManager
    this.assetManager = new AssetManager(this.scene);

    // ✨ NEU: Erstelle den GameStateManager
    this.gameStateManager = new GameStateManager(
      this.room,
      this.overlayManager,
      this.scene,
      this.animationManager,
      this.settingsManager,
      () => this.render(this.room.state, this.room.sessionId)
    );

    // ✨ NEU: Erstelle den PersistenceManager
    this.persistenceManager = new PersistenceManager(this.room);

    // ✨ FIX: NetworkManager ZUERST erstellen, da andere Manager ihn brauchen.
    this.networkManager = new GameNetworkManager(
      this.scene,
      this.room,
      this,
      this.$,
      this.overlayManager,
      null!, // dialogManager wird gleich gesetzt
    );

    // ✨ FIX: ChatManager erstellen (braucht NetworkManager)
    this.chatManager = new ChatManager(
      this.scene,
      this.room,
      this.networkManager,
    );

    log(
      "UI",
      "[SETUP] Initializing GameUI..." + "Config Width:",
      scene.sys.game.config.width as number,
      "Config Height:",
      scene.sys.game.config.height as number,
    );
    log(
      "UI",
      "[SETUP] Initializing GameUI..." + "Scale Width:",
      this.scene.scale.width,
      "Scale Height:",
      this.scene.scale.height,
    );
    // ✨ KORREKTUR: Initiales Layout mit den tatsächlichen Pixelwerten des Scale Managers berechnen.
    // scene.sys.game.config.width/height können Strings wie "100%" sein, calculateLayout benötigt Zahlen.
    this.layout = calculateLayout(
      this.scene.scale.width,
      this.scene.scale.height,
      this.room.state.currentPhase, // ✨ NEU: Übergebe die initiale Phase
    );

    // ✨ REFACTORING: Erstelle die Manager-Instanzen.
    this.elementManager = new ElementManager(
      this.scene,
      this.room,
      this.layout,
      this.networkManager, // ✨ FIX: NetworkManager übergeben
    );
    this.elementManager.createAllElements();

    // Drag-Grenzen definieren
    this.dragBounds = new Phaser.Geom.Rectangle(
      0,
      0,
      this.layout.GAME_WIDTH,
      this.layout.GAME_HEIGHT,
    );

    // ✨ REFACTOR: Erstelle den DialogManager und übergebe den NetworkManager.
    this.dialogManager = new DialogManager(
      this.scene,
      this.room,
      this.networkManager,
    );
    // ✨ FIX: Zirkuläre Abhängigkeit auflösen
    this.networkManager.setDialogManager(this.dialogManager);

    // ✨ FIX: TokenManager erstellen (braucht NetworkManager)
    this.tokenManager = new TokenManager(
      this.scene,
      this.room,
      this.networkManager,
    );

    // ✨ KORREKTUR: Erstelle den InputManager NACH dem NetworkManager und übergebe ihn.
    this.inputManager = new InputManager(
      this.scene,
      this.room,
      this.networkManager,
      this.animationManager, // ✨ NEU: Übergebe den AnimationManager
      this.previewManager, // ✨ NEU: Übergebe den PreviewManager
      this.dragBounds,
      this.elementManager, // ✨ NEU: Übergebe ElementManager für Highlights
      this.tokenManager, // ✨ FIX: TokenManager übergeben
      this.overlayManager, // ✨ NEU: OverlayManager übergeben
    );

    this.cardRenderer = new CardRenderer(
      this.scene,
      this.room,
      this.layout,
      this.elementManager,
      this.animationManager,
      this.dragBounds,
    );

    // ✨ NEU: Erstelle den PhaseManager.
    this.phaseManager = new PhaseManager(
      this.scene,
      this.room,
      this,
      this.elementManager,
      this.networkManager,
    );
    this.phaseManager.initialize();

    // ✨ REFACTOR: Erstelle den HUDManager.
    this.hudManager = new HUDManager(this.scene, this.room, this.elementManager, this.layout);

    // ✨ NEU: Erstelle den LayoutManager
    this.layoutManager = new LayoutManager(
      this.scene,
      this.elementManager,
      this.hudManager,
      this.chatManager,
      this.cardRenderer,
      this.dragBounds
    );
    this.layoutManager.layout = this.layout;

    // ✨ NEU: Erstelle den DebugManager
    this.debugManager = new DebugManager(this.scene, this.elementManager);

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
    // ✨ NEU (SCHRITT 3): Delegiere die Registrierung der Nachrichten-Handler.
    this.networkManager.registerHandlers();

    // ✨ NEU: Delegiere Event- und State-Handling an GameStateManager
    this.gameStateManager.registerHandlers();

    // ✨ NEU: Delegiere die Registrierung der Phasen-Handler.
    this.phaseManager.registerHandlers();

    // ✨ NEU: Delegiere Save-Handling an PersistenceManager
    this.persistenceManager.registerHandlers();
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
      this.room.state.currentPhase
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
   * Koordiniert das Rendern der verschiedenen UI-Teile.
   */
  public render(state: RoomState, mySessionId: string) {
    if (!state) return;

    const player = state.players.get(mySessionId);
    let opponent: PlayerState | undefined;
    if (state.players.size > 1) {
      for (const [sessionId, playerState] of state.players.entries()) {
        if (sessionId !== mySessionId) {
          opponent = playerState;
          break;
        }
      }
    }

    log(
      "UI",
      `[render] Rendering with player deck size: ${player?.deck.length}`,
    );

    this.hudManager.updateGameStateUI(state, mySessionId, opponent);

    if (!player) {
      // ✨ REFACTORING: Delegiere das Aufräumen an den Renderer.
      this.cardRenderer.cleanupAllCards();
      // Piles für den Spieler zurücksetzen, falls er das Spiel verlässt
      this.hudManager.updatePileCounts(null, opponent);
      return;
    }

    this.hudManager.updatePileCounts(player, opponent);
    // ✨ REFACTORING: Delegiere das Rendern der Karten an den Renderer.
    this.cardRenderer.renderAllCards(player, opponent);

    // ✨ NEU: Delegiere Preloading an den AssetManager
    if (this.animationManager.activeDrawTweens.size > 0) {
      this.scene.events.once("all-draw-animations-complete", () => {
        this.assetManager.preloadDeck(player);
      });
    } else {
      this.assetManager.preloadDeck(player);
    }
  }

  /** Setzt den Text der Statusanzeige. */
  public setStatus(text: string, color = "#fff") {
    // ✨ FIX: Status-Text wurde entfernt. Wir könnten hier später eine Toast-Nachricht einbauen.
  }

  /** Zerstört alle UI-Elemente. */
  public destroy() {
    // ✨ REFACTORING: Delegiere das Aufräumen an den Renderer.
    this.cardRenderer.cleanupAllCards();

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
