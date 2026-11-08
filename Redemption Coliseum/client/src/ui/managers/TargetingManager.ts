// client/src/ui/managers/TargetingManager.ts
import Phaser from "phaser";
import { GameEvents } from "../../constants/EventNames";
import { ZONES } from "../../../../shared/zones";
import type { RequestTargetSelectionMessage } from "../../../../shared/messages";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import { TargetingHUD } from "./TargetingHUD";
import { TargetingFocusManager } from "./TargetingFocusManager";
import type { StackedPileUI } from "../StackedPileUI";
import type { CardUI } from "../CardUI";
import type { CardRenderer } from "../renderers/CardRenderer";
import type { ElementManager } from "./ElementManager";
import type { TypedRoom } from "../gameUI";
import { TargetingArrowEffect } from "../effects/TargetingArrowEffect";
import {
  TARGETING_ARROW_CONFIG,
  resolveCardAlignment,
} from "../config/targetingConfig";
import { log } from "../../utils/logger";

const POINTER_TARGET_ID = "__active_pointer_branch__";

/**
 * High-level orchestrator managing interactive targeting state, in-world highlights,
 * dynamic Bezier targeting arrows, and network communication.
 */
export class TargetingManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;
  private cardRenderer: CardRenderer;
  private elementManager: ElementManager;
  private hud: TargetingHUD;
  private focusManager: TargetingFocusManager;

  private activeRequest: RequestTargetSelectionMessage | null = null;
  private selectedCardIds: Set<string> = new Set();
  private selectedPileId: string | null = null;
  private activePiles: StackedPileUI[] = [];

  // Visual Targeting Arrow Effect
  private arrowEffect: TargetingArrowEffect | null = null;
  private elevatedSourceCard: CardUI | null = null;
  private originalSourceDepth: number = 0;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    cardRenderer: CardRenderer,
    elementManager: ElementManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.cardRenderer = cardRenderer;
    this.elementManager = elementManager;
    this.hud = new TargetingHUD(scene);
    this.focusManager = new TargetingFocusManager(
      scene,
      room,
      cardRenderer,
      elementManager,
    );
    this.focusManager.onOverlayClick = () => {
      if (this.activeRequest?.canCancel) {
        this.cancelTargeting();
      }
    };

    this.registerEventListeners();
  }

  public registerEventListeners(): void {
    this.scene.events.on(
      GameEvents.NET_TARGET_SELECTION_REQUESTED,
      (msg: RequestTargetSelectionMessage) => this.startTargeting(msg),
    );

    this.scene.events.on(
      "ui:pileTargetClicked",
      (data: { pileId: string }) => this.handlePileClicked(data.pileId),
    );

    this.scene.events.on(
      "ui:cardTargetClicked",
      (card: CardUI) => this.handleCardClicked(card),
    );
  }

  public startTargeting(request: RequestTargetSelectionMessage): void {
    log("TargetingManager", "Starting interactive targeting:", request);
    this.stopTargeting(false);

    this.activeRequest = request;
    this.selectedCardIds.clear();
    this.selectedPileId = null;

    const maxTargets = request.maxTargets ?? 1;
    const isMultiTarget = maxTargets > 1;
    const isOptionalUpTo = request.minTargets === 0;
    const shouldShowHUD = isMultiTarget || isOptionalUpTo || Boolean(request.canCancel);

    this.scene.input.keyboard?.on("keydown-ESC", this.handleEscKey, this);
    if (shouldShowHUD) {
      this.scene.input.keyboard?.on("keydown-ENTER", this.handleEnterKey, this);
      this.hud.show({
        promptText: request.promptText || "Select target(s)",
        minTargets: request.minTargets ?? (isOptionalUpTo ? 0 : 1),
        maxTargets,
        canCancel: Boolean(request.canCancel || isOptionalUpTo),
        onConfirm: () => this.confirmSelection(),
        onCancel: () => this.cancelTargeting(),
      });
    }

    // 1. Resolve source card and elevate depth by +10
    let sourceCardId = request.sourceCardId;
    if (!sourceCardId && request.itemId && this.room.state?.effectChronicle?.items) {
      const item = this.room.state.effectChronicle.items.find((i) => i.id === request.itemId);
      if (item) sourceCardId = item.cardId;
    }

    const sourceCard = sourceCardId ? this.cardRenderer.getCardUI(sourceCardId) : undefined;
    if (sourceCard) {
      this.elevatedSourceCard = sourceCard;
      this.originalSourceDepth = sourceCard.depth;
      sourceCard.setDepth(this.originalSourceDepth + TARGETING_ARROW_CONFIG.DEPTHS.SOURCE_ELEVATION_DELTA);

      const alignment = resolveCardAlignment(sourceCard);
      this.arrowEffect = new TargetingArrowEffect(this.scene, sourceCard, alignment);
    }

    // 2. Activate focus spotlight (live pointer arrow follows pointer & snaps to cards across all target modes)
    this.scene.input.on("pointermove", this.handlePointerMove, this);
    const activePointer = this.scene.input.activePointer;
    if (activePointer && this.arrowEffect) {
      this.handlePointerMove(activePointer);
    }

    if (request.targetType === "pile") {
      const allowedIds = new Set((request.eligiblePiles || []).map((p) => p.id));
      this.focusManager.activate("pile", undefined, allowedIds, sourceCardId);
      this.activePiles = this.focusManager
        .getPileEntries()
        .filter(({ id }) => allowedIds.has(id))
        .map(({ pile }) => pile);
    } else {
      this.focusManager.activate("card", request.eligibleCardIds || [], undefined, sourceCardId);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.arrowEffect || !this.activeRequest) return;

    if (this.selectedCardIds.size >= this.activeRequest.maxTargets) {
      this.arrowEffect.removeTarget(POINTER_TARGET_ID);
      return;
    }

    // Snap to hovered eligible card or follow cursor
    const hoveredCard = this.findHoveredEligibleCard(pointer.worldX, pointer.worldY);
    if (hoveredCard) {
      this.arrowEffect.setTarget(POINTER_TARGET_ID, hoveredCard, false);
    } else {
      this.arrowEffect.setTarget(
        POINTER_TARGET_ID,
        { x: pointer.worldX, y: pointer.worldY },
        false
      );
    }
  }

  private findHoveredEligibleCard(worldX: number, worldY: number): CardUI | undefined {
    for (const cardUI of this.cardRenderer.getAllCardUIs().values()) {
      const cId = cardUI.cardData?.id;
      if (!cId || !this.isCardEligible(cId) || this.selectedCardIds.has(cId)) continue;

      const mat = cardUI.getWorldTransformMatrix();
      const halfW = ((cardUI.displayWidth || cardUI.width) * (cardUI.scaleX || 1)) / 2;
      const halfH = ((cardUI.displayHeight || cardUI.height) * (cardUI.scaleY || 1)) / 2;

      if (Math.abs(worldX - mat.tx) <= halfW && Math.abs(worldY - mat.ty) <= halfH) {
        return cardUI;
      }
    }
    return undefined;
  }

  private handleEscKey(): void {
    if (this.activeRequest?.canCancel) {
      this.cancelTargeting();
    }
  }

  private handleEnterKey(): void {
    if (this.activeRequest && this.selectedCardIds.size >= (this.activeRequest.minTargets ?? 1)) {
      this.confirmSelection();
    }
  }

  public handlePileClicked(pileId: string): void {
    if (!this.activeRequest || this.activeRequest.targetType !== "pile") return;

    const allowed = (this.activeRequest.eligiblePiles || []).some((p) => p.id === pileId);
    if (!allowed) return;

    this.selectedPileId = pileId;
    const pileEntry = this.focusManager.getPileEntries().find((e) => e.id === pileId);
    if (pileEntry && this.arrowEffect) {
      this.arrowEffect.setTarget(pileId, pileEntry.pile, true);
    }

    this.confirmSelection();
  }

  public isTargetingActive(): boolean {
    return this.activeRequest !== null;
  }

  public isCardEligible(cardId?: string): boolean {
    if (!cardId || !this.activeRequest || this.activeRequest.targetType !== "card") {
      return false;
    }
    return (this.activeRequest.eligibleCardIds || []).includes(cardId);
  }

  public handleCardClicked(card: CardUI): void {
    if (!this.activeRequest || this.activeRequest.targetType !== "card" || !card) return;

    const cardId = card.cardData?.id;
    if (!cardId || !(this.activeRequest.eligibleCardIds || []).includes(cardId)) return;

    const maxTargets = this.activeRequest.maxTargets ?? 1;
    if (maxTargets === 1) {
      this.selectedCardIds.add(cardId);
      this.arrowEffect?.removeTarget(POINTER_TARGET_ID);
      this.arrowEffect?.setTarget(cardId, card, true);
      this.confirmSelection();
      return;
    }

    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
      card.badge.hide();
      this.arrowEffect?.removeTarget(cardId);
      this.refreshSelectionBadges();
    } else {
      if (this.selectedCardIds.size < maxTargets) {
        this.selectedCardIds.add(cardId);
        this.refreshSelectionBadges();
        this.arrowEffect?.setTarget(cardId, card, true);
      }
    }

    this.hud.updateSelectedCount(this.selectedCardIds.size);
  }

  private refreshSelectionBadges(): void {
    let order = 1;
    for (const selectedId of this.selectedCardIds) {
      const selectedCard = this.cardRenderer.getCardUI(selectedId);
      if (selectedCard) {
        const isHand = selectedCard.currentZone === ZONES.HAND;
        selectedCard.badge.show(String(order), isHand ? "top-left" : "center");
      }
      order++;
    }
  }

  public confirmSelection(): void {
    if (!this.activeRequest) return;

    if (this.activeRequest.targetType === "pile" && this.selectedPileId) {
      this.networkManager.sendSelectTarget({
        abilityId: this.activeRequest.abilityId,
        itemId: this.activeRequest.itemId,
        selectedPileId: this.selectedPileId,
      });
      this.stopTargeting(true);
    } else if (this.activeRequest.targetType === "card") {
      if (this.selectedCardIds.size >= this.activeRequest.minTargets) {
        this.networkManager.sendSelectTarget({
          abilityId: this.activeRequest.abilityId,
          itemId: this.activeRequest.itemId,
          selectedCardIds: Array.from(this.selectedCardIds),
        });
        this.stopTargeting(true);
      }
    }
  }

  public cancelTargeting(): void {
    if (!this.activeRequest) return;

    this.networkManager.sendSelectTarget({
      abilityId: this.activeRequest.abilityId,
      itemId: this.activeRequest.itemId,
      cancelled: true,
    });
    this.stopTargeting(true);
  }

  public stopTargeting(animate: boolean = true): void {
    if (animate) this.hud.hide();
    this.scene.input.keyboard?.off("keydown-ESC", this.handleEscKey, this);
    this.scene.input.keyboard?.off("keydown-ENTER", this.handleEnterKey, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);

    for (const selectedId of this.selectedCardIds) {
      const selectedCard = this.cardRenderer.getCardUI(selectedId);
      if (selectedCard) {
        selectedCard.badge.hide();
      }
    }

    if (this.elevatedSourceCard) {
      this.elevatedSourceCard.setDepth(this.originalSourceDepth);
      this.elevatedSourceCard = null;
    }

    if (this.arrowEffect) {
      this.arrowEffect.fadeAndDestroy();
      this.arrowEffect = null;
    }

    this.focusManager.deactivate();
    this.activePiles = [];
    this.activeRequest = null;
    this.selectedCardIds.clear();
    this.selectedPileId = null;
  }

  public destroy(): void {
    this.stopTargeting(false);
    this.hud.destroy();
    this.focusManager.destroy();
    this.scene.events.off(GameEvents.NET_TARGET_SELECTION_REQUESTED);
    this.scene.events.off("ui:pileTargetClicked");
    this.scene.events.off("ui:cardTargetClicked");
  }
}
