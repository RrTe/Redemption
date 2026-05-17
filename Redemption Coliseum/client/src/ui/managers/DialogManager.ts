import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import {
  type SelectionDialogData,
  SelectionDialogScene,
} from "../../scenes/SelectionDialogScene";
import { ZONES, PILE_ZONES } from "../../../../shared/zones";
import type { MoveCardMessage } from "../../../../shared/messages";
import { log } from "../../utils/logger";

/**
 * Manages the creation and interaction with various game dialogs.
 */
export class DialogManager {
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

  public registerHandlers() {
    this.scene.events.on("net:searchResult", (msg: any) => this.showSearchDialog(msg));
    this.scene.events.on("net:revealedCardsAdded", () => this.showRevealDialog());
    this.scene.events.on("net:revealedCardsRemoved", () => this.closeSelectionDialog());
    this.scene.events.on("net:gameError", (data: { message: string }) => 
      this.showErrorDialog(data.message));
  }

  public showSearchDialog(message: any) {
    log(
      "Network",
      "Received 'presentPileSearchResult', launching dialog:",
      message,
    );

    const isInteractive =
      message.possibleActions && message.possibleActions.length > 0;

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: isInteractive ? "Select Cards" : "View Cards",
      cards: message.cards,
      room: this.room,
      showCloseButton: true,
      isInteractive: isInteractive,
      selectionRules: { min: isInteractive ? 1 : 0, max: Infinity },
      possibleActions: message.possibleActions,
      onComplete: (result) => {
        if (isInteractive) {
          const action = message.possibleActions.find(
            (a: any) => a.actionId === result.actionId,
          );
          let coords: MoveCardMessage["coords"] = undefined;
          const baseCoords = { x: 0, y: 0 };

          if (result.target) {
            const targetId =
              result.target === "opponent"
                ? this.findOpponentId()
                : this.room.sessionId;

            if (targetId) {
              coords = { ...baseCoords, targetPlayerId: targetId };
            }
          } else if (PILE_ZONES.includes(result.toZone)) {
            const originalPileOwnerId = message.cards[0]?.controllerId;
            coords = { ...baseCoords, targetPlayerId: originalPileOwnerId };
          } else if (action?.target === "opponent") {
            const opponentId = this.findOpponentId();
            if (opponentId) {
              coords = { ...baseCoords, targetPlayerId: opponentId };
            }
          } else {
            coords = { ...baseCoords, targetPlayerId: this.room.sessionId };
          }
          this.networkManager.sendResolveSearch(
            result.selectedCardIds,
            result.toZone,
            coords,
          );
        }
      },
      onCancel: () => {
        this.networkManager.sendResolveSearch([], ZONES.DECK);
      },
    } as SelectionDialogData);
  }

  public showRevealDialog() { // ✨ FIX: Titel für RevealDialog
    if (this.room.state.revealedCards.length === 0) return;

    const actionTakerId = this.room.state.actionTakerId;
    const isMyAction = actionTakerId === this.room.sessionId;

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: isMyAction ? "Your Revealed Cards" : "Opponent's Revealed Cards",
      cards: [...this.room.state.revealedCards],
      room: this.room,
      showCloseButton: isMyAction,
      isInteractive: false,
      onComplete: () => {},
      onCancel: () => {
        if (isMyAction) this.networkManager.sendResolveReveal();
      },
    } as SelectionDialogData);
  }

  /**
   * Displays a modal error dialog with an OK button.
   * @param message The error message to display.
   * @param onOk Optional callback function when the OK button is pressed.
   */
  public showErrorDialog(message: string, onOk?: () => void) { // ✨ FIX: Methode war bereits vorhanden, keine Änderung nötig.
    if (this.scene.scene.isActive("ErrorDialogScene")) {
      return; // Ensure only one error dialog is open at a time
    }

    this.scene.scene.launch("ErrorDialogScene", {
      message: message,
      onOk: () => {
        this.scene.scene.stop("ErrorDialogScene");
        onOk?.();
      },
    });
  }

  public closeSelectionDialog() {
    const dialog = this.scene.scene.get("SelectionDialogScene");
    if (dialog && dialog.scene.isActive()) {
      (dialog as SelectionDialogScene).closeDialog();
    }
  }

  private findOpponentId(): string | undefined {
    for (const sessionId of this.room.state.players.keys()) {
      if (sessionId !== this.room.sessionId) {
        return sessionId;
      }
    }
    return undefined;
  }
}
