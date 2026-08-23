import type { TypedRoom, GameUI } from "../gameUI";
import type { ElementManager } from "./ElementManager";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import type { RoomState } from "../../../../shared/types";
import { calculateLayout } from "../layout";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) =>
  DEBUG && console.log("[CLIENT DEBUG][PhaseManager]", ...a);

/**
 * ✨ NEU: Verwaltet den Phasen-Zustand, die Logik für den "Next Phase"-Button
 * und die Animationen beim Phasenwechsel.
 */
export class PhaseManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private ui: GameUI;
  private elementManager: ElementManager;
  private networkManager: GameNetworkManager;
  private currentPhase: string = "";

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    ui: GameUI,
    elementManager: ElementManager,
    networkManager: GameNetworkManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.ui = ui;
    this.elementManager = elementManager;
    this.networkManager = networkManager;
  }

  /** Registriert den onStateChange-Handler, um auf Phasenänderungen zu lauschen. */
  public registerHandlers() {
    this.room.onStateChange((state) => {
      this.handleStateChange(state);
    });
  }

  /** Initialisiert die Interaktivität des "Next Phase"-Buttons. */
  public initialize() {
    // ✨ REFACTORING: Der PhaseManager lauscht nur noch auf das generische Klick-Event.
    // Das eigentliche Pointer-Handling erfolgt im ElementManager, wo der Button erstellt wird.
    this.scene.events.on(
      "nextPhaseButtonClicked",
      this.onNextPhaseClicked,
      this,
    );
  }

  /** ✨ REFACTORING: Dies ist der Callback für das Button-Klick-Event. */
  private onNextPhaseClicked() {
    log(
      "[NEXT_PHASE] 'nextPhaseButtonClicked' event received. Sending 'nextPhase' message to server.",
    );
    this.scene.game.events.emit("playSound", "PHASE_CHANGE"); // ✨ FIX: Globaler Event-Bus
    this.networkManager.sendNextPhase();
  }

  /** Wird bei jeder Zustandsänderung aufgerufen, um die Phasenlogik zu verarbeiten. */
  private handleStateChange(state: RoomState) {
    // --- Logik für Phasenwechsel-Animation ---
    if (this.currentPhase !== state.currentPhase) {
      log(
        `[PHASE_CHANGE] Detected phase change. New phase: ${state.currentPhase}`,
      );
      this.currentPhase = state.currentPhase;
      const newLayout = calculateLayout(
        this.scene.scale.width,
        this.scene.scale.height,
        this.currentPhase,
      );
      this.ui.startPhaseChangeAnimation(newLayout);
    }

    // --- Logik für den "Next Phase"-Button ---
    const nextPhaseButton = this.elementManager.staticElements.nextPhaseButton;
    const arrow = nextPhaseButton.getByName(
      "arrow",
    ) as Phaser.GameObjects.Image;

    // ✨ FIX: Visuellen Status (Hover/Glow) bei jedem Update zurücksetzen.
    // Verhindert, dass der Button "gehighlighted" bleibt, wenn er neu erscheint.
    const baseScale = nextPhaseButton.getData("baseScale") || 1.0;
    nextPhaseButton.setScale(baseScale);
    // Wir greifen hier noch auf 'arrow' zu, um Tints zu löschen, was okay ist für State-Resets.
    if (arrow) {
      arrow.clearTint();
    }

    const isActive = state.activePlayer === this.room.sessionId;
    let isButtonEnabled = isActive;

    if (state.currentPhase === "battle" && state.battlefield.length > 0) {
      isButtonEnabled = false;
    }

    nextPhaseButton.setVisible(isActive);

    if (isButtonEnabled) {
      // Aktiv: Interaktivität einschalten, volle Deckkraft
      nextPhaseButton.setInteractive();
      nextPhaseButton.setAlpha(1.0);
    } else {
      // Inaktiv: Interaktivität ausschalten (kein Hover), ausgegraut
      nextPhaseButton.disableInteractive();
      nextPhaseButton.setAlpha(0.5);
    }
  }

  /** Räumt den Event-Listener auf. */
  public destroy() {
    this.scene.events.off(
      "nextPhaseButtonClicked",
      this.onNextPhaseClicked,
      this,
    );
  }
}
