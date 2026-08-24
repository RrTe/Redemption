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

  public setupCardInteractivity(card: CardUI) {
    card.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, card.width, card.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
      draggable: true,
    });
  }

  public updateCardHitArea(card: CardUI) {
    if (card.input && card.input.hitArea instanceof Phaser.Geom.Rectangle) {
      card.input.hitArea.setTo(0, 0, card.width, card.height);
    }
  }

  public destroy() {}

  public openCardMenu(
    pointer: Phaser.Input.Pointer,
    card: CardUI,
    onClose: () => void,
  ): RadialMenu {
    const menuConfigs = this.menuFactory.getActionsForCard(card);
    const isCompact = ViewportManager.isTouchPrimary() || ViewportManager.isCompactMode();
    const radius = ViewportManager.vmin(isCompact ? 16 : 8);
    const iconSize = ViewportManager.vmin(isCompact ? 12.5 : 8.3);
    const menuRadius = radius + iconSize / 2;

    const cx = Phaser.Math.Clamp(pointer.x, menuRadius, this.scene.scale.width - menuRadius);
    const cy = Phaser.Math.Clamp(pointer.y, menuRadius, this.scene.scale.height - menuRadius);
    log("Input", `Opening card menu for ${card.cardData.id}`);

    return new RadialMenu(this.scene, cx, cy, radius, menuConfigs, onClose);
  }

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

  public handlePointerUp(pointer: Phaser.Input.Pointer, card: CardUI) {
    // Ignore tap/click if pointer moved significantly (Drag & Drop gesture) or card is being dragged
    const TAP_MOVE_THRESHOLD = 15;
    if (pointer.getDistance() > TAP_MOVE_THRESHOLD || card.isBeingDragged) {
      return;
    }

    // Right Click Release: Flip Hand Card
    if (pointer.rightButtonReleased()) {
      if (!this.isInteractable(card)) return;
      if (card.currentZone === ZONES.HAND) {
        this.handleFlip(card);
      }
      return;
    }

    // Left Click Release (or Touch Release)
    if (pointer.leftButtonReleased() || pointer.wasTouch) {
      // Mobile: If it was a long press, don't treat it as a tap
      if (pointer.wasTouch && pointer.getDuration() > 500) {
        return;
      }

      // Mobile: Single Tap toggles preview (no accidental face-down flipping)
      if (pointer.wasTouch || ViewportManager.isTouchPrimary()) {
        if (this.currentHoveredCard === card) {
          this.clearHover();
        } else {
          this.handleHoverIn(card);
        }
        return;
      }

      // Desktop Double Click Detection (All interactable cards including Hand)
      const now = Date.now();
      if (
        this.lastClickedCardId === card.cardData.id &&
        now - this.lastClickTime < 300
      ) {
        if (this.isInteractable(card)) {
          this.handleFaceDownToggle(card);
        }
        this.lastClickedCardId = null;
      } else {
        this.lastClickedCardId = card.cardData.id;
      }
      this.lastClickTime = now;
    }
  }

  public isInteractable(card: CardUI): boolean {
    const zone = card.currentZone;
    return (
      zone === ZONES.TERRITORY ||
      zone === ZONES.LAND_OF_BONDAGE ||
      zone === ZONES.HAND ||
      zone === ZONES.BATTLEFIELD
    );
  }

  public handleHoverIn(card: CardUI) {
    if (card.getData("waiting_for_overlay")) return;

    if (this.currentHoveredCard && this.currentHoveredCard !== card) {
      this.handleHoverOut(this.currentHoveredCard);
    }
    this.currentHoveredCard = card;

    const isTouch = ViewportManager.isTouchPrimary();
    this.previewManager.show(card, this.room.sessionId, isTouch);

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
    if (card.getData("waiting_for_overlay")) return; // ✨ NEU: Ignoriere Hover für Karten, die auf Overlay warten

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
    this.lastClickedCardId = null;
    this.lastClickTime = 0;
    if (this.currentHoveredCard) {
      this.handleHoverOut(this.currentHoveredCard);
    }
  }
}
