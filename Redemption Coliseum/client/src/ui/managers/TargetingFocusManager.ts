// client/src/ui/managers/TargetingFocusManager.ts
import Phaser from "phaser";
import type { CardRenderer } from "../renderers/CardRenderer";
import type { ElementManager } from "./ElementManager";
import type { TypedRoom } from "../gameUI";
import { ZONES } from "../../../../shared/zones";

const SPOTLIGHT_DEPTH = 1200;
const ELEVATED_DEPTH = 1300;
const OVERLAY_ALPHA = 0.65;

/**
 * Manages full-screen spotlight dimming and depth elevation during target selection.
 */
export class TargetingFocusManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private cardRenderer: CardRenderer;
  private elementManager: ElementManager;

  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private elevatedObjects: Array<{ obj: Phaser.GameObjects.GameObject; originalDepth: number }> = [];
  public onOverlayClick: (() => void) | null = null;

  private isActive: boolean = false;
  private currentTargetType: "card" | "pile" | null = null;
  private currentEligibleCardIds: string[] = [];
  private currentEligiblePileIds: Set<string> | null = null;
  private currentSourceCardId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    cardRenderer: CardRenderer,
    elementManager: ElementManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.cardRenderer = cardRenderer;
    this.elementManager = elementManager;

    this.createOverlay();
    this.scene.scale.on("resize", this.handleResize, this);
  }

  private createOverlay(): void {
    const { width, height } = this.scene.scale;
    this.overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, OVERLAY_ALPHA)
      .setOrigin(0)
      .setDepth(SPOTLIGHT_DEPTH)
      .setVisible(false)
      .setInteractive();

    this.overlay.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const hits = this.scene.input.hitTestPointer(pointer);
      const hitElevated = hits.some(
        (h) => (h as any).depth >= ELEVATED_DEPTH || (h.parentContainer as any)?.depth >= ELEVATED_DEPTH
      );
      if (hitElevated) return;
      this.onOverlayClick?.();
    });
  }

  private handleResize(): void {
    if (this.overlay) {
      this.overlay.setSize(this.scene.scale.width, this.scene.scale.height);
    }
  }

  public activate(
    targetType: "card" | "pile",
    eligibleCardIds?: string[],
    eligiblePileIds?: Set<string>,
    sourceCardId?: string
  ): void {
    this.isActive = true;
    this.currentTargetType = targetType;
    this.currentEligibleCardIds = eligibleCardIds || [];
    this.currentEligiblePileIds = eligiblePileIds || null;
    this.currentSourceCardId = sourceCardId || null;

    if (this.overlay) {
      this.overlay.setSize(this.scene.scale.width, this.scene.scale.height);
      this.overlay.setVisible(true);
    }

    this.scene.events.off("cardsRendered", this.onCardsRendered, this);
    this.scene.events.on("cardsRendered", this.onCardsRendered, this);

    this.refreshVisuals();
  }

  public refreshVisuals(): void {
    if (!this.isActive) return;

    if (this.currentTargetType === "pile") {
      this.cardRenderer.getAllCardUIs().forEach((cardUI, id) => {
        const isSource = id === this.currentSourceCardId;
        cardUI.visuals.updateTargetBorder(false);
        cardUI.visuals.setDimmed(!isSource);
        if (isSource) {
          this.elevateObject(cardUI);
        }
      });

      this.getPileEntries().forEach(({ pile, id }) => {
        const isEligible = this.currentEligiblePileIds ? this.currentEligiblePileIds.has(id) : false;
        if (typeof pile.showTargetingBorder === "function") pile.showTargetingBorder(isEligible);
        if (typeof pile.setAlpha === "function") pile.setAlpha(isEligible ? 1.0 : 0.45);
        if (isEligible) {
          this.elevateObject(pile);
        }
      });
    } else {
      const allowed = new Set(this.currentEligibleCardIds);
      this.cardRenderer.getAllCardUIs().forEach((cardUI, id) => {
        const isEligible = allowed.has(id);
        const isSource = id === this.currentSourceCardId;
        cardUI.visuals.updateTargetBorder(isEligible);
        cardUI.visuals.setDimmed(!isEligible && !isSource);
        if (isEligible || isSource) {
          this.elevateObject(cardUI);
        }
      });

      this.getPileEntries().forEach(({ pile }) => {
        if (typeof pile.setAlpha === "function") pile.setAlpha(0.45);
      });
    }
  }

  private onCardsRendered(): void {
    this.refreshVisuals();
  }

  public deactivate(): void {
    this.isActive = false;
    this.currentTargetType = null;
    this.currentEligibleCardIds = [];
    this.currentEligiblePileIds = null;
    this.currentSourceCardId = null;
    this.scene.events.off("cardsRendered", this.onCardsRendered, this);

    if (this.overlay) {
      this.overlay.setVisible(false);
    }

    this.elevatedObjects.forEach(({ obj, originalDepth }) => {
      if (obj && obj.active && "setDepth" in obj) {
        (obj as any).setDepth(originalDepth);
      }
    });
    this.elevatedObjects = [];

    this.cardRenderer.getAllCardUIs().forEach((cardUI) => {
      cardUI.visuals.updateTargetBorder(false);
      cardUI.visuals.setDimmed(false);
      cardUI.badge.hide();
    });

    this.getPileEntries().forEach(({ pile }) => {
      if (typeof pile.showTargetingBorder === "function") pile.showTargetingBorder(false);
      if (typeof pile.setAlpha === "function") pile.setAlpha(1.0);
    });
  }

  public destroy(): void {
    this.deactivate();
    this.scene.scale.off("resize", this.handleResize, this);
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
  }

  public getPileEntries(): Array<{ pile: any; id: string }> {
    const ze = this.elementManager.zoneElements;
    const myId = this.room.sessionId;
    const oppId = Array.from(this.room.state.players.keys()).find((id) => id !== myId) || "";
    const entries: Array<{ pile: any; id: string }> = [];
    if (ze?.playerDeckPile) entries.push({ pile: ze.playerDeckPile, id: `${myId}:${ZONES.DECK}` });
    if (ze?.opponentDeckPile) entries.push({ pile: ze.opponentDeckPile, id: `${oppId}:${ZONES.DECK}` });
    if (ze?.playerDiscardPile) entries.push({ pile: ze.playerDiscardPile, id: `${myId}:${ZONES.DISCARD}` });
    if (ze?.opponentDiscardPile) entries.push({ pile: ze.opponentDiscardPile, id: `${oppId}:${ZONES.DISCARD}` });
    return entries;
  }

  private elevateObject(obj: any): void {
    if (!obj || !("setDepth" in obj)) return;
    const isAlreadyElevated = this.elevatedObjects.some((entry) => entry.obj === obj);
    if (!isAlreadyElevated) {
      const originalDepth = obj.depth || 0;
      this.elevatedObjects.push({ obj, originalDepth });
    }
    obj.setDepth(ELEVATED_DEPTH);
  }
}
