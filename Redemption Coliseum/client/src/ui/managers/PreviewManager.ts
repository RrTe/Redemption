import Phaser from "phaser";
import { CardUI } from "../CardUI";
import { CardDetailOverlay } from "../overlays/CardDetailOverlay";
import { ViewportManager } from "./ViewportManager";
import { CARD_PREVIEW_CONFIG } from "../config/visualConfig.js";

/**
 * Manages the enlarged card preview and detail overlay shown on hover or touch.
 */
export class PreviewManager {
  private scene: Phaser.Scene;
  private showTimer: number | null = null;
  private isPreviewActive: boolean = false;
  private currentCard: CardUI | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Resolves the loaded texture source image from Phaser texture cache if available.
   */
  private resolveTextureSrc(cardData: any): string | undefined {
    const imageFile = cardData.ImageFile || cardData.cardId;
    if (!imageFile) return undefined;
    const key = `card-${imageFile}`;
    if (this.scene.textures.exists(key)) {
      const tex = this.scene.textures.get(key);
      const srcImg = tex?.getSourceImage() as HTMLImageElement;
      if (srcImg?.src) {
        return srcImg.src;
      }
    }
    return new URL(`/assets/cards/${imageFile}.jpg`, window.location.href).href;
  }

  /**
   * Shows the preview overlay for a given card.
   * @param card Target CardUI instance
   * @param currentSessionId ID of the local player
   * @param isInstant If true, preview is rendered without delay
   */
  public show(card: CardUI, currentSessionId: string, isInstant: boolean = false): void {
    if (this.currentCard === card && (this.showTimer !== null || this.isPreviewActive)) {
      return;
    }

    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.currentCard = card;

    const render = () => {
      if (!card.scene || card.isBeingDragged || !this.scene.scene.isActive()) return;
      if (this.currentCard !== card) return;

      const isControlledByMe = card.cardData.controllerId === currentSessionId;
      const shouldShowPreview = !card.isCurrentlyFaceDown() || isControlledByMe;
      if (!shouldShowPreview) return;

      const isTouch = ViewportManager.isTouchPrimary() || this.scene.scale.height < 600;
      const matrix = card.getWorldTransformMatrix();
      const globalX = matrix.tx;
      const globalY = matrix.ty;
      const cardWidth = card.width * card.scaleX;
      const cardHeight = card.height * card.scaleY;
      const imageSrc = this.resolveTextureSrc(card.cardData);
      const badgeText = card.badge?.isVisible() ? card.badge.getText() : "";

      this.isPreviewActive = true;
      CardDetailOverlay.show(
        card.cardData,
        {
          globalX,
          globalY,
          cardWidth,
          cardHeight,
          isModal: isTouch,
          imageSrc,
          badgeText,
        },
        isTouch
          ? () => {
              this.isPreviewActive = false;
              this.currentCard = null;
              this.scene.events.emit("ui:clear-hover");
            }
          : () => {
              this.isPreviewActive = false;
            }
      );
    };

    if (isInstant || this.isPreviewActive) {
      render();
    } else {
      this.showTimer = window.setTimeout(
        render,
        CARD_PREVIEW_CONFIG.HOVER_DELAY_MS,
      );
    }
  }

  /**
   * Shows the preview overlay from raw card data (e.g. from chat links).
   * @param cardData Raw card data object
   * @param sourceRightX Source X anchor position
   * @param sourceY Source Y anchor position
   */
  public showFromData(cardData: any, sourceRightX: number, sourceY: number): void {
    this.currentCard = null;
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    const render = () => {
      if (!this.scene.scene.isActive()) return;
      const isTouch = ViewportManager.isTouchPrimary() || this.scene.scale.height < 600;
      const imageSrc = this.resolveTextureSrc(cardData);
      this.isPreviewActive = true;
      CardDetailOverlay.show(
        cardData,
        {
          globalX: sourceRightX,
          globalY: sourceY,
          cardWidth: 0,
          cardHeight: 0,
          isModal: isTouch,
          imageSrc,
        },
        isTouch
          ? () => {
              this.isPreviewActive = false;
              this.scene.events.emit("ui:clear-hover");
            }
          : () => {
              this.isPreviewActive = false;
            }
      );
    };

    if (this.isPreviewActive) {
      render();
    } else {
      this.showTimer = window.setTimeout(
        render,
        CARD_PREVIEW_CONFIG.HOVER_DELAY_MS,
      );
    }
  }

  /**
   * Hides the preview overlay and clears pending timers.
   * @param card Optional card reference to avoid hiding preview of a newly hovered card.
   */
  public hide(card?: CardUI): void {
    if (card && this.currentCard && this.currentCard !== card) {
      return;
    }
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.isPreviewActive = false;
    this.currentCard = null;
    CardDetailOverlay.hide();
  }
}
