import Phaser from "phaser";
import { type TypedRoom } from "./gameUI.js";
import { type NetworkManager } from "../network/NetworkManager.js";
import { type AnimationManager } from "./AnimationManager.js";
import { type PreviewManager } from "./PreviewManager.js";
import { RadialMenu } from "./components/RadialMenu.js";
import type { ActionIconConfig } from "./types/types.js";
import { CardUI } from "./CardUI.js";
import { PileUI } from "./PileUI.js";
import { StackedPileUI } from "./StackedPileUI.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type { QuantitySelectionDialogData } from "../scenes/QuantitySelectionDialogScene.js";
import { log } from "../utils/logger";
import { DragDropHandler } from "./DragDropHandler.js";

/**
 * Manages click, double-click, hover, and menu interactions.
 */
export class InteractionHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: NetworkManager;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private dragDropHandler: DragDropHandler;

  private lastClickTime: number = 0;
  private lastClickedCardId: string | null = null;
  private activeMenu: RadialMenu | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    dragDropHandler: DragDropHandler,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.dragDropHandler = dragDropHandler;
  }

  public registerHandlers() {
    this.scene.input.on("gameobjectover", this.onPointerOver, this);
    this.scene.input.on("gameobjectout", this.onPointerOut, this);
    this.scene.input.on("gameobjectdown", this.onGameObjectDown, this);
    this.scene.input.on("gameobjectup", this.onGameObjectUp, this);
  }

  public destroy() {
    this.scene.input.off("gameobjectover", this.onPointerOver, this);
    this.scene.input.off("gameobjectout", this.onPointerOut, this);
    this.scene.input.off("gameobjectdown", this.onGameObjectDown, this);
    this.scene.input.off("gameobjectup", this.onGameObjectUp, this);
    if (this.activeMenu) {
      this.activeMenu.close();
      this.activeMenu = null;
    }
  }

  private onPointerOver(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (this.dragDropHandler.isDragging) {
      if (!pointer.isDown) {
        this.dragDropHandler.isDragging = false;
      } else {
        return;
      }
    }

    if (this.animationManager.activeDrawTweens.size > 0) {
      return;
    }

    if (!(gameObject instanceof CardUI)) return;

    const card = gameObject;
    this.previewManager.show(card, this.room.sessionId);

    const isMyHandCard =
      card.currentZone === ZONES.HAND &&
      card.cardData.controllerId === this.room.sessionId;

    if (isMyHandCard) {
      this.animationManager.playHandHoverAnimation(card);
      this.scene.game.events.emit("playSound", "CARD_HOVER");
    } else if (
      [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
        card.currentZone,
      )
    ) {
      this.scene.game.events.emit("playSound", "CARD_HOVER_FIELD");
      this.animationManager.playTerritoryHoverAnimation(card);
    }

    card.startGlow();
  }

  private onPointerOut(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (!(gameObject instanceof CardUI)) return;

    const card = gameObject;
    this.previewManager.hide();

    const isMyHandCard =
      card.currentZone === ZONES.HAND &&
      card.cardData.controllerId === this.room.sessionId;

    if (isMyHandCard) {
      this.animationManager.playHandHoverOutAnimation(card);
    } else if (
      [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
        card.currentZone,
      )
    ) {
      this.animationManager.playTerritoryHoverOutAnimation(card);
    }

    if (!card.isBeingDragged) {
      card.stopGlow();
    }
  }

  private onGameObjectDown(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    log(
      "Input",
      `gameobjectdown on ${gameObject.constructor.name} (RightBtn: ${pointer.rightButtonDown()})`,
    );

    if (pointer.rightButtonDown()) {
      let searchZone: Zone | undefined;
      let targetPlayerId: string | undefined;

      if (gameObject instanceof PileUI || gameObject instanceof StackedPileUI) {
        searchZone = gameObject.name as Zone;
        targetPlayerId = gameObject.getData("ownerId");
      } else if (gameObject instanceof Phaser.GameObjects.Zone) {
        if (gameObject.name === ZONES.HAND) {
          const ownerId = gameObject.getData("ownerId");
          if (ownerId && ownerId !== this.room.sessionId) {
            searchZone = ZONES.HAND;
            targetPlayerId = ownerId;
          }
        }
      } else if (gameObject instanceof CardUI) {
        const cardZone = gameObject.cardData.zone as Zone;
        const isOpponentHand =
          cardZone === ZONES.HAND &&
          gameObject.cardData.controllerId !== this.room.sessionId;

        if (PILE_ZONES.includes(cardZone) || isOpponentHand) {
          searchZone = cardZone;
          targetPlayerId = gameObject.cardData.controllerId;
        } else if (cardZone !== ZONES.HAND) {
          this.openCardRadialMenu(pointer, gameObject);
          return;
        }
      }

      if (searchZone) {
        log(
          "Input",
          `Right-clicked on searchable zone: ${searchZone} of player ${targetPlayerId}`,
        );

        if (searchZone !== ZONES.HAND) {
          const pId = targetPlayerId || this.room.sessionId;
          const player = this.room.state.players.get(pId);
          if (player) {
            const pile = (player as any)[searchZone!];
            if (!pile || pile.length === 0) {
              log(
                "Input",
                `Pile ${searchZone} is empty. Not opening radial menu.`,
              );
              return;
            }
          }
        }

        if (
          searchZone === ZONES.HAND &&
          targetPlayerId !== this.room.sessionId
        ) {
          this.networkManager.sendRequestSearchPile(searchZone, targetPlayerId);
          return;
        }

        if (this.activeMenu) {
          this.activeMenu.close();
          return;
        }

        const menuConfigs: ActionIconConfig[] = [];

        menuConfigs.push({
          iconKey: "icon_search",
          actionKey: "search",
          callback: () => {
            log(
              "Input",
              `[RadialMenu] Action 'search' triggered for ${searchZone} of ${targetPlayerId}`,
            );
            this.networkManager.sendRequestSearchPile(
              searchZone!,
              targetPlayerId,
            );
          },
        });

        menuConfigs.push({
          iconKey: "icon_look",
          actionKey: "look",
          callback: () => {
            log(
              "Input",
              `[RadialMenu] Action 'look' triggered for ${searchZone} of ${
                targetPlayerId || "self"
              }`,
            );

            const pId = targetPlayerId || this.room.sessionId;
            const player = this.room.state.players.get(pId);
            if (!player) return;
            const pile = (player as any)[searchZone!];
            const maxCount = pile?.length || 0;

            if (maxCount === 0) return;

            this.scene.scene.pause("CardGame");
            this.scene.scene.launch("QuantitySelectionDialogScene", {
              title: "View Cards",
              maxCount: maxCount,
              onConfirm: (count, position) => {
                this.networkManager.sendLookAtCards(
                  searchZone!,
                  count,
                  position,
                  targetPlayerId,
                );
              },
              onCancel: () => {
                this.scene.scene.resume("CardGame");
              },
            } as QuantitySelectionDialogData);
          },
        });

        menuConfigs.push({
          iconKey: "icon_reveal",
          actionKey: "reveal",
          callback: () => {
            log(
              "Input",
              `[RadialMenu] Action 'reveal' triggered for ${searchZone} of ${
                targetPlayerId || "self"
              }`,
            );

            const pId = targetPlayerId || this.room.sessionId;
            const player = this.room.state.players.get(pId);
            if (!player) return;
            const pile = (player as any)[searchZone!];
            const maxCount = pile?.length || 0;

            if (maxCount === 0) return;

            this.scene.scene.pause("CardGame");
            this.scene.scene.launch("QuantitySelectionDialogScene", {
              title: "Reveal Cards",
              maxCount: maxCount,
              onConfirm: (count, position) => {
                this.networkManager.sendRevealCards(
                  searchZone!,
                  count,
                  position,
                  targetPlayerId,
                );
              },
              onCancel: () => {
                this.scene.scene.resume("CardGame");
              },
            } as QuantitySelectionDialogData);
          },
        });

        if (searchZone === ZONES.DECK || searchZone === ZONES.RESERVE) {
          menuConfigs.push({
            iconKey: "icon_shuffle",
            actionKey: "shuffle",
            callback: () => {
              log(
                "Input",
                `[RadialMenu] Action 'shuffle' triggered for ${searchZone}`,
              );
              this.room.send("shufflePile", { zone: searchZone });
            },
          });
        }

        if (searchZone === ZONES.DECK) {
          menuConfigs.push({
            iconKey: "icon_discard",
            actionKey: "discard",
            callback: () => {
              log(
                "Input",
                `[RadialMenu] Action 'discard' triggered for ${searchZone} of ${
                  targetPlayerId || "self"
                }`,
              );

              const pId = targetPlayerId || this.room.sessionId;
              const player = this.room.state.players.get(pId);
              if (!player) return;
              const pile = (player as any)[searchZone!];
              const maxCount = pile?.length || 0;

              if (maxCount === 0) return;

              this.scene.scene.pause("CardGame");
              this.scene.scene.launch("QuantitySelectionDialogScene", {
                title: "Discard Cards",
                maxCount: maxCount,
                onConfirm: (count, position) => {
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
                onCancel: () => {
                  this.scene.scene.resume("CardGame");
                },
              } as QuantitySelectionDialogData);
            },
          });
        }

        const radius = 80;
        const iconSize =
          Math.min(this.scene.scale.width, this.scene.scale.height) / 12;
        const menuRadius = radius + iconSize / 2;

        let cx = pointer.x;
        let cy = pointer.y;

        cx = Phaser.Math.Clamp(
          cx,
          menuRadius,
          this.scene.scale.width - menuRadius,
        );
        cy = Phaser.Math.Clamp(
          cy,
          menuRadius,
          this.scene.scale.height - menuRadius,
        );

        this.activeMenu = new RadialMenu(
          this.scene,
          cx,
          cy,
          radius,
          menuConfigs,
          () => {
            this.activeMenu = null;
          },
        );

        pointer.event.stopPropagation();
      }
    }
  }

  private onGameObjectUp(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    log("Input", `gameobjectup on ${gameObject.constructor.name}`);

    if (!(gameObject instanceof CardUI)) return;

    const card = gameObject as CardUI;
    const zone = card.currentZone;

    if (
      zone !== ZONES.TERRITORY &&
      zone !== ZONES.LAND_OF_BONDAGE &&
      zone !== ZONES.HAND
    ) {
      return;
    }

    if (pointer.rightButtonReleased()) {
      if (zone === ZONES.HAND) {
        log("Input", `Right Click detected on Hand Card ${card.cardData.id}`);
        this.room.send("updateCardState", {
          cardId: card.cardData.id,
          updates: { isFlipped: !card.cardData.isFlipped },
        });
      }
      return;
    }

    if (pointer.leftButtonReleased()) {
      const now = Date.now();
      log("Input", `Left Click on Card. Delta: ${now - this.lastClickTime}ms`);
      if (
        this.lastClickedCardId === card.cardData.id &&
        now - this.lastClickTime < 300
      ) {
        this.room.send("updateCardState", {
          cardId: card.cardData.id,
          updates: { isFaceDown: !card.cardData.isFaceDown },
        });
        this.lastClickedCardId = null;
      } else {
        this.lastClickedCardId = card.cardData.id;
      }
      this.lastClickTime = now;
    }
  }

  private openCardRadialMenu(pointer: Phaser.Input.Pointer, card: CardUI) {
    if (this.activeMenu) {
      this.activeMenu.close();
      return;
    }

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

    const radius = 80;
    const iconSize =
      Math.min(this.scene.scale.width, this.scene.scale.height) / 12;
    const menuRadius = radius + iconSize / 2;

    let cx = Phaser.Math.Clamp(
      pointer.x,
      menuRadius,
      this.scene.scale.width - menuRadius,
    );
    let cy = Phaser.Math.Clamp(
      pointer.y,
      menuRadius,
      this.scene.scale.height - menuRadius,
    );

    this.activeMenu = new RadialMenu(
      this.scene,
      cx,
      cy,
      radius,
      menuConfigs,
      () => {
        this.activeMenu = null;
      },
    );

    pointer.event.stopPropagation();
  }

  private openCounterDialog(card: CardUI, counterKey: string, title: string) {
    const currentVal = (card.cardData.counters as any).get(counterKey) || 0;

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
