import type { TypedRoom, GameUI } from "../gameUI";
import type { ElementManager } from "./ElementManager";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import type { RoomState } from "../../../../shared/types";
import { DRAW_STEPS } from "../../../../shared/phases";
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
    const state = this.room.state;
    const isDrawStepActive =
      state?.currentPhase === "draw" &&
      !!state?.drawStep &&
      state.drawStep !== DRAW_STEPS.NONE &&
      state.drawStep !== DRAW_STEPS.COMPLETED;

    const isChronicleActive = Boolean(
      state?.effectChronicle &&
      state.effectChronicle.items &&
      state.effectChronicle.items.length > 0
    );

    if (isDrawStepActive || isChronicleActive) {
      log(
        `[NEXT_PHASE] Blocked nextPhase click: draw step '${state?.drawStep}' or chronicle active (${state?.effectChronicle?.items?.length} items).`,
      );
      return;
    }


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

    this.updateNextPhaseButtonState(state);
  }

  /**
   * Updates Next Phase button interactivity, hover, and disabled visual state.
   */
  public updateNextPhaseButtonState(state: RoomState): void {
    const nextPhaseButton = this.elementManager.staticElements.nextPhaseButton;
    if (!nextPhaseButton) return;

    const arrow = nextPhaseButton.getByName(
      "arrow",
    ) as Phaser.GameObjects.Image;

    const baseScale = nextPhaseButton.getData("baseScale") || 1.0;
    nextPhaseButton.setScale(baseScale);
    if (arrow) {
      arrow.clearTint();
    }

    const isActive = state.activePlayer === this.room.sessionId;
    let isButtonEnabled = isActive;

    if (state.currentPhase === "battle" && state.battlefield.length > 0) {
      isButtonEnabled = false;
    }

    const isDrawStepActive =
      state.currentPhase === "draw" &&
      !!state.drawStep &&
      state.drawStep !== DRAW_STEPS.NONE &&
      state.drawStep !== DRAW_STEPS.COMPLETED;

    const isChronicleActive = Boolean(
      state?.effectChronicle &&
      state.effectChronicle.items &&
      state.effectChronicle.items.length > 0
    );

    if (isDrawStepActive || isChronicleActive) {
      isButtonEnabled = false;
    }

    nextPhaseButton.setVisible(isActive);

    if (isButtonEnabled) {
      nextPhaseButton.setInteractive();
      nextPhaseButton.setAlpha(1.0);
    } else {
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
