import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type NetworkManager } from "../../network/GameNetworkManager.js";
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

    menuConfigs.push(this._createSearchAction(zone, targetPlayerId));
    menuConfigs.push(this._createLookAction(zone, targetPlayerId));
    menuConfigs.push(this._createRevealAction(zone, targetPlayerId));

    if (zone === ZONES.DECK || zone === ZONES.RESERVE) {
      menuConfigs.push(this._createShuffleAction(zone));
    }

    if (zone === ZONES.DECK) {
      menuConfigs.push(this._createDiscardAction(zone, targetPlayerId));
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

  private _createSearchAction(
    zone: Zone,
    targetPlayerId?: string,
  ): ActionIconConfig {
    return {
      iconKey: "icon_search",
      actionKey: "search",
      callback: () => {
        log(
          "Input",
          `[RadialMenu] Action 'search' triggered for ${zone} of ${targetPlayerId}`,
        );
        this.networkManager.sendRequestSearchPile(zone, targetPlayerId);
      },
    };
  }

  private _createLookAction(
    zone: Zone,
    targetPlayerId?: string,
  ): ActionIconConfig {
    return {
      iconKey: "icon_look",
      actionKey: "look",
      callback: () => {
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
    };
  }

  private _createRevealAction(
    zone: Zone,
    targetPlayerId?: string,
  ): ActionIconConfig {
    return {
      iconKey: "icon_reveal",
      actionKey: "reveal",
      callback: () => {
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
    };
  }

  private _createShuffleAction(zone: Zone): ActionIconConfig {
    return {
      iconKey: "icon_shuffle",
      actionKey: "shuffle",
      callback: () => {
        this.room.send("shufflePile", { zone: zone });
      },
    };
  }

  private _createDiscardAction(
    zone: Zone,
    targetPlayerId?: string,
  ): ActionIconConfig {
    return {
      iconKey: "icon_discard",
      actionKey: "discard",
      callback: () => {
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
            // The actual discard logic is now on the server for consistency.
            this.room.send("discardFromDeck", {
              count,
              position,
              targetPlayerId,
            });
          },
        );
      },
    };
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
