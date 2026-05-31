import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import { type CardState } from "../../../../shared/types";
import { ZONES } from "../../../../shared/zones";
import {
  type SelectionDialogData,
  type SelectionAction,
} from "../../scenes/SelectionDialogScene";
import type { QuantitySelectionDialogData } from "../../scenes/QuantitySelectionDialogScene";
import { MapSchema } from "@colyseus/schema";
import { log } from "../../utils/logger";

/**
 * Manages the process of creating tokens, from selection to creation.
 */
export class TokenManager {
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

  public startTokenCreationProcess() {
    log("Input", "Token creation process started via TokenManager.");
    const cardData = this.scene.cache.json.get("carddata");
    if (!cardData || !cardData.cards) {
      log("TokenManager", "WARN: Card data 'carddata' not found in cache.");
      return;
    }

    const allTokens = cardData.cards.filter(
      (c: any) => c.Type && c.Type.includes("Token"),
    );

    const tokenPreviews = allTokens.map((tokenDef: any, index: number) => {
      return {
        id: `token_preview_${index}`,
        cardId: tokenDef.Name,
        Name: tokenDef.Name,
        Type: tokenDef.Type,
        ImageFile: tokenDef.ImageFile,
        controllerId: this.room.sessionId,
        originalOwnerId: this.room.sessionId,
        zone: "selection",
        faceUp: true,
        isFlipped: false,
        isTapped: false,
        x: 0,
        y: 0,
        lastMoved: 0,
        counters: new MapSchema(),
        attachedTo: null,
      } as unknown as CardState;
    });

    const possibleActions: SelectionAction[] = [
      {
        label: "My Territory",
        actionId: "my_territory",
        toZone: ZONES.TERRITORY,
        target: "me",
      },
      {
        label: "My LoB",
        actionId: "my_lob",
        toZone: ZONES.LAND_OF_BONDAGE,
        target: "me",
      },
      {
        label: "Opp Territory",
        actionId: "opp_territory",
        toZone: ZONES.TERRITORY,
        target: "opponent",
      },
      {
        label: "Opp LoB",
        actionId: "opp_lob",
        toZone: ZONES.LAND_OF_BONDAGE,
        target: "opponent",
      },
    ];

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: "Select a Token",
      cards: tokenPreviews,
      room: this.room,
      showCloseButton: true,
      isInteractive: true,
      selectionRules: { min: 1, max: 99 },
      possibleActions: possibleActions,
      onComplete: (result: any) => {
        this.scene.scene.stop("SelectionDialogScene");

        // Enrich result with action data (toZone, target)
        const action = possibleActions.find(
          (a) => a.actionId === result.actionId,
        );
        const enrichedResult = {
          ...result,
          toZone: result.toZone || action?.toZone,
          target: result.target || action?.target,
        };

        if (
          enrichedResult.selectedCards.length > 0 &&
          enrichedResult.actionId
        ) {
          this.launchQuantityDialog(enrichedResult, tokenPreviews);
        } else {
          this.scene.scene.resume("CardGame");
        }
      },
      onCancel: () => {
        this.scene.scene.stop("SelectionDialogScene");
        this.scene.scene.resume("CardGame");
      },
    } as SelectionDialogData);
  }

  private launchQuantityDialog(
    selectionResult: any,
    tokenPreviews: CardState[],
  ) {
    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("QuantitySelectionDialogScene", {
      title: "How many Tokens?",
      maxCount: 20,
      minCount: 1,
      enablePositionSelection: false,
      onConfirm: (count: number) => {
        this.scene.scene.stop("QuantitySelectionDialogScene");
        this.createTokens(selectionResult, tokenPreviews, count);
        this.scene.scene.resume("CardGame");
      },
      onCancel: () => {
        this.scene.scene.stop("QuantitySelectionDialogScene");
        this.scene.scene.resume("CardGame");
      },
    } as QuantitySelectionDialogData);
  }

  private createTokens(
    selectionResult: any,
    tokenPreviews: CardState[],
    count: number,
  ) {
    selectionResult.selectedCards.forEach((selected: any) => {
      // selected is { id: string, position: string }
      const selectedId = typeof selected === "string" ? selected : selected.id;
      const selectedToken = tokenPreviews.find((t: any) => t.id === selectedId);

      if (selectedToken) {
        const opponentId = this.findOpponentId();
        const targetOwnerId =
          selectionResult.target === "opponent"
            ? opponentId
            : this.room.sessionId;

        if (targetOwnerId) {
          for (let i = 0; i < count; i++) {
            this.networkManager.sendCreateToken({
              cardId: selectedToken.Name,
              zone: selectionResult.toZone,
              ownerId: targetOwnerId,
            });
          }
        }
      }
    });
  }

  private findOpponentId(): string | undefined {
    for (const sessionId of this.room.state.players.keys()) {
      if (sessionId !== this.room.sessionId) return sessionId;
    }
    return undefined;
  }
}
