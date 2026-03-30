import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type NetworkManager } from "../../network/GameNetworkManager.js";
import { type AnimationManager } from "../managers/AnimationManager.js";
import { type PreviewManager } from "../managers/PreviewManager";
import { RadialMenu } from "../components/RadialMenu.js";
import type { ActionIconConfig } from "../types/types.js";
import { CardUI } from "../CardUI.js";
import { PileUI } from "../PileUI.js";
import { StackedPileUI } from "../StackedPileUI.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../../shared/zones.js";
import type { QuantitySelectionDialogData } from "../../scenes/QuantitySelectionDialogScene.js";
import { log } from "../../utils/logger.js";
import { DragDropHandler } from "./DragDropHandler.js";
import { MenuFactory } from "../factories/MenuFactory.js"; // ✨ REFACTOR

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
  private menuFactory: MenuFactory; // ✨ REFACTOR

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

    // ✨ REFACTOR: Instantiate the factory to create menu actions.
    this.menuFactory = new MenuFactory(scene, room, networkManager);
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

        const menuConfigs = this.menuFactory.getActionsForPile(
          searchZone,
          targetPlayerId,
        );

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
        this.networkManager.sendUpdateCardState({
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
        this.networkManager.sendUpdateCardState({
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

    const menuConfigs = this.menuFactory.getActionsForCard(card);

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
}
