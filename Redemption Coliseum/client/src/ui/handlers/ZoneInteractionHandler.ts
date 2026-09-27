import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type ElementManager } from "../managers/ElementManager.js";
import { type DragDropHandler } from "./DragDropHandler.js";
import { type SettingsManager } from "../../managers/SettingsManager.js";
import { ZONE_HIGHLIGHT_STYLE } from "../config/visualConfig.js";
import { ViewportManager } from "../managers/ViewportManager.js";
import {
  hasCardOrPile,
  findTargetZone,
  getZoneLabel,
} from "./ZoneInteractionHelper.js";

/**
 * Handles desktop mouse hover (debounced) and mobile single-tap zone highlighting.
 * Respects inGameSupportEnabled setting and remains decoupled from card dragging.
 */
export class ZoneInteractionHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private elementManager: ElementManager;
  private dragDropHandler: DragDropHandler;
  private settingsManager?: SettingsManager;

  private currentHoveredZone: Phaser.GameObjects.Zone | null = null;
  private pendingHoverZone: Phaser.GameObjects.Zone | null = null;
  private hoverTimer: Phaser.Time.TimerEvent | null = null;
  private activeTapZone: Phaser.GameObjects.Zone | null = null;

  private touchStartPos: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private touchStartTime: number = 0;
  private touchDownOnCardOrPile: boolean = false;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    elementManager: ElementManager,
    dragDropHandler: DragDropHandler,
  ) {
    this.scene = scene;
    this.room = room;
    this.elementManager = elementManager;
    this.dragDropHandler = dragDropHandler;
    this.settingsManager = scene.registry.get("settingsManager") as
      | SettingsManager
      | undefined;
  }

  public registerHandlers(): void {
    this.scene.input.on("pointermove", this.onPointerMove, this);
    this.scene.input.on("pointerdown", this.onPointerDown, this);
    this.scene.input.on("pointerup", this.onPointerUp, this);
    this.scene.input.on("gameout", this.onGameOut, this);
    this.scene.events.on("ui:clear-hover", this.onClearHover, this);
    this.scene.game.events.on("settings-changed", this.onSettingsChanged, this);
  }

  public destroy(): void {
    this.scene.input.off("pointermove", this.onPointerMove, this);
    this.scene.input.off("pointerdown", this.onPointerDown, this);
    this.scene.input.off("pointerup", this.onPointerUp, this);
    this.scene.input.off("gameout", this.onGameOut, this);
    this.scene.events.off("ui:clear-hover", this.onClearHover, this);
    this.scene.game.events.off(
      "settings-changed",
      this.onSettingsChanged,
      this,
    );
    this.clearHoverHighlight();
    this.clearTapHighlight();
  }

  private isSupportEnabled(): boolean {
    const sm =
      this.settingsManager ||
      (this.scene.registry.get("settingsManager") as
        | SettingsManager
        | undefined);
    return sm ? sm.isInGameSupportEnabled() : true;
  }

  private onSettingsChanged(): void {
    if (!this.isSupportEnabled()) {
      this.clearHoverHighlight();
      this.clearTapHighlight();
    }
  }

  private onClearHover(): void {
    this.clearHoverHighlight();
    this.clearTapHighlight();
  }

  private onGameOut(): void {
    this.clearHoverHighlight();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (ViewportManager.isTouchPrimary() || pointer.wasTouch) return;
    if (this.dragDropHandler.isDragging) {
      this.clearHoverTimer();
      return;
    }
    if (!this.isSupportEnabled()) {
      this.clearHoverHighlight();
      return;
    }

    const hitObjects = this.scene.input.hitTestPointer(pointer);
    if (hasCardOrPile(hitObjects)) {
      this.clearHoverHighlight();
      return;
    }

    const targetZone = findTargetZone(hitObjects, pointer, this.elementManager);
    if (!targetZone) {
      this.clearHoverHighlight();
      return;
    }

    if (this.currentHoveredZone === targetZone) return;
    if (this.pendingHoverZone === targetZone) return;

    this.clearHoverTimer();
    this.clearHoverHighlight();
    this.pendingHoverZone = targetZone;

    this.hoverTimer = this.scene.time.delayedCall(
      ZONE_HIGHLIGHT_STYLE.HOVER_DELAY_MS,
      () => {
        if (
          this.pendingHoverZone === targetZone &&
          !this.dragDropHandler.isDragging &&
          this.isSupportEnabled()
        ) {
          this.currentHoveredZone = targetZone;
          const label = getZoneLabel(
            targetZone,
            this.elementManager,
            this.room.sessionId,
          );
          this.elementManager.showZoneHighlight(
            targetZone,
            label,
            ZONE_HIGHLIGHT_STYLE.COLOR,
          );
        }
      },
    );
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
  ): void {
    if (!pointer.wasTouch && !ViewportManager.isTouchPrimary()) return;

    this.touchStartPos.set(pointer.x, pointer.y);
    this.touchStartTime = Date.now();

    const hitObjects =
      gameObjects && gameObjects.length > 0
        ? gameObjects
        : this.scene.input.hitTestPointer(pointer);
    this.touchDownOnCardOrPile = hasCardOrPile(hitObjects);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch && !ViewportManager.isTouchPrimary()) return;
    if (this.dragDropHandler.isDragging) return;
    if (!this.isSupportEnabled()) {
      this.clearTapHighlight();
      return;
    }

    const duration = Date.now() - this.touchStartTime;
    const distance = pointer.position.distance(this.touchStartPos);

    if (duration >= 500) {
      this.clearTapHighlight();
      return;
    }
    if (distance >= 15 || this.touchDownOnCardOrPile) {
      this.clearTapHighlight();
      return;
    }

    const hitObjects = this.scene.input.hitTestPointer(pointer);
    if (hasCardOrPile(hitObjects)) {
      this.clearTapHighlight();
      return;
    }

    const targetZone = findTargetZone(hitObjects, pointer, this.elementManager);
    if (targetZone) {
      if (this.activeTapZone === targetZone) {
        this.clearTapHighlight();
      } else {
        this.activeTapZone = targetZone;
        const label = getZoneLabel(
          targetZone,
          this.elementManager,
          this.room.sessionId,
        );
        this.elementManager.showZoneHighlight(
          targetZone,
          label,
          ZONE_HIGHLIGHT_STYLE.COLOR,
        );
      }
    } else {
      this.clearTapHighlight();
    }
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      this.hoverTimer.remove();
      this.hoverTimer = null;
    }
  }

  public clearHoverHighlight(): void {
    this.pendingHoverZone = null;
    this.clearHoverTimer();
    if (this.currentHoveredZone) {
      this.currentHoveredZone = null;
      if (!this.activeTapZone) {
        this.elementManager.hideZoneHighlight();
      }
    }
  }

  public clearTapHighlight(): void {
    if (this.activeTapZone) {
      this.activeTapZone = null;
      if (!this.currentHoveredZone) {
        this.elementManager.hideZoneHighlight();
      }
    }
  }
}
