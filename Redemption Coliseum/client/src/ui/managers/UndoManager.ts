import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import { type ElementManager } from "./ElementManager";
import { GameEvents } from "../../constants/EventNames";
import { CardDetailOverlay } from "../overlays/CardDetailOverlay";
import { ToastManager } from "./ToastManager";
import { TooltipManager } from "./TooltipManager";
import { log } from "../../utils/logger";
import type { QuantitySelectionDialogData } from "../../scenes/QuantitySelectionDialogScene";
import type { ConfirmationDialogData } from "../../scenes/ConfirmationDialogScene";

/**
 * Manages client-side undo workflows:
 * - Single-action undo (click / Ctrl+Z)
 * - Multi-action batch undo dialog (long-press / Ctrl+Shift+Z)
 * - Opponent confirmation prompts and responses
 * - Button visual states (active/inactive, tint, alpha)
 */
export class UndoManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;
  private elementManager: ElementManager;
  private currentAvailableCount: number = 0;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    elementManager: ElementManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.elementManager = elementManager;
  }

  public registerHandlers(): void {
    // 1. Listen for undo availability updates from server
    this.scene.events.on(
      "net:undoStateChanged",
      (msg: { availableCount: number }) => {
        this.updateButtonState(msg.availableCount);
      },
    );

    // 2. Listen for opponent confirmation prompt from server
    this.scene.events.on(
      GameEvents.NET_UNDO_CONFIRMATION_PROMPT,
      (msg: {
        requestingPlayerId: string;
        requestingPlayerName: string;
        count: number;
      }) => {
        this.showUndoConfirmationDialog(msg.requestingPlayerName, msg.count);
      },
    );

    // 3. Listen for undo resolution to close waiting modal dialog
    this.scene.events.on(
      GameEvents.NET_UNDO_RESOLVED,
      (msg: { accepted: boolean; count: number }) => {
        log("UndoManager", `[UndoManager] NET_UNDO_RESOLVED received: accepted=${msg.accepted}`);
        this.closeWaitingDialog();
      },
    );

    // 4. Listen for UI trigger (e.g. undo button or shortcut)
    this.scene.events.on(
      GameEvents.UI_UNDO_CLICKED,
      (data?: { isLongPress?: boolean }) => {
        if (data?.isLongPress) {
          this.openCountSelectionDialog();
        } else {
          this.requestSingleUndo();
        }
      },
    );
  }

  /**
   * Updates visual appearance and interactivity of the undo button.
   */
  public updateButtonState(count: number): void {
    log("UndoManager", `[UndoManager] updateButtonState called with count: ${count}`);
    this.currentAvailableCount = count;
    const undoButton = this.elementManager.staticElements.undoButton;
    if (!undoButton) {
      log("UndoManager", "[UndoManager] ERROR: undoButton element not found!");
      return;
    }

    const isEnabled = count > 0;
    const arrow = undoButton.getByName("arrow") as Phaser.GameObjects.Image | null;

    if (isEnabled) {
      if (undoButton.input) undoButton.input.enabled = true;
      undoButton.setAlpha(1.0);
      arrow?.clearTint();
      log("UndoManager", "[UndoManager] undoButton ENABLED (alpha: 1.0)");
    } else {
      if (undoButton.input) undoButton.input.enabled = false;
      undoButton.setAlpha(0.4);
      arrow?.setTint(0x777777);
      TooltipManager.hide();
      log("UndoManager", "[UndoManager] undoButton DISABLED (alpha: 0.4)");
    }
  }

  public requestSingleUndo(): void {
    if (this.currentAvailableCount === 0) {
      ToastManager.show("No actions to undo in the current phase.", "warning");
      return;
    }
    this.showWaitingDialog();
    this.networkManager.sendRequestUndo(1);
  }

  public openCountSelectionDialog(): void {
    if (this.currentAvailableCount === 0) {
      ToastManager.show("No actions to undo in the current phase.", "warning");
      return;
    }

    CardDetailOverlay.hide();
    TooltipManager.hide();
    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("QuantitySelectionDialogScene", {
      title: "Undo Actions",
      maxCount: this.currentAvailableCount,
      minCount: 1,
      enablePositionSelection: false,
      onConfirm: (count: number) => {
        this.scene.scene.resume("CardGame");
        this.showWaitingDialog();
        this.networkManager.sendRequestUndo(count);
      },
      onCancel: () => {
        this.scene.scene.resume("CardGame");
      },
    } as QuantitySelectionDialogData);
  }

  private showWaitingDialog(): void {
    if (this.scene.scene.isActive("WaitingDialogScene")) {
      return;
    }
    CardDetailOverlay.hide();
    TooltipManager.hide();
    this.scene.scene.launch("WaitingDialogScene", {
      title: "Undo Request",
      message: "Waiting for opponent to respond...",
    });
  }

  private closeWaitingDialog(): void {
    if (this.scene.scene.isActive("WaitingDialogScene")) {
      this.scene.scene.stop("WaitingDialogScene");
    }
  }

  public showUndoConfirmationDialog(
    requestingPlayerName: string,
    count: number,
  ): void {
    if (this.scene.scene.isActive("ConfirmationDialogScene")) {
      return;
    }
    CardDetailOverlay.hide();
    TooltipManager.hide();
    this.scene.scene.launch("ConfirmationDialogScene", {
      title: "Undo Request",
      message: `${requestingPlayerName} wants to undo ${count} action(s).\nDo you accept?`,
      confirmLabel: "Accept",
      declineLabel: "Decline",
      onConfirm: () => {
        this.networkManager.sendResolveUndo(true, count);
      },
      onDecline: () => {
        this.networkManager.sendResolveUndo(false, count);
      },
    } as ConfirmationDialogData);
  }
}
