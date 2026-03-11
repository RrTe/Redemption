import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type NetworkManager } from "../../network/NetworkManager.js";
import type { ActionIconConfig } from "../types/types.js";
import { CardUI } from "../CardUI.js";
import { ZONES, type Zone } from "../../../../shared/zones.js";
import type { QuantitySelectionDialogData } from "../../scenes/QuantitySelectionDialogScene.js";
import { log } from "../../utils/logger";

/**
 * Creates action configurations for radial menus.
 */
export class MenuFactory {
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

  public getActionsForPile(
    zone: Zone,
    targetPlayerId?: string,
  ): ActionIconConfig[] {
    const menuConfigs: ActionIconConfig[] = [];

    menuConfigs.push({
      iconKey: "icon_search",
      actionKey: "search",
      callback: () => {
        log(
          "Input",
          `[RadialMenu] Action 'search' triggered for ${zone} of ${targetPlayerId}`,
        );
        this.networkManager.sendRequestSearchPile(zone, targetPlayerId);
      },
    });

    menuConfigs.push({
      iconKey: "icon_look",
      actionKey: "look",
      callback: () => {
        log(
          "Input",
          `[RadialMenu] Action 'look' triggered for ${zone} of ${
            targetPlayerId || "self"
          }`,
        );
        const pId = targetPlayerId || this.room.sessionId;
        const player = this.room.state.players.get(pId);
        if (!player) return;
        const pile = (player as any)[zone];
        const maxCount = pile?.length || 0;
        if (maxCount === 0) return;
        this.openQuantityDialog("View Cards", maxCount, (count, position) => {
          this.networkManager.sendLookAtCards(
            zone,
            count,
            position,
            targetPlayerId,
          );
        });
      },
    });

    menuConfigs.push({
      iconKey: "icon_reveal",
      actionKey: "reveal",
      callback: () => {
        log(
          "Input",
          `[RadialMenu] Action 'reveal' triggered for ${zone} of ${
            targetPlayerId || "self"
          }`,
        );
        const pId = targetPlayerId || this.room.sessionId;
        const player = this.room.state.players.get(pId);
        if (!player) return;
        const pile = (player as any)[zone];
        const maxCount = pile?.length || 0;
        if (maxCount === 0) return;
        this.openQuantityDialog("Reveal Cards", maxCount, (count, position) => {
          this.networkManager.sendRevealCards(
            zone,
            count,
            position,
            targetPlayerId,
          );
        });
      },
    });

    if (zone === ZONES.DECK || zone === ZONES.RESERVE) {
      menuConfigs.push({
        iconKey: "icon_shuffle",
        actionKey: "shuffle",
        callback: () => {
          log("Input", `[RadialMenu] Action 'shuffle' triggered for ${zone}`);
          this.room.send("shufflePile", { zone: zone });
        },
      });
    }

    if (zone === ZONES.DECK) {
      menuConfigs.push({
        iconKey: "icon_discard",
        actionKey: "discard",
        callback: () => {
          log(
            "Input",
            `[RadialMenu] Action 'discard' triggered for ${zone} of ${
              targetPlayerId || "self"
            }`,
          );
          const pId = targetPlayerId || this.room.sessionId;
          const player = this.room.state.players.get(pId);
          if (!player) return;
          const pile = (player as any)[zone];
          const maxCount = pile?.length || 0;
          if (maxCount === 0) return;
          this.openQuantityDialog(
            "Discard Cards",
            maxCount,
            (count, position) => {
              let cardsToDiscard: any[] = [];
              if (position === "top") {
                cardsToDiscard = pile.slice(0, count);
              } else {
                cardsToDiscard = pile.slice(-count);
              }
              cardsToDiscard.forEach((card: any) => {
                this.networkManager.sendMoveCard({
                  from: ZONES.DECK,
                  to: ZONES.DISCARD,
                  cardId: card.id,
                });
              });
            },
          );
        },
      });
    }

    return menuConfigs;
  }

  public getActionsForCard(card: CardUI): ActionIconConfig[] {
    const menuConfigs: ActionIconConfig[] = [
      {
        iconKey: "icon_turn",
        actionKey: "turn",
        callback: () => {
          this.room.send("updateCardState", {
            cardId: card.cardData.id,
            updates: { isFaceDown: !card.cardData.isFaceDown },
          });
        },
      },
      {
        iconKey: "icon_flip",
        actionKey: "flip",
        callback: () => {
          this.room.send("updateCardState", {
            cardId: card.cardData.id,


            updates: { isFlipped: !card.cardData.isFlipped },
          });
        },
      },
      {
        iconKey: "icon_paralyze",
        actionKey: "paralyze",
        callback: () => {
          this.openCounterDialog(card, "paralyze", "Paralyze Value");
        },
      },
      {
        iconKey: "icon_setaside",
        actionKey: "setaside",
        callback: () => {
          this.openCounterDialog(card, "setaside", "Set Aside Value");
        },
      },
    ];
    return menuConfigs;
  }

  private openQuantityDialog(
    title: string,
    maxCount: number,
    onConfirm: (count: number, position: "top" | "bottom") => void,
  ) {
    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("QuantitySelectionDialogScene", {
      title: title,
      maxCount: maxCount,
      onConfirm: (count, position) => {
        onConfirm(count, position);
      },
      onCancel: () => {
        this.scene.scene.resume("CardGame");
      },
    } as QuantitySelectionDialogData);
  }

  private openCounterDialog(card: CardUI, counterKey: string, title: string) {
    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("QuantitySelectionDialogScene", {
      title: title,
      maxCount: 99,
      minCount: 0,
      enablePositionSelection: false,
      onConfirm: (count: number) => {
        this.room.send("updateCardState", {
          cardId: card.cardData.id,
          updates: { counters: { [counterKey]: count } },
        });
      },
      onCancel: () => {
        this.scene.scene.resume("CardGame");
      },
    } as QuantitySelectionDialogData);
  }
}