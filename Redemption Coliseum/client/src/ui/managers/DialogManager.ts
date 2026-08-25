import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import {
  type SelectionDialogData,
  type SelectedCardInfo,
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
    this.scene.events.on("net:searchResult", (msg: any) =>
      this.showSearchDialog(msg),
    );
    this.scene.events.on("net:revealedCardsAdded", () =>
      this.showRevealDialog(),
    );
    this.scene.events.on("net:revealedCardsRemoved", () =>
      this.closeOpponentRevealDialog(),
    );
    this.scene.events.on("net:gameError", (data: { message: string }) =>
      this.showErrorDialog(data.message),
    );
  }

  public showSearchDialog(message: any) {
    log(
      "Network",
      "Received 'presentPileSearchResult', launching dialog:",
      message,
    );
    log(
      "DialogManager",
      "presentPileSearchResult received:",
      { cards: message.cards.map((c: any) => ({ id: c.id, name: c.Name, zone: c.zone, isFaceUp: c.isFaceUp })), actionType: message.actionType, fromZone: message.zone }
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
      isMyAction: true,
      fromZone: message.zone,
      actionType: message.actionType,
      // Mirror the QuantitySelectionDialog choice: pre-select top/bottom toggles
      // so non-selected cards automatically return to the same deck position.
      initialPosition: message.position ?? "top",
      selectionRules: { min: isInteractive ? 1 : 0, max: Infinity },
      toZone: message.toZone || ZONES.DECK,

      possibleActions: message.possibleActions,

      onComplete: (result) => {
        const action = message.possibleActions?.find(
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

        log(
          "DialogManager",
          "onComplete - Sending resolveSearch to server:",
          { selectedCards: result.selectedCards.map((c: any) => c.id), remainingPositions: result.remainingPositions?.map((c: any) => c.id), toZone: result.toZone, coords: coords }
        );
        this.networkManager.sendResolveSearch(
          result.selectedCards,
          result.toZone,
          coords,
          result.remainingPositions,
        );
      },
      onCancel: (remainingPositions?: SelectedCardInfo[]) => {
        log(
          "DialogManager",
          "onCancel - Sending resolveSearch to server (empty selection):",
          { remainingPositions: remainingPositions?.map((c: any) => c.id) }
        );
        // Send the remaining positions so the server can put them back in the deck
        this.networkManager.sendResolveSearch([], ZONES.DECK, undefined, remainingPositions);
      },
    } as SelectionDialogData);
  }

  public showRevealDialog() {
    if (this.room.state.revealedCards.length === 0) return;

    const actionTakerId = this.room.state.actionTakerId;
    const isMyAction = actionTakerId === this.room.sessionId;

    // Für den ausführenden Spieler (Reveal-Aktionär) wird bereits showSearchDialog
    // über das presentPileSearchResult Event aufgerufen. Wir brechen hier ab,
    // um doppelt geöffnete Szenen und doppelte Close-Sounds zu verhindern.
    if (isMyAction) {
      return;
    }

    if (this.scene.scene.isActive("SelectionDialogScene")) {
      return;
    }

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: "Opponent's Revealed Cards",
      cards: [...this.room.state.revealedCards],
      room: this.room,
      showCloseButton: false, // Der Gegner hat kein Schließen-Symbol, Dialog schließt automatisch mit Aktionsende
      isMyAction: false,
      fromZone: ZONES.DECK,
      isInteractive: false,
      onComplete: () => {},
      toZone: ZONES.DECK,
      onCancel: () => {},
    } as SelectionDialogData);
  }


  /**
   * Displays a modal error dialog with an OK button.
   * @param message The error message to display.
   * @param onOk Optional callback function when the OK button is pressed.
   */
  public showErrorDialog(message: string, onOk?: () => void) {
    // ✨ FIX: Methode war bereits vorhanden, keine Änderung nötig.
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

  public closeOpponentRevealDialog() {
    const dialog = this.scene.scene.get("SelectionDialogScene") as SelectionDialogScene | undefined;
    if (dialog && !dialog.isMyAction) {
      log("DialogManager", "Closing opponent's passive reveal dialog automatically.");
      dialog.closeDialog(true);
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
