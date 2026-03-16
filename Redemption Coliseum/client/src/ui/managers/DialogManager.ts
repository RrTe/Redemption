import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type NetworkManager } from "../../network/NetworkManager";
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
  private networkManager: NetworkManager;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
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

  public showRevealDialog() {
    if (this.room.state.revealedCards.length === 0) return;

    const actionTakerId = this.room.state.actionTakerId;
    const isMyAction = actionTakerId === this.room.sessionId;

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: "Revealed Cards",
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
