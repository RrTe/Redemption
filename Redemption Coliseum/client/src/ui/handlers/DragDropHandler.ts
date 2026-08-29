import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js";
import { type AnimationManager } from "../managers/AnimationManager.js";
import { type PreviewManager } from "../managers/PreviewManager";
import { CardUI } from "../CardUI.js";
import { PileUI } from "../PileUI.js";
import { StackedPileUI } from "../StackedPileUI.js";
import { type MoveCardMessage } from "../../../../shared/messages.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../../shared/zones.js";
import { log } from "../../utils/logger.js";
import { ElementManager } from "../managers/ElementManager";
import { TypeSelectionOverlay, type TypeSelectionOption } from "../components/TypeSelectionOverlay";
import { cardData as staticCardData } from "../../utils/CardService";

const ATTACH_HOVER_DELAY = 700;

/**
 * Manages all Drag & Drop related input handlers and logic.
 */
export class DragDropHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private elementManager: ElementManager;
  private dragBounds: Phaser.Geom.Rectangle;

  public isDragging: boolean = false;
  private currentDragTarget: CardUI | null = null;
  private pendingDragTarget: CardUI | null = null;
  private attachHoverTimer: number | null = null;
  private currentHoveredDeck: StackedPileUI | null = null;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    elementManager: ElementManager,
    dragBounds: Phaser.Geom.Rectangle,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.elementManager = elementManager;
    this.dragBounds = dragBounds;
  }

  public registerHandlers() {
    this.scene.input.on("dragstart", this.onDragStart, this);
    this.scene.input.on("drag", this.onDrag, this);
    this.scene.input.on("dragend", this.onDragEnd, this);
    this.scene.input.on("drop", this.onDrop, this);
  }

  public destroy() {
    if (this.attachHoverTimer !== null) {
      window.clearTimeout(this.attachHoverTimer);
      this.attachHoverTimer = null;
    }
    this.scene.input.off("dragstart", this.onDragStart, this);
    this.scene.input.off("drag", this.onDrag, this);
    this.scene.input.off("dragend", this.onDragEnd, this);
    this.scene.input.off("drop", this.onDrop, this);
  }

  private snapBack(gameObject: CardUI) {
    const targetX = gameObject.targetX || gameObject.getData("start_x");
    const targetY = gameObject.targetY || gameObject.getData("start_y");
    const targetAngle =
      gameObject.targetAngle !== undefined
        ? gameObject.targetAngle
        : gameObject.getData("start_angle");

    this.scene.tweens.add({
      targets: gameObject,
      x: targetX,
      y: targetY,
      angle: targetAngle,
      ease: "Power1",
      duration: 200,
    });

    if (gameObject.scene) {
      const startDepth =
        gameObject.getData("start_depth") ??
        (gameObject.currentZone === ZONES.HAND ? 100 : 0);
      gameObject.setDepth(startDepth);
    }
  }

  private onDragStart(pointer: Phaser.Input.Pointer, gameObject: CardUI) {
    this.isDragging = true;
    log("Input", `dragstart on ${gameObject.cardData?.id}`);

    this.previewManager.hide();
    this.scene.events.emit("ui:clear-hover");
    this.animationManager.stopHandHoverAnimation(gameObject);

    gameObject.setData("start_depth", gameObject.depth);
    gameObject.setDepth(1000);
    gameObject.setData("start_x", gameObject.targetX || gameObject.x);
    gameObject.setData("start_y", gameObject.targetY || gameObject.y);
    gameObject.setData(
      "start_angle",
      gameObject.targetAngle !== undefined
        ? gameObject.targetAngle
        : gameObject.angle,
    );
    gameObject.setData("drop_action_taken", false);

    gameObject.dragTargetX = gameObject.x;
    gameObject.dragTargetY = gameObject.y;

    this.currentDragTarget = null;
    gameObject.isBeingDragged = true;
    gameObject.startGlow();
    this.scene.children.bringToTop(gameObject);
  }

  private onDrag(
    pointer: Phaser.Input.Pointer,
    gameObject: CardUI,
    dragX: number,
    dragY: number,
  ) {
    if (!gameObject.scene) return;

    gameObject.dragTargetX = Phaser.Math.Clamp(
      dragX,
      this.dragBounds.left,
      this.dragBounds.right,
    );
    gameObject.dragTargetY = Phaser.Math.Clamp(
      dragY,
      this.dragBounds.top,
      this.dragBounds.bottom,
    );

    if (!this.scene.cameras.main) return;

    const hitObjects = this.scene.input.hitTestPointer(pointer);

    const deckPile = hitObjects.find(
      (obj) => obj instanceof StackedPileUI && obj.zoneName === ZONES.DECK,
    ) as StackedPileUI | undefined;

    if (deckPile) {
      this.currentHoveredDeck = deckPile;
      const bounds = deckPile.getBounds();
      if (pointer.y > bounds.centerY) {
        deckPile.showBottomHighlight(true);
        gameObject.setTransparent(true);
      } else {
        deckPile.showBottomHighlight(false);
        if (!this.currentDragTarget) gameObject.setTransparent(false);
      }
    } else {
      if (this.currentHoveredDeck) {
        this.currentHoveredDeck.showBottomHighlight(false);
        this.currentHoveredDeck = null;
        if (!this.currentDragTarget) gameObject.setTransparent(false);
      }
    }

    const hitZone = hitObjects.find(
      (obj) => obj instanceof Phaser.GameObjects.Zone && obj.name,
    ) as Phaser.GameObjects.Zone | undefined;

    if (hitZone) {
      const zoneName = hitZone.name as Zone;
      const ownerId = hitZone.getData("ownerId");
      const isMe = ownerId === this.room.sessionId;

      let label = "";
      const UNIFIED_COLOR = 0xffd700;
      let color = UNIFIED_COLOR;

      if (zoneName === ZONES.TERRITORY) {
        label = isMe ? "My Territory" : "Opponent Territory";
      } else if (zoneName === ZONES.LAND_OF_BONDAGE) {
        label = isMe ? "My Land of Bondage" : "Opponent Land of Bondage";
      } else if (zoneName === ZONES.BATTLEFIELD) {
        if (this.room.state.currentPhase === "battle") {
          label = "Field of Battle";
        }
      }

      if (label) {
        this.elementManager.showZoneHighlight(hitZone, label, color);
      } else {
        this.elementManager.hideZoneHighlight();
      }
    } else {
      this.elementManager.hideZoneHighlight();
    }

    const target = hitObjects.find(
      (obj) =>
        obj instanceof CardUI &&
        obj !== gameObject &&
        (obj as CardUI).currentZone !== ZONES.HAND &&
        !PILE_ZONES.includes((obj as CardUI).currentZone) &&
        (obj as CardUI).cardData.Type !== "Lost Soul",
    ) as CardUI | undefined;

    if (target) {
      if (this.currentDragTarget !== target) {
        if (this.pendingDragTarget === target) return;

        if (this.attachHoverTimer !== null) {
          clearTimeout(this.attachHoverTimer);
          this.attachHoverTimer = null;
        }

        if (this.currentDragTarget) {
          this.currentDragTarget.showTargetGlow(false);
          this.currentDragTarget = null;

          const isOverDeckBottom =
            this.currentHoveredDeck &&
            pointer.y > this.currentHoveredDeck.getBounds().centerY;
          if (!isOverDeckBottom) {
            gameObject.setTransparent(false);
          }
        }

        this.pendingDragTarget = target;
        this.attachHoverTimer = window.setTimeout(() => {
          if (!this.isDragging) return;

          this.currentDragTarget = target;
          this.currentDragTarget.showTargetGlow(true);
          gameObject.setTransparent(true);

          this.pendingDragTarget = null;
          this.attachHoverTimer = null;
        }, ATTACH_HOVER_DELAY);
      }
    } else {
      if (this.attachHoverTimer !== null) {
        clearTimeout(this.attachHoverTimer);
        this.attachHoverTimer = null;
      }
      this.pendingDragTarget = null;

      if (this.currentDragTarget) {
        this.currentDragTarget.showTargetGlow(false);
        this.currentDragTarget = null;

        const isOverDeckBottom =
          this.currentHoveredDeck &&
          pointer.y > this.currentHoveredDeck.getBounds().centerY;
        if (!isOverDeckBottom) {
          gameObject.setTransparent(false);
        }
      }
    }
  }

  private onDragEnd(
    pointer: Phaser.Input.Pointer,
    gameObject: CardUI,
    dropped: boolean,
  ) {
    this.isDragging = false;
    this.previewManager.hide();
    this.scene.events.emit("ui:clear-hover");

    if (gameObject.scene && !gameObject.getData("is_snapping_back")) {
      const startDepth =
        gameObject.getData("start_depth") ??
        (gameObject.currentZone === ZONES.HAND ? 100 : 0);
      gameObject.setDepth(startDepth);
    }

    gameObject.isBeingDragged = false;
    gameObject.resetDragEffects();
    gameObject.setTransparent(false);
    gameObject.stopGlow();

    if (this.currentHoveredDeck) {
      this.currentHoveredDeck.showBottomHighlight(false);
      this.currentHoveredDeck = null;
    }

    this.elementManager.hideZoneHighlight();

    if (this.attachHoverTimer !== null) {
      clearTimeout(this.attachHoverTimer);
      this.attachHoverTimer = null;
    }
    this.pendingDragTarget = null;

    if (this.currentDragTarget) {
      this.currentDragTarget.showTargetGlow(false);
      this.currentDragTarget = null;
    }

    if (!gameObject.getData("drop_action_taken")) {
      log("Input", `[DRAG_END] No drop action was taken. Snapping card back.`);
      this.snapBack(gameObject);
    }
  }

  private onDrop(
    pointer: Phaser.Input.Pointer,
    gameObject: CardUI,
    dropZone: Phaser.GameObjects.Zone | PileUI,
  ) {
    log("Input", `Drop called with dropzone:`, dropZone);
    this.previewManager.hide();
    this.scene.events.emit("ui:clear-hover");

    const isAttached = !!gameObject.cardData.attachedTo;
    if (isAttached) {
      const startX = gameObject.getData("start_x");
      const startY = gameObject.getData("start_y");
      const dist = Phaser.Math.Distance.Between(
        startX,
        startY,
        gameObject.x,
        gameObject.y,
      );
      const DETACH_THRESHOLD = 50;

      if (dist < DETACH_THRESHOLD) {
        log(
          "Input",
          `[DROP] Attached card moved only ${dist.toFixed(1)}px. Snapping back (preventing detach).`,
        );
        gameObject.setData("drop_action_taken", true);
        this.snapBack(gameObject);
        return;
      }
    }
    const fromZone = gameObject.cardData.zone as Zone;
    const toZone = dropZone.name as Zone;
    const targetOwnerId = dropZone.getData("ownerId");

    let attachTarget = this.currentDragTarget;
    if (attachTarget) {
      const targetBounds = attachTarget.getBounds();
      const isOverTarget = Phaser.Geom.Rectangle.Contains(
        targetBounds,
        pointer.x,
        pointer.y,
      );
      if (!isOverTarget) {
        log(
          "Input",
          `[DROP] Attach target was active, but dropped outside bounds. Ignoring attach.`,
        );
        attachTarget = null;
      }
    }

    if (attachTarget) {
      log(
        "Input",
        `[DROP] Attaching card ${gameObject.cardData.id} to ${attachTarget.cardData.id}`,
      );
      gameObject.setData("drop_action_taken", true);
      attachTarget.playAttachAnimation();

      this.networkManager.sendMoveCard({
        from: fromZone,
        to: attachTarget.currentZone,
        cardId: gameObject.cardData.id,
        coords: { attachTo: attachTarget.cardData.id },
      });
      return;
    }

    const isToken = Boolean(gameObject.cardData.isToken);
    const forbiddenTokenZones = [ZONES.HAND, ZONES.DECK, ZONES.RESERVE];

    if (isToken && forbiddenTokenZones.includes(toZone)) {
      log("Input", `[DROP] Blocked Token from entering ${toZone}.`);
      gameObject.setData("drop_action_taken", true);
      this.snapBack(gameObject);
      return;
    }

    if (toZone === ZONES.BATTLEFIELD && gameObject.isParalyzed) {
      log("Input", `[DROP] Blocked paralyzed card from entering Battlefield.`);
      gameObject.setData("drop_action_taken", true);
      this.snapBack(gameObject);
      return;
    }

    if (fromZone === ZONES.HAND && toZone === ZONES.HAND) {
      log("Input", `[DROP] Hand-to-hand drop. Snapping back to fan position.`);
      gameObject.setData("drop_action_taken", true);
      this.snapBack(gameObject);
      return;
    }

    const currentControllerId = gameObject.cardData.controllerId;

    const isSameZoneMove =
      !isAttached &&
      fromZone === toZone &&
      [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
        fromZone,
      ) &&
      (!targetOwnerId || targetOwnerId === currentControllerId);

    if (isSameZoneMove) {
      log(
        "Input",
        `[MOVE] Card moved within the same zone. Sending coordinate update only.`,
      );
      gameObject.setData("drop_action_taken", true);
      this.room.send("updateCardState", {
        cardId: gameObject.cardData.id,
        updates: { x: gameObject.x, y: gameObject.y },
      });
    } else {
      const coords: MoveCardMessage["coords"] = {
        x: gameObject.x,
        y: gameObject.y,
        targetPlayerId: dropZone.getData("ownerId"),
      };

      if (toZone === ZONES.DECK) {
        const dropZoneBounds = dropZone.getBounds();
        if (pointer.y > dropZoneBounds.centerY) {
          coords.position = "bottom";
        }
      }

      const message: MoveCardMessage = {
        from: fromZone,
        to: toZone,
        cardId: gameObject.cardData.id,
        coords,
      };

      // Intercept if it's a Dual Card being played to the field
      const isFieldMove = [ZONES.BATTLEFIELD, ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.SET_ASIDE].includes(toZone);
      
      const staticData = staticCardData.cards.find((c: any) => 
        c.Name === gameObject.cardData.Name && 
        c.ImageFile === gameObject.cardData.ImageFile && 
        c.Set === gameObject.cardData.Set
      );

      if (isFieldMove && staticData && staticData.sides && staticData.sides.length > 1) {
        log("Input", `[MOVE] Dual Card detected! Showing TypeSelectionOverlay...`);
        gameObject.setData("drop_action_taken", true);
        gameObject.setData("waiting_for_overlay", true);

        // Build options based on card sides without duplicates
        const options: TypeSelectionOption[] = [];
        const sides = staticData.sides;
        
        sides.forEach((side: any, index: number) => {
          const type = side.Type || "";
          const alignment = side.Alignment || "";
          const typeUpper = type.toUpperCase();

          let inGameType = type;
          let inGameAlignment = alignment;
          let iconKey = this.getIconForType(type || alignment);
          let label = type || alignment || `Option ${index + 1}`;
          let id = type || alignment || `side${index}`;

          // Special case: Covenants & Curses played as Artifacts (show Trophy / Art icon)
          if (typeUpper === "COVENANT" || typeUpper === "CURSE") {
            inGameType = "Artifact";
            iconKey = "Art";
            label = "Artifact";
            id = "Artifact";
          }

          if (!options.some(opt => opt.inGameType === inGameType && opt.inGameAlignment === inGameAlignment)) {
            options.push({
              id,
              iconKey,
              label,
              inGameType,
              inGameAlignment,
            });
          }
        });

        if (options.length > 1) {
          log("Input", `[MOVE] Dual Card detected! Showing TypeSelectionOverlay...`);
          gameObject.setData("drop_action_taken", true);
          gameObject.setData("waiting_for_overlay", true);

          const overlay = new TypeSelectionOverlay(
            this.scene,
            this.animationManager,
            staticData,
            options,
            (selectedOption: TypeSelectionOption) => {
              log("Input", `[MOVE] Dual Card option selected:`, selectedOption);
              gameObject.setData("waiting_for_overlay", false);
              
              message.inGameType = selectedOption.inGameType;
              message.inGameAlignment = selectedOption.inGameAlignment;
              
              this.networkManager.sendMoveCard(message);
            },
            () => {
              log("Input", `[MOVE] Dual Card selection cancelled.`);
              gameObject.setData("waiting_for_overlay", false);
              this.snapBack(gameObject);
            }
          );
          overlay.show();
          return;
        } else if (options.length === 1) {
          // Exactly one unique type/alignment configuration; no overlay needed.
          message.inGameType = options[0].inGameType;
          message.inGameAlignment = options[0].inGameAlignment;
        }
      }

      log(
        "Input",
        `[MOVE] Sending full moveCard message for zone change:`,
        message,
      );
      gameObject.setData("drop_action_taken", true);
      this.networkManager.sendMoveCard(message);
    }
  }

  // Hilfsmethode, um das passende Icon-Asset für einen Kartentyp zu finden
  private getIconForType(typeStr: string): string {
    if (!typeStr) return "icon_search"; // Fallback
    
    const typeUpper = typeStr.toUpperCase();
    if (typeUpper.includes("HERO")) return "Hero";
    if (typeUpper.includes("EVIL CHARACTER") || typeUpper === "EC") return "EC";
    if (typeUpper.includes("GOOD ENHANCEMENT") || typeUpper === "GE") return "GE";
    if (typeUpper.includes("EVIL ENHANCEMENT") || typeUpper === "EE") return "EE";
    if (typeUpper.includes("COVENANT")) return "Cov";
    if (typeUpper.includes("CURSE")) return "Curse";
    if (typeUpper.includes("ARTIFACT")) return "Art";
    if (typeUpper.includes("SITE")) return "Site";
    if (typeUpper.includes("GOOD DOMINANT")) return "GoodDom";
    if (typeUpper.includes("EVIL DOMINANT")) return "EvilDom";
    if (typeUpper.includes("GOOD FORTRESS") || typeUpper === "GOOD FORT") return "GoodFort";
    if (typeUpper.includes("EVIL FORTRESS") || typeUpper === "EVIL FORT") return "EvilFort";
    
    // Fallback:
    return "icon_search"; 
  }
}
