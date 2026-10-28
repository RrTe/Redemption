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
import { GameEvents } from "../../constants/EventNames";
import { ZONES } from "../../../../shared/zones";
import type { ActionTelegraphMessage } from "../../../../shared/messages";
import { TargetingArrowEffect } from "../effects/TargetingArrowEffect";
import {
  TARGETING_ARROW_CONFIG,
  resolveCardAlignment,
} from "../config/targetingConfig";
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
  private activeTelegraphArrows: TargetingArrowEffect | null = null;
  private persistentSiArrows: TargetingArrowEffect | null = null;
  private activeChronicleCardId: string | null = null;

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
    this.scene.events.off(GameEvents.NET_ACTION_TELEGRAPH, this._onActionTelegraph, this);
    this.scene.events.off(GameEvents.NET_CLEAR_ACTION_TELEGRAPH, this._onClearActionTelegraph, this);
    this.activeTelegraphArrows?.destroy();
    this.activeTelegraphArrows = null;
    this.persistentSiArrows?.destroy();
    this.persistentSiArrows = null;
    if (this.activeChronicleCardId) {
      const prevCard = this.cardRenderer?.getCardUI(this.activeChronicleCardId);
      prevCard?.setChronicleExecutionHighlight(false);
      this.activeChronicleCardId = null;
    }
    this.effect.destroy();
    this.flyout.destroy();
  }

  private _bindEvents(): void {
    // When icon is clicked in Phaser, toggle DOM flyout drawer (passive inspector)
    this.effect.setOnClickCallback(() => {
      this.flyout.toggle();
    });

    this.scene.events.on("playChronicleFlight", this._onPlayFlight, this);
    this.scene.events.on(GameEvents.NET_ACTION_TELEGRAPH, this._onActionTelegraph, this);
    this.scene.events.on(GameEvents.NET_CLEAR_ACTION_TELEGRAPH, this._onClearActionTelegraph, this);
  }

  private _onActionTelegraph(msg: ActionTelegraphMessage): void {
    if (!msg || !msg.sourceCardId) {
      return;
    }
    // Suppress persistent preview arrows if in-game support is disabled
    if (msg.persistent && !this.settingsManager.isInGameSupportEnabled()) {
      return;
    }
    const hasCardTargets = Array.isArray(msg.targetCardIds) && msg.targetCardIds.length > 0;
    const hasPileTarget = Boolean(msg.targetPileId);
    if (!hasCardTargets && !hasPileTarget) {
      return;
    }

    const sourceCard = this.cardRenderer?.getCardUI(msg.sourceCardId);
    const alignment = sourceCard ? resolveCardAlignment(sourceCard) : "NEUTRAL";
    const sourcePos = sourceCard || {
      x: this.currentLayout?.opponentHand.centerX ?? this.scene.scale.width / 2,
      y: this.currentLayout?.opponentHand.centerY ?? this.scene.scale.height / 2,
    };

    const resolvePilePosition = (pileId: string): { x: number; y: number } | undefined => {
      if (!this.currentLayout) return undefined;
      const [targetOwnerId, targetZone] = pileId.split(":");
      const isMe = targetOwnerId === this.mySessionId;
      const zone = targetZone || ZONES.DECK;
      if (zone === ZONES.DECK) {
        const rect = isMe ? this.currentLayout.playerDeckPile : this.currentLayout.opponentDeckPile;
        return { x: rect.centerX, y: rect.centerY };
      }
      if (zone === ZONES.DISCARD) {
        const rect = isMe ? this.currentLayout.playerDiscardPile : this.currentLayout.opponentDiscardPile;
        return { x: rect.centerX, y: rect.centerY };
      }
      if (zone === ZONES.RESERVE) {
        const rect = isMe ? this.currentLayout.playerReservePile : this.currentLayout.opponentReservePile;
        return { x: rect.centerX, y: rect.centerY };
      }
      if (zone === ZONES.BANISH) {
        const rect = isMe ? this.currentLayout.playerBanishPile : this.currentLayout.opponentBanishPile;
        return { x: rect.centerX, y: rect.centerY };
      }
      return undefined;
    };

    const attachTargets = (arrowEffect: TargetingArrowEffect) => {
      if (msg.targetPileId) {
        const pilePos = resolvePilePosition(msg.targetPileId);
        if (pilePos) arrowEffect.setTarget(msg.targetPileId, pilePos, true);
      }

      if (Array.isArray(msg.targetCardIds)) {
        msg.targetCardIds.forEach((tId) => {
          const targetCard = this.cardRenderer?.getCardUI(tId);
          if (targetCard) {
            arrowEffect.setTarget(tId, targetCard, true);
          } else if (!msg.targetPileId && this.room.state?.players) {
            for (const [pId, p] of this.room.state.players.entries()) {
              const inDeck = p.deck && (p.deck as any).some((c: any) => c.id === tId);
              if (inDeck) {
                const pos = resolvePilePosition(`${pId}:${ZONES.DECK}`);
                if (pos) arrowEffect.setTarget(`pile_${tId}`, pos, true);
                break;
              }
              const inDiscard = p.discard && (p.discard as any).some((c: any) => c.id === tId);
              if (inDiscard) {
                const pos = resolvePilePosition(`${pId}:${ZONES.DISCARD}`);
                if (pos) arrowEffect.setTarget(`pile_${tId}`, pos, true);
                break;
              }
            }
          }
        });
      }
    };

    if (msg.persistent || msg.isSpecialInitiative) {
      this.persistentSiArrows?.destroy();
      this.persistentSiArrows = new TargetingArrowEffect(this.scene, sourcePos, alignment);
      attachTargets(this.persistentSiArrows);
    } else {
      this.activeTelegraphArrows?.destroy();
      this.activeTelegraphArrows = new TargetingArrowEffect(this.scene, sourcePos, alignment);
      attachTargets(this.activeTelegraphArrows);

      const duration = msg.durationMs || TARGETING_ARROW_CONFIG.TIMINGS.TELEGRAPH_DURATION_MS;
      const totalTelegraphMs = duration + TARGETING_ARROW_CONFIG.TIMINGS.FADE_OUT_MS;
      if (msg.sourceCardId) {
        this.cardRenderer?.addTelegraphRevealedCard(msg.sourceCardId, totalTelegraphMs);
      }

      this.scene.time.delayedCall(duration, () => {
        this.activeTelegraphArrows?.fadeAndDestroy();
        this.activeTelegraphArrows = null;
      });
    }
  }

  private _onClearActionTelegraph(): void {
    if (this.persistentSiArrows) {
      this.persistentSiArrows.fadeAndDestroy();
      this.persistentSiArrows = null;
    }
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

    const history: ChronicleItemData[] = [];
    if (chronicle.history) {
      chronicle.history.forEach((item, index) => {
        history.push({
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
    }

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

    // 2. Update visual icon & badge count (retains visibility when either pending or history exists)
    this.effect.updateState(items.length, history.length);

    // 3. Update flyout drawer with pending and phase history
    this.flyout.updateItems(items, history, isSupport);

    // 4. Update next phase button lock
    this.onPhaseLockCallback?.(items.length > 0);

    // 5. Update active chronicle card highlight for both players
    const activeItem = chronicle.items[0];
    const activeCardId = activeItem?.cardId || null;
    this._updateActiveCardHighlight(activeCardId);

    log("EffectChronicleManager", `Synced ${items.length} items, ${history.length} history (isSupport=${isSupport})`);
  }

  private _updateActiveCardHighlight(newActiveCardId: string | null): void {
    if (this.activeChronicleCardId === newActiveCardId) return;

    if (this.activeChronicleCardId) {
      const prevCard = this.cardRenderer?.getCardUI(this.activeChronicleCardId);
      prevCard?.setChronicleExecutionHighlight(false);
    }

    this.activeChronicleCardId = newActiveCardId;

    if (newActiveCardId) {
      const nextCard = this.cardRenderer?.getCardUI(newActiveCardId);
      nextCard?.setChronicleExecutionHighlight(true);
    }
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
        texture = c.isCurrentlyFaceDown() || !c.cardData.ImageFile ? "cardback" : `card-${c.cardData.ImageFile}`;
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
