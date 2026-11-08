import type { TypedRoom, GameUI } from "../gameUI";
import type { ElementManager } from "./ElementManager";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import type { RoomState } from "../../../../shared/types";
import { DRAW_STEPS, PHASES } from "../../../../shared/phases";
import { calculateLayout } from "../layout";
import { PhaseHandshakeToggle } from "../components/PhaseHandshakeToggle";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) =>
  DEBUG && console.log("[CLIENT DEBUG][PhaseManager]", ...a);

/**
 * Manages phase transitions, the 'Next Phase' button, and bilateral handshake toggle.
 */
export class PhaseManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private ui: GameUI;
  private elementManager: ElementManager;
  private networkManager: GameNetworkManager;
  private currentPhase: string = "";
  private handshakeToggle?: PhaseHandshakeToggle;

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

  /** Registers onStateChange listener for phase changes. */
  public registerHandlers() {
    this.room.onStateChange((state) => {
      this.handleStateChange(state);
    });
  }

  /** Initializes Next Phase button interactivity and Handshake Toggle. */
  public initialize() {
    this.scene.events.on(
      "nextPhaseButtonClicked",
      this.onNextPhaseClicked,
      this,
    );
    this.handshakeToggle = new PhaseHandshakeToggle(
      this.scene,
      0,
      0,
      this.networkManager,
    );
    this.handshakeToggle.setVisible(true);
    this.reposition();
  }

  /** Callback when Next Phase button is clicked. */
  private onNextPhaseClicked() {
    const state = this.room.state;
    const isDrawStepActive =
      state?.currentPhase === PHASES.DRAW &&
      !!state?.drawStep &&
      state.drawStep !== DRAW_STEPS.NONE &&
      state.drawStep !== DRAW_STEPS.COMPLETED;

    const isHelpEnabled = (this.scene.registry.get("settingsManager") as any)?.isInGameSupportEnabled() ?? true;
    const hasMandatoryChronicleItems = Boolean(
      state?.effectChronicle?.items?.some((item: any) => !item.isOptional)
    );
    const isChronicleActive = isHelpEnabled
      ? Boolean(state?.effectChronicle?.items?.length)
      : hasMandatoryChronicleItems;
    const isSpecialInitiativeActive =
      state?.currentPhase === PHASES.BATTLE &&
      Boolean(state?.battle?.specialInitiativePlayerId);

    const isArena = Boolean(state?.isArenaMode);
    if (!isArena && (isDrawStepActive || isChronicleActive || isSpecialInitiativeActive)) {
      log(
        `[NEXT_PHASE] Blocked nextPhase click: draw step '${state?.drawStep}', chronicle active (${state?.effectChronicle?.items?.length} items), or special initiative (${state?.battle?.specialInitiativePlayerId}).`,
      );
      return;
    }

    // Auto-pass any pending optional ability prompt if help is off
    if (!isHelpEnabled) {
      this.scene.events.emit("ui:autoPassOptionalPrompt");
    }

    const isEndingBattlePhase = !isArena && state?.currentPhase === PHASES.BATTLE;
    const requireHandshake = Boolean(
      isEndingBattlePhase || this.handshakeToggle?.isEnabled(),
    );

    log(
      `[NEXT_PHASE] 'nextPhaseButtonClicked' event received. Sending 'nextPhase' message (requireHandshake=${requireHandshake}).`,
    );
    this.scene.game.events.emit("playSound", "UI_CLICK");
    this.networkManager.sendNextPhase({ requireHandshake });
  }

  /** Invoked on room state change to trigger animations and update button state. */
  private handleStateChange(state: RoomState) {
    if (this.currentPhase !== state.currentPhase) {
      log(
        `[PHASE_CHANGE] Detected phase change. New phase: ${state.currentPhase}`,
      );
      this.currentPhase = state.currentPhase;
      this.scene.game.events.emit("playSound", "PHASE_CHANGE");
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

    const isDrawStepActive =
      state.currentPhase === PHASES.DRAW &&
      !!state.drawStep &&
      state.drawStep !== DRAW_STEPS.NONE &&
      state.drawStep !== DRAW_STEPS.COMPLETED;

    const isHelpEnabled = (this.scene.registry.get("settingsManager") as any)?.isInGameSupportEnabled() ?? true;
    const hasMandatoryChronicleItems = Boolean(
      state?.effectChronicle?.items?.some((item: any) => !item.isOptional)
    );
    const isChronicleActive = isHelpEnabled
      ? Boolean(state?.effectChronicle?.items?.length)
      : hasMandatoryChronicleItems;
    const isSpecialInitiativeActive =
      state.currentPhase === PHASES.BATTLE &&
      Boolean(state?.battle?.specialInitiativePlayerId);

    const isArena = Boolean(state.isArenaMode);
    if (!isArena && (isDrawStepActive || isChronicleActive || isSpecialInitiativeActive)) {
      isButtonEnabled = false;
    }

    nextPhaseButton.setVisible(isActive);

    if (this.handshakeToggle) {
      this.handshakeToggle.setVisible(true);
      this.reposition();
    }

    if (isButtonEnabled) {
      nextPhaseButton.setInteractive();
      nextPhaseButton.setAlpha(1.0);
    } else {
      nextPhaseButton.disableInteractive();
      nextPhaseButton.setAlpha(0.5);
    }
  }

  /**
   * Repositions the Handshake Toggle to match the dynamic layout.
   * Placed right above the Next Phase button coordinates for all players.
   */
  public reposition(layout?: any): void {
    if (!this.handshakeToggle) return;
    const currentLayout = layout || this.elementManager?.layout || (this.ui as any)?.layout;
    if (!currentLayout?.nextPhaseButton) return;


    const baseScale = currentLayout.buttonScale ?? 1.0;
    this.handshakeToggle.setPosition(
      currentLayout.nextPhaseButton.x,
      currentLayout.nextPhaseButton.y - 44 * baseScale,
    );
    this.handshakeToggle.setScale(baseScale);
    this.handshakeToggle.setData("baseScale", baseScale);
    this.handshakeToggle.setVisible(true);
  }

  /** Cleans up event listeners and toggle component. */
  public destroy() {
    this.scene.events.off(
      "nextPhaseButtonClicked",
      this.onNextPhaseClicked,
      this,
    );
    if (this.handshakeToggle) {
      this.handshakeToggle.destroy();
      this.handshakeToggle = undefined;
    }
  }
}
