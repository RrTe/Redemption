// client/src/ui/managers/EffectChronicleManager.ts
import { type Room } from "colyseus.js";
import { type RoomState, type ChronicleItemData } from "../../../../shared/types";

import { type GameLayout } from "../layout";
import { EffectChronicleEffect } from "../effects/EffectChronicleEffect";
import { EffectChronicleFlyoutUI } from "../overlays/EffectChronicleFlyoutUI";
import { EffectChronicleHandler } from "../handlers/EffectChronicleHandler";
import { SettingsManager } from "../../managers/SettingsManager";
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
  private mySessionId: string;
  private currentLayout: GameLayout | null = null;
  private onPhaseLockCallback: ((locked: boolean) => void) | null = null;

  constructor(
    room: Room<RoomState>,
    scene: Phaser.Scene,
    settingsManager: SettingsManager
  ) {
    this.room = room;
    this.scene = scene;
    this.settingsManager = settingsManager;
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
      });
    });

    const hasPriority = chronicle.priorityPlayerId === this.mySessionId;
    const isSupport = this.settingsManager.isInGameSupportEnabled();

    // 1. Update visual icon & badge count
    if (isSupport) {
      this.effect.setCount(items.length);
    } else {
      this.effect.setCount(0); // Invisible in tournament mode
    }

    // 2. Update flyout drawer
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

    // 3. Update next phase button lock
    this.onPhaseLockCallback?.(items.length > 0);
    log("EffectChronicleManager", `Synced ${items.length} items (hasPriority=${hasPriority}, isSupport=${isSupport})`);
  }

  private _updateIconPosition(): void {
    if (!this.currentLayout) return;

    const chronicle = this.room.state?.effectChronicle;
    const isOpponentPriority = chronicle && chronicle.priorityPlayerId && chronicle.priorityPlayerId !== this.mySessionId;

    const targetDeckRect = isOpponentPriority
      ? this.currentLayout.opponentDeckPile
      : this.currentLayout.playerDeckPile;

    if (targetDeckRect) {
      this.effect.updatePosition(targetDeckRect);
    }
  }
}
