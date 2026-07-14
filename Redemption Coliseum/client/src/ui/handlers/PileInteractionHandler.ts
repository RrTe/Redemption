import Phaser from "phaser";
import { type Zone, PILE_ZONES, ZONES } from "../../../../shared/zones.js";
import { type TypedRoom } from "../gameUI.js";
import { ViewportManager } from "../managers/ViewportManager.js";
import { type OverlayManager } from "../managers/OverlayManager.js";
import { type MenuFactory } from "../factories/MenuFactory.js";
import { RadialMenu } from "../components/RadialMenu.js";
import { PileUI } from "../PileUI.js";
import { StackedPileUI } from "../StackedPileUI.js";
import { CardUI } from "../CardUI.js";
import { log } from "../../utils/logger.js";

/**
 * Handles interactions specific to card piles (Deck, Discard, Reserve, Banish, Opponent Hand).
 */
export class PileInteractionHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private menuFactory: MenuFactory;
  private overlayManager: OverlayManager;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    menuFactory: MenuFactory,
    overlayManager: OverlayManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.menuFactory = menuFactory;
    this.overlayManager = overlayManager;
  }

  /**
   * Identifies if the gameObject is a pile or a card within a pile.
   */
  public getPileDetails(
    gameObject: Phaser.GameObjects.GameObject,
  ): { zone: Zone; targetId: string } | null {
    if (gameObject instanceof PileUI || gameObject instanceof StackedPileUI) {
      return {
        zone: gameObject.name as Zone,
        targetId: gameObject.getData("ownerId") || this.room.sessionId,
      };
    }

    if (
      gameObject instanceof Phaser.GameObjects.Zone &&
      gameObject.name === ZONES.HAND
    ) {
      const ownerId = gameObject.getData("ownerId");
      if (ownerId && ownerId !== this.room.sessionId) {
        return { zone: ZONES.HAND, targetId: ownerId };
      }
    }

    if (gameObject instanceof CardUI) {
      const cardZone = gameObject.cardData.zone as Zone;
      const isOpponentHand =
        cardZone === ZONES.HAND &&
        gameObject.cardData.controllerId !== this.room.sessionId;

      if (PILE_ZONES.includes(cardZone) || isOpponentHand) {
        return { zone: cardZone, targetId: gameObject.cardData.controllerId };
      }
    }

    return null;
  }

  /**
   * Checks if the pile is currently locked by another player.
   */
  public isPileBusy(zone: Zone, targetId: string): boolean {
    const targetPileId = `${targetId}_${zone}`;
    const lockOwnerId = this.room.state.activeActionPiles.get(targetPileId);
    return !!lockOwnerId && lockOwnerId !== this.room.sessionId;
  }

  /**
   * Logic to open the radial menu for a specific pile.
   */
  public openPileMenu(
    pointer: Phaser.Input.Pointer,
    zone: Zone,
    targetId: string,
    onClose: () => void,
  ): RadialMenu | null {
    // 1. Validation: Don't open if pile is busy
    if (this.isPileBusy(zone, targetId)) {
      this.overlayManager.showErrorDialog(
        `The ${zone} of ${targetId === this.room.sessionId ? "you" : "the opponent"} is currently in use by another player.`,
      );
      return null;
    }

    // 2. Validation: Don't open if pile is empty
    if (zone !== ZONES.HAND) {
      const player = this.room.state.players.get(targetId);
      const pile = player ? (player as any)[zone] : null;
      if (!pile || pile.length === 0) {
        log("Input", `Pile ${zone} is empty. Not opening radial menu.`);
        return null;
      }
    }

    // 3. Create Menu
    const menuConfigs = this.menuFactory.getActionsForPile(zone, targetId);
    
    const isCompact = ViewportManager.isTouchPrimary() || ViewportManager.isCompactMode();
    const isLowHeight = ViewportManager.isLowHeightProfile();

    // Bei "low height" (Mobile) machen wir Piles-Radial-Menüs größer. 
    // Desktop bleibt strikt auf den alten Werten, auch Karten bleiben unberührt.
    const radius = ViewportManager.vmin(isLowHeight ? 24 : (isCompact ? 16 : 8));
    const iconSize = ViewportManager.vmin(isLowHeight ? 18 : (isCompact ? 12.5 : 8.3));
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

    log("Input", `Opening pile menu for ${zone} (Owner: ${targetId})`);

    return new RadialMenu(
      this.scene, 
      cx, 
      cy, 
      radius, 
      menuConfigs, 
      () => {
        onClose();
      },
      iconSize // Übergebe angepasste Button-Größe
    );
  }
}
