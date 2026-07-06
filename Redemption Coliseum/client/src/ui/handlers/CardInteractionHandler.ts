import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import { ZONES } from "../../../../shared/zones.js";
import { type TypedRoom } from "../gameUI.js";
import { type PreviewManager } from "../managers/PreviewManager.js";
import { type AnimationManager } from "../managers/AnimationManager.js";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js";
import { type MenuFactory } from "../factories/MenuFactory.js";
import { RadialMenu } from "../components/RadialMenu.js";
import { ViewportManager } from "../managers/ViewportManager.js";
import { log } from "../../utils/logger.js";

/**
 * Handles interactions specific to individual cards (Radial Menu, Flipping, Face-down).
 */
export class CardInteractionHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;
  private menuFactory: MenuFactory;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private lastClickTime: number = 0;
  private lastClickedCardId: string | null = null;
  private currentHoveredCard: CardUI | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    menuFactory: MenuFactory,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.menuFactory = menuFactory;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
  }

  /**
   * Configures a card for interaction.
   */
  public setupCardInteractivity(card: CardUI) {
    card.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, card.width, card.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
      draggable: true,
    });
  }

  /**
   * Updates the hit area of a card, usually after resizing.
   */
  public updateCardHitArea(card: CardUI) {
    if (card.input && card.input.hitArea instanceof Phaser.Geom.Rectangle) {
      card.input.hitArea.setTo(0, 0, card.width, card.height);
    }
  }

  public destroy() {
    // Cleanup logic if needed
  }

  /**
   * Opens the radial menu for a card in an active game zone.
   */
  public openCardMenu(
    pointer: Phaser.Input.Pointer,
    card: CardUI,
    onClose: () => void,
  ): RadialMenu {
    const menuConfigs = this.menuFactory.getActionsForCard(card);
    const isCompact = ViewportManager.isTouchPrimary() || ViewportManager.isCompactMode();
    // In compact mode, we want a tighter radius but larger icons.
    const radius = ViewportManager.vmin(isCompact ? 16 : 8);
    const iconSize = ViewportManager.vmin(isCompact ? 12.5 : 8.3);
    const menuRadius = radius + iconSize / 2;

    const cx = Phaser.Math.Clamp(
      pointer.x,
      menuRadius,
      this.scene.scale.width - menuRadius,
    );
    const cy = Phaser.Math.Clamp(
      pointer.y,
      menuRadius,
      this.scene.scale.height - menuRadius,
    );

    log("Input", `Opening card menu for ${card.cardData.id}`);

    return new RadialMenu(this.scene, cx, cy, radius, menuConfigs, onClose);
  }

  /**
   * Handles the logic for flipping a card (Right Click Release in Hand).
   */
  public handleFlip(card: CardUI) {
    log("Input", `Flip requested for card ${card.cardData.id}`);
    this.networkManager.sendUpdateCardState({
      cardId: card.cardData.id,
      updates: { isFlipped: !card.cardData.isFlipped },
    });
  }

  /**
   * Handles the logic for toggling face-down state (Double Click).
   */
  public handleFaceDownToggle(card: CardUI) {
    log("Input", `Face-down toggle requested for card ${card.cardData.id}`);
    this.networkManager.sendUpdateCardState({
      cardId: card.cardData.id,
      updates: { isFaceDown: !card.cardData.isFaceDown },
    });
  }

  /**
   * Handles click and double-click logic for cards.
   */
  public handlePointerUp(pointer: Phaser.Input.Pointer, card: CardUI) {
    if (!this.isInteractable(card)) return;

    // Right Click Release: Flip Hand Card
    if (pointer.rightButtonReleased()) {
      if (card.currentZone === ZONES.HAND) {
        this.handleFlip(card);
      }
      return;
    }

    // Left Click Release (or Touch Release): Double Click Detection
    if (pointer.leftButtonReleased() || pointer.wasTouch) {
      // ✨ Mobile: If it was a long press, don't treat it as a tap
      if (pointer.wasTouch && pointer.getDuration() > 500) {
        return;
      }

      const now = Date.now();
      if (
        this.lastClickedCardId === card.cardData.id &&
        now - this.lastClickTime < 300
      ) {
        this.handleFaceDownToggle(card);
        this.lastClickedCardId = null;
        if (ViewportManager.isTouchPrimary() || pointer.wasTouch) {
          this.clearHover();
        }
      } else {
        this.lastClickedCardId = card.cardData.id;
        // ✨ Mobile: Single Tap opens the preview overlay (Hover equivalent)
        if (pointer.wasTouch) {
          this.handleHoverIn(card);
        }
      }
      this.lastClickTime = now;
    }
  }

  /**
   * Validates if a card is in a zone where it can be interacted with.
   */
  public isInteractable(card: CardUI): boolean {
    const zone = card.currentZone;
    return (
      zone === ZONES.TERRITORY ||
      zone === ZONES.LAND_OF_BONDAGE ||
      zone === ZONES.HAND ||
      zone === ZONES.BATTLEFIELD
    );
  }

  /**
   * Handles visual hover effects for cards.
   */
  public handleHoverIn(card: CardUI) {
    if (this.currentHoveredCard && this.currentHoveredCard !== card) {
      this.handleHoverOut(this.currentHoveredCard);
    }
    this.currentHoveredCard = card;

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

  /**
   * Cleans up visual hover effects.
   */
  public handleHoverOut(card: CardUI) {
    this.previewManager.hide();

    const isMyHandCard =
      card.currentZone === ZONES.HAND &&
      card.cardData.controllerId === this.room.sessionId;

    if (isMyHandCard) {
      this.animationManager.playHandHoverOutAnimation(card);
    } else {
      this.animationManager.playTerritoryHoverOutAnimation(card);
    }

    if (!card.isBeingDragged) card.stopGlow();
    if (this.currentHoveredCard === card) {
      this.currentHoveredCard = null;
    }
  }

  /**
   * Clears the currently hovered card (useful for mobile background taps).
   */
  public clearHover() {
    if (this.currentHoveredCard) {
      this.handleHoverOut(this.currentHoveredCard);
    }
  }
}
