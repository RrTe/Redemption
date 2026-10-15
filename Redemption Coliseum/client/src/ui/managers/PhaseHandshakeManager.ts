import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import { GameEvents } from "../../constants/EventNames";
import { CardDetailOverlay } from "../overlays/CardDetailOverlay";
import { TooltipManager } from "./TooltipManager";
import { log } from "../../utils/logger";
import type { ConfirmationDialogData } from "../../scenes/ConfirmationDialogScene";
import type { WaitingDialogData } from "../../scenes/WaitingDialogScene";
import type { PromptPhaseTransitionMessage } from "../../../../shared/messages";

/**
 * Manages client-side bilateral phase transition handshakes.
 * Decouples modal dialog rendering from networking and phase orchestrators.
 */
export class PhaseHandshakeManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
  }

  /**
   * Registers network event handlers for phase handshake prompts and resolutions.
   */
  public registerHandlers(): void {
    // 1. Requester waiting state
    this.scene.events.on(
      GameEvents.NET_PHASE_TRANSITION_WAITING,
      (data: { fromPhase: string; toPhase: string }) => {
        log("PhaseHandshakeManager", `[NET] Phase handshake waiting: ${data.fromPhase} -> ${data.toPhase}`);
        this.showWaitingDialog();
      },
    );

    // 2. Opponent confirmation prompt
    this.scene.events.on(
      GameEvents.NET_PHASE_TRANSITION_PROMPT,
      (msg: PromptPhaseTransitionMessage) => {
        log("PhaseHandshakeManager", `[NET] Phase handshake prompt from ${msg.requestingPlayerName} (${msg.toPhase})`);
        this.showConfirmationDialog(msg);
      },
    );

    // 3. Resolution from server (accepted or declined)
    this.scene.events.on(
      GameEvents.NET_PHASE_TRANSITION_RESOLVED,
      (msg: { accepted: boolean; fromPhase?: string; toPhase?: string }) => {
        log("PhaseHandshakeManager", `[NET] Phase handshake resolved: accepted=${msg.accepted}`);
        this.closeDialogs();
      },
    );
  }

  /**
   * Displays the non-interactive modal waiting dialog to the active player.
   */
  public showWaitingDialog(): void {
    if (this.scene.scene.isActive("WaitingDialogScene")) {
      return;
    }
    CardDetailOverlay.hide();
    TooltipManager.hide();
    this.scene.scene.launch("WaitingDialogScene", {
      title: "Phase Transition",
      message: "Waiting for opponent confirmation...",
    } as WaitingDialogData);
  }

  /**
   * Displays the bilateral reaction confirmation dialog to the opponent.
   *
   * @param msg Prompt data containing requester identity and target phase.
   */
  public showConfirmationDialog(msg: PromptPhaseTransitionMessage): void {
    if (this.scene.scene.isActive("ConfirmationDialogScene")) {
      return;
    }
    CardDetailOverlay.hide();
    TooltipManager.hide();

    const phaseTitle = this.formatPhaseDisplayName(msg.toPhase, msg.fromPhase);
    const dialogMessage = `${msg.requestingPlayerName} wishes to proceed to ${phaseTitle}.\nDo you want to play a Dominant or react?`;

    this.scene.scene.launch("ConfirmationDialogScene", {
      title: "Phase Transition",
      message: dialogMessage,
      confirmLabel: "Pass",
      declineLabel: "Wait / React",
      onConfirm: () => {
        this.networkManager.sendRespondPhaseTransition(true);
      },
      onDecline: () => {
        this.networkManager.sendRespondPhaseTransition(false);
      },
    } as ConfirmationDialogData);
  }

  /**
   * Closes active modal waiting and confirmation dialog scenes.
   */
  public closeDialogs(): void {
    if (this.scene.scene.isActive("WaitingDialogScene")) {
      this.scene.scene.stop("WaitingDialogScene");
    }
    if (this.scene.scene.isActive("ConfirmationDialogScene")) {
      this.scene.scene.stop("ConfirmationDialogScene");
    }
  }

  /**
   * Formats a raw phase key into a user-facing display label.
   */
  private formatPhaseDisplayName(toPhase: string, fromPhase?: string): string {
    if (toPhase === "draw" && fromPhase === "discard") {
      return "Next Turn (Draw Phase)";
    }
    const cleanPhase = toPhase ? toPhase.charAt(0).toUpperCase() + toPhase.slice(1) : "Next";
    return `${cleanPhase} Phase`;
  }

  /**
   * Clean up event subscriptions and modal scenes.
   */
  public destroy(): void {
    this.scene.events.off(GameEvents.NET_PHASE_TRANSITION_WAITING);
    this.scene.events.off(GameEvents.NET_PHASE_TRANSITION_PROMPT);
    this.scene.events.off(GameEvents.NET_PHASE_TRANSITION_RESOLVED);
    this.closeDialogs();
  }
}
