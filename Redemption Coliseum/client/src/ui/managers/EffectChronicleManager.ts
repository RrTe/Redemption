// client/src/ui/managers/EffectChronicleManager.ts
import { type Room } from "colyseus.js";
import { type RoomState, type ChronicleItemData } from "../../../../shared/types";

import { type GameLayout } from "../layout";
import { type CardRenderer } from "../renderers/CardRenderer";
import { EffectChronicleEffect } from "../effects/EffectChronicleEffect";
import { EffectChronicleFlyoutUI } from "../overlays/EffectChronicleFlyoutUI";
import { EffectChronicleHandler } from "../handlers/EffectChronicleHandler";
import { SettingsManager } from "../../managers/SettingsManager";
import { EFFECT_CHRONICLE_CONFIG } from "../config/visualConfig";
import { log } from "../../utils/logger";

/**
 * State orchestrator for Effect Chronicle.
 * Coordinates Colyseus synchronization, mode switching (Support vs. Tournament),
 * Phaser animations, and DOM flyout interactions.
 */
export class EffectChronicleManager {
  private room: Room<RoomState>;
  private scene: Phaser.Scene;
  private effect: EffectChronicleEffect;
  private flyout: EffectChronicleFlyoutUI;
  private handler: EffectChronicleHandler;
  private settingsManager: SettingsManager;
  private cardRenderer?: CardRenderer;
  private mySessionId: string;
  private currentLayout: GameLayout | null = null;
  private onPhaseLockCallback: ((locked: boolean) => void) | null = null;
  private knownItemIds = new Set<string>();

  constructor(
    room: Room<RoomState>,
    scene: Phaser.Scene,
    settingsManager: SettingsManager,
    cardRenderer?: CardRenderer
  ) {
    this.room = room;
    this.scene = scene;
    this.settingsManager = settingsManager;
    this.cardRenderer = cardRenderer;
    this.mySessionId = room.sessionId;

    this.effect = new EffectChronicleEffect(scene);
    this.flyout = new EffectChronicleFlyoutUI();
    this.handler = new EffectChronicleHandler(room);

    this._bindEvents();
    this._initColyseusListeners();
  }


  public setOnPhaseLockCallback(cb: (locked: boolean) => void): void {
    this.onPhaseLockCallback = cb;
  }

  /**
   * Updates layout and repositions the Chronicle Icon beside the active deck.
   */
  public updateLayout(layout: GameLayout): void {
    this.currentLayout = layout;
    this._updateIconPosition();
  }

  /**
   * Animates a card entering the Chronicle.
   */
  public playCardFlight(
    startX: number,
    startY: number,
    cardTexture: string,
    width?: number,
    height?: number,
    rotation?: number,
    onComplete?: () => void
  ): void {
    if (!this.settingsManager.isInGameSupportEnabled()) {
      onComplete?.();
      return;
    }
    this.effect.playCardFlightAnimation(startX, startY, cardTexture, width, height, rotation, onComplete);
  }

  public hasPendingItems(): boolean {
    const chronicle = this.room.state?.effectChronicle;
    return Boolean(chronicle && chronicle.items && chronicle.items.length > 0);
  }

  public destroy(): void {
    this.scene.events.off("playChronicleFlight", this._onPlayFlight, this);
    this.effect.destroy();
    this.flyout.destroy();
  }

  private _bindEvents(): void {
    // When icon is clicked in Phaser, toggle DOM flyout drawer if in support mode
    this.effect.setOnClickCallback(() => {
      if (this.settingsManager.isInGameSupportEnabled()) {
        this.flyout.toggle();
      }
    });

    this.scene.events.on("playChronicleFlight", this._onPlayFlight, this);

    // Wire flyout actions to network handler
    this.flyout.onExecuteCallback = (itemId) => {
      this.handler.executeItem(itemId);
    };

    this.flyout.onPassCallback = (itemId) => {
      this.handler.passItem(itemId);
    };

    this.flyout.onPassAllCallback = () => {
      this.handler.passAll();
    };
  }

  private _onPlayFlight(data: { x: number; y: number; texture: string; width?: number; height?: number; rotation?: number }): void {
    if (data && typeof data.x === "number" && typeof data.y === "number") {
      this.playCardFlight(data.x, data.y, data.texture, data.width, data.height, data.rotation);
    }
  }

  private _initColyseusListeners(): void {
    this.room.onStateChange(() => {
      this._updateIconPosition();
      this._syncChronicleState();
    });
  }

  private _syncChronicleState(): void {
    const chronicle = this.room.state?.effectChronicle;
    if (!chronicle) return;

    const items: ChronicleItemData[] = [];
    chronicle.items.forEach((item, index) => {
      items.push({
        id: item.id,
        cardId: item.cardId,
        controllerId: item.controllerId,
        actionType: item.actionType,
        title: item.title,
        description: item.description,
        status: item.status as any,
        order: item.order || index + 1,
        abilityId: item.abilityId,
        isOptional: (item as any).isOptional ?? false,
      });
    });

    const hasPriority = chronicle.priorityPlayerId === this.mySessionId;
    const isSupport = this.settingsManager.isInGameSupportEnabled();

    // 1. Detect newly added items and animate opponent entries
    let opponentStaggerIndex = 0;
    chronicle.items.forEach((item) => {
      if (!this.knownItemIds.has(item.id)) {
        this.knownItemIds.add(item.id);
        if (item.controllerId && item.controllerId !== this.mySessionId) {
          this._animateOpponentItemFlight(item, opponentStaggerIndex * EFFECT_CHRONICLE_CONFIG.CARD_FLIGHT_STAGGER_MS);
          opponentStaggerIndex++;
        }
      }
    });

    // Clean up known items no longer in chronicle
    const activeIds = new Set(chronicle.items.map((it) => it.id));
    for (const id of this.knownItemIds) {
      if (!activeIds.has(id)) {
        this.knownItemIds.delete(id);
      }
    }

    // 2. Update visual icon & badge count (visible in both modes when items > 0)
    this.effect.setCount(items.length);

    // 3. Update flyout drawer
    if (isSupport) {
      this.flyout.updateItems(items, hasPriority);
      if (items.length === 0 && this.flyout.isOpen()) {
        this.flyout.hide();
      }
    } else {
      if (this.flyout.isOpen()) {
        this.flyout.hide();
      }
    }

    // 4. Update next phase button lock
    this.onPhaseLockCallback?.(items.length > 0);
    log("EffectChronicleManager", `Synced ${items.length} items (hasPriority=${hasPriority}, isSupport=${isSupport})`);
  }

  private _animateOpponentItemFlight(item: ChronicleItemData, delayMs = 0): void {
    const trigger = () => {
      let x = 0;
      let y = 0;
      let width = this.currentLayout?.cardWidth ?? 70;
      let height = this.currentLayout?.cardHeight ?? 100;
      let rotation = 0;
      let texture = "cardback";

      const c = this.cardRenderer?.getCardUI(item.cardId);
      if (c) {
        const matrix = c.getWorldTransformMatrix();
        x = matrix.tx;
        y = matrix.ty;
        width = (c.displayWidth && c.displayWidth > 0) ? c.displayWidth : (c.width * (c.scaleX || 1));
        height = (c.displayHeight && c.displayHeight > 0) ? c.displayHeight : (c.height * (c.scaleY || 1));
        rotation = c.rotation || 0;
        texture = c.cardData.isFaceDown || !c.cardData.ImageFile ? "cardback" : `card-${c.cardData.ImageFile}`;
      } else if (this.currentLayout) {
        x = this.currentLayout.opponentHand.centerX;
        y = this.currentLayout.opponentHand.centerY;
      }

      this.playCardFlight(x, y, texture, width, height, rotation);
    };

    if (delayMs > 0) {
      this.scene.time.delayedCall(delayMs, trigger);
    } else {
      trigger();
    }
  }

  private _updateIconPosition(): void {
    if (!this.currentLayout) return;

    const chronicle = this.room.state?.effectChronicle;
    const isOpponentPriority = chronicle && chronicle.priorityPlayerId && chronicle.priorityPlayerId !== this.mySessionId;

    const targetDeckRect = isOpponentPriority
      ? this.currentLayout.opponentDeckPile
      : this.currentLayout.playerDeckPile;

    if (targetDeckRect) {
      this.effect.updatePosition(targetDeckRect, Boolean(isOpponentPriority));
    }
  }
}
