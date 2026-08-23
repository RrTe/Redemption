import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { RadialMenu } from "../components/RadialMenu.js";
import { type ElementManager } from "../managers/ElementManager.js";
import type { ActionIconConfig } from "../types/types.js";
import { CardUI } from "../CardUI.js";
import { PileUI } from "../PileUI.js";
import { StackedPileUI } from "../StackedPileUI.js";
import { ZONES, type Zone } from "../../../../shared/zones.js";
import { log } from "../../utils/logger.js";
import { DragDropHandler } from "./DragDropHandler.js";
import { type CardInteractionHandler } from "./CardInteractionHandler.js";
import { type PileInteractionHandler } from "./PileInteractionHandler.js";
import { ViewportManager } from "../managers/ViewportManager.js";

/**
 * Manages click, double-click, hover, and menu interactions.
 */
export class InteractionHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private cardInteractionHandler: CardInteractionHandler;
  private pileInteractionHandler: PileInteractionHandler;
  private dragDropHandler: DragDropHandler;
  private elementManager: ElementManager;

  private activeMenu: RadialMenu | null = null;
  private longPressTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    cardInteractionHandler: CardInteractionHandler,
    pileInteractionHandler: PileInteractionHandler,
    dragDropHandler: DragDropHandler,
    elementManager: ElementManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.cardInteractionHandler = cardInteractionHandler;
    this.pileInteractionHandler = pileInteractionHandler;
    this.dragDropHandler = dragDropHandler;
    this.elementManager = elementManager;
  }

  public registerHandlers() {
    this.scene.input.on("gameobjectover", this.onPointerOver, this);
    this.scene.input.on("gameobjectout", this.onPointerOut, this);
    this.scene.input.on("gameobjectdown", this.onGameObjectDown, this);
    this.scene.input.on("gameobjectup", this.onGameObjectUp, this);
    // ✨ Mobile: Background tap detection to clear hovers
    this.scene.input.on("pointerdown", this.onGlobalPointerDown, this);
    this.scene.events.on("ui:clear-hover", this.onClearHover, this);
  }

  public destroy() {
    this.scene.input.off("gameobjectover", this.onPointerOver, this);
    this.scene.input.off("gameobjectout", this.onPointerOut, this);
    this.scene.input.off("gameobjectdown", this.onGameObjectDown, this);
    this.scene.input.off("gameobjectup", this.onGameObjectUp, this);
    this.scene.input.off("pointerdown", this.onGlobalPointerDown, this);
    this.scene.events.off("ui:clear-hover", this.onClearHover, this);
    if (this.activeMenu) {
      this.activeMenu.close();
      this.activeMenu = null;
    }
  }

  private onClearHover() {
    this.cardInteractionHandler.clearHover();
  }

  private onGlobalPointerDown(
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
  ) {
    if (ViewportManager.isTouchPrimary() || pointer.wasTouch) {
      const clickedCard = gameObjects.find(go => go instanceof CardUI);
      if (!clickedCard) {
        this.cardInteractionHandler.clearHover();
      }
    }
  }

  private onPointerOver(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (this.dragDropHandler.isDragging) return;
    if (!(gameObject instanceof CardUI)) return;
    if (ViewportManager.isTouchPrimary() || pointer.wasTouch) return; // ✨ Mobile: Disable hover, use Single Tap instead
    this.cardInteractionHandler.handleHoverIn(gameObject);
  }

  private onPointerOut(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (!(gameObject instanceof CardUI)) return;
    if (ViewportManager.isTouchPrimary() || pointer.wasTouch) return; // ✨ Mobile: Ignore hover out
    this.cardInteractionHandler.handleHoverOut(gameObject);
  }

  private onGameObjectDown(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (pointer.rightButtonDown()) {
      this.openContextMenu(pointer, gameObject);
    } else if (pointer.wasTouch) {
      // ✨ Mobile: Long press detection for context menu
      const startPos = pointer.position.clone();
      this.longPressTimer = this.scene.time.delayedCall(500, () => {
        if (pointer.isDown && pointer.position.distance(startPos) < 15) {
          this.openContextMenu(pointer, gameObject);
        }
      });
    }
  }

  private openContextMenu(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    // ✨ Delegation an PileInteractionHandler
    const pileData = this.pileInteractionHandler.getPileDetails(gameObject);
    if (pileData) {
      this.activeMenu = this.pileInteractionHandler.openPileMenu(
        pointer,
        pileData.zone,
        pileData.targetId,
        () => {
          this.activeMenu = null;
        },
      );
    }
    // ✨ Delegation an CardInteractionHandler
    else if (
      gameObject instanceof CardUI &&
      this.cardInteractionHandler.isInteractable(gameObject)
    ) {
      this.activeMenu = this.cardInteractionHandler.openCardMenu(
        pointer,
        gameObject,
        () => {
          this.activeMenu = null;
        },
      );
    }
  }

  private onGameObjectUp(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (this.longPressTimer) {
      this.longPressTimer.remove();
      this.longPressTimer = null;
    }
    if (!(gameObject instanceof CardUI)) return;
    this.cardInteractionHandler.handlePointerUp(pointer, gameObject);
  }
}
