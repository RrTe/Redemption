// client/src/ui/managers/TargetingManager.ts
import Phaser from "phaser";
import { GameEvents } from "../../constants/EventNames";
import type { RequestTargetSelectionMessage } from "../../../../shared/messages";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import { TargetingHUD } from "./TargetingHUD";
import { TargetingFocusManager } from "./TargetingFocusManager";
import type { StackedPileUI } from "../StackedPileUI";
import type { CardUI } from "../CardUI";
import type { CardRenderer } from "../renderers/CardRenderer";
import type { ElementManager } from "./ElementManager";
import type { TypedRoom } from "../gameUI";
import { log } from "../../utils/logger";

/**
 * High-level orchestrator managing interactive targeting state, in-world highlights,
 * and communication between Phaser board objects and the network manager.
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

    this.hud.show({
      promptText: request.promptText,
      minTargets: request.minTargets,
      maxTargets: request.maxTargets,
      canCancel: request.canCancel,
      onConfirm: () => this.confirmSelection(),
      onCancel: () => this.cancelTargeting(),
    });

    if (request.targetType === "pile") {
      const allowedIds = new Set((request.eligiblePiles || []).map((p) => p.id));
      this.focusManager.activate("pile", undefined, allowedIds);
      this.activePiles = this.focusManager
        .getPileEntries()
        .filter(({ id }) => allowedIds.has(id))
        .map(({ pile }) => pile);
    } else {
      this.focusManager.activate("card", request.eligibleCardIds || []);
    }
  }

  public handlePileClicked(pileId: string): void {
    if (!this.activeRequest || this.activeRequest.targetType !== "pile") return;

    const allowed = (this.activeRequest.eligiblePiles || []).some((p) => p.id === pileId);
    if (!allowed) return;

    this.selectedPileId = pileId;
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

    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
      card.badge.hide();
    } else {
      if (this.selectedCardIds.size < this.activeRequest.maxTargets) {
        this.selectedCardIds.add(cardId);
        card.badge.show("✓", "top-right");
      }
    }

    this.hud.updateSelectedCount(this.selectedCardIds.size);

    if (this.activeRequest.maxTargets === 1 && this.selectedCardIds.size === 1) {
      this.confirmSelection();
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
