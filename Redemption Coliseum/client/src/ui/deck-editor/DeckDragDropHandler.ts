import Phaser from "phaser";
import { editorEvents } from "./EditorEventCenter";
import { type EditorAreaDeck } from "./EditorAreaDeck";
import { type EditorAreaReserve } from "./EditorAreaReserve";
import { DECK_VALIDATION_RULES } from "../../../../shared/deck-validation-rules";
import { NotificationManager } from "../notifications/NotificationManager";



export class DeckDragDropHandler {
  private scene: Phaser.Scene;
  private deckList: any; // DeckListController
  private deckArea: EditorAreaDeck;
  private reserveArea: EditorAreaReserve;
  private background: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite | null;
  private mask: Phaser.Display.Masks.GeometryMask | null;

  public dragging: boolean = false;

  constructor(
    scene: Phaser.Scene,
    deckList: any,
    deckArea: EditorAreaDeck,
    reserveArea: EditorAreaReserve,
    background: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite | null,
    mask: Phaser.Display.Masks.GeometryMask | null
  ) {
    this.scene = scene;
    this.deckList = deckList;
    this.deckArea = deckArea;
    this.reserveArea = reserveArea;
    this.background = background;
    this.mask = mask;

    this.setupDragAndDrop();
  }

  private setupDragAndDrop() {
    this.scene.input.dragDistanceThreshold = 10;

    this.scene.input.on("drag", (
      pointer: Phaser.Input.Pointer,
      gameObject: any,
      dragX: number,
      dragY: number
    ) => {
      if (gameObject.zoomed) {
        editorEvents.emit("card-zoomed-out", gameObject);
      }
      gameObject.emit("force-out");

      // On touch devices, block drag until long press is detected (350ms hold)
      if (pointer.wasTouch && gameObject.getData("isLongPressReady") !== true) {
        return; // Not a long press — scroll and tap handlers manage this gesture
      }

      // After long press: detect vertical scroll vs horizontal drag intent
      if (gameObject.getData("isTouchScrolling") === undefined) {
        if (pointer.wasTouch) {
          const dx = Math.abs(pointer.x - pointer.downX);
          const dy = Math.abs(pointer.y - pointer.downY);
          gameObject.setData("isTouchScrolling", dy > dx);
        } else {
          gameObject.setData("isTouchScrolling", false);
        }
      }

      if (gameObject.getData("isTouchScrolling") === true) {
        return; // Vertical motion after long press — treat as scroll
      }

      this.dragging = true;
      (this.scene as any).isDragging = true;
      this.scene.children.bringToTop(gameObject);

      if (gameObject.getData("originalContainer") === undefined) {
        gameObject.setData("originalContainer", gameObject.parentContainer || null);
      }
      if (gameObject.getData("originalGroup") === undefined) {
        gameObject.setData("originalGroup", gameObject.group || null);
      }

      if (this.background) {
        this.scene.tweens.add({
          targets: this.background,
          alpha: 0.3,
          duration: 100,
        });
      }

      if (gameObject.cardCopy !== null) {
        gameObject.cardCopy.setAlpha(0.3);
        gameObject.cardCopy.setVisible(true); // Make placeholder copy visible at starting position
        gameObject.cardCopy.x = gameObject.input.dragStartX;
        gameObject.cardCopy.y = gameObject.input.dragStartY;
      }

      gameObject.setDepth(1001); // searchAreaDepth + 1
      gameObject.clearMask(false);
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.scene.input.on("dragenter", (
      pointer: Phaser.Input.Pointer,
      gameObject: any,
      dropzone: Phaser.GameObjects.Zone
    ) => {
      if (dropzone.name === "Deck") {
        this.deckArea.highlight();
      } else if (dropzone.name === "Reserve") {
        this.reserveArea.highlight();
      }
    });

    this.scene.input.on("dragleave", (
      pointer: Phaser.Input.Pointer,
      gameObject: any,
      dropzone: Phaser.GameObjects.Zone
    ) => {
      if (dropzone.name === "Deck") {
        this.deckArea.reset();
      } else if (dropzone.name === "Reserve") {
        this.reserveArea.reset();
      }
    });

    this.scene.input.on("drop", (
      pointer: Phaser.Input.Pointer,
      gameObject: any,
      dropZone: Phaser.GameObjects.Zone
    ) => {
      const cardData = this.deckList.getCard(gameObject.cardId);

      // Check validation rules if dropping into the reserve area
      let isAllowed = true;
      if (dropZone.name === "Reserve" && cardData) {
        const defaultFormat = DECK_VALIDATION_RULES.defaultFormat;
        const formatRules = DECK_VALIDATION_RULES.formats[defaultFormat]?.rules;
        const disallowedTypes = formatRules?.reserve?.disallowedTypes || ["Dominant", "Lost Soul"];

        const cardTypes = Array.isArray(cardData.Type)
          ? cardData.Type
          : (typeof cardData.Type === "string" ? [cardData.Type] : []);

        if (cardTypes.some((t: string) => disallowedTypes.includes(t))) {
          isAllowed = false;
        }
      }

      if (!isAllowed) {
        if ((this.scene as any).soundManager) {
          (this.scene as any).soundManager.playSound("DECK_ERROR");
        }

        const notificationManager = this.scene.registry.get("notificationManager") as NotificationManager;
        if (notificationManager) {
          notificationManager.showError(
            "Rule Violation",
            "Dominant and Lost Soul cards cannot be placed in the Reserve according to the rules."
          );
        }


        if (gameObject.cardCopy !== null) {
          gameObject.cardCopy.setAlpha(1.0);
          gameObject.cardCopy.setVisible(false);
        }


        this.scene.tweens.add({
          targets: gameObject,
          x: gameObject.input.dragStartX,
          y: gameObject.input.dragStartY,
          duration: 100,
          onComplete: () => {
            // Restore original container or group if they were set
            const origContainer = gameObject.getData("originalContainer");
            if (origContainer) {
              origContainer.add(gameObject);
            }
            const origGroup = gameObject.getData("originalGroup");
            if (origGroup) {
              origGroup.add(gameObject);
            }

            gameObject.setDepth(990); // searchAreaDepth - 10
            if (typeof gameObject.out === "function") {
              gameObject.out(990);
            } else {
              if (this.mask) gameObject.setMask(this.mask);
            }

            // Clean up stored drag references
            gameObject.setData("originalContainer", undefined);
            gameObject.setData("originalGroup", undefined);
          },
        });

        this.dragging = false;
        (this.scene as any).isDragging = false;
        return;
      }

      this.deckList.addCard(cardData, dropZone.name);
      gameObject.setDepth(1001); // searchAreaDepth + 1

      // Sound is played in addCard (DECK_ADD_CARD), so we don't double play it here

      if (gameObject.cardCopy !== null) {
        gameObject.cardCopy.setAlpha(1.0);
        gameObject.cardCopy.setVisible(false);
      }

      this.scene.tweens.add({
        targets: gameObject,
        x: dropZone.x,
        y: dropZone.y,
        scale: 0,
        duration: 100,
        onComplete: () => {
          gameObject.showCard(false);
          gameObject.setDepth(990); // searchAreaDepth - 10
          if (this.mask) gameObject.setMask(this.mask);
          gameObject.setScale(gameObject.scaleFactor);
          // Restore card to its original slot position so the grid stays intact
          gameObject.x = gameObject.input.dragStartX;
          gameObject.y = gameObject.input.dragStartY;
          gameObject.showCard(true);
          if ("labelBg" in gameObject) {
            this.scene.events.emit("ui:deck-list-layout-refresh");
          }
        },
      });

      this.dragging = false;
      (this.scene as any).isDragging = false;
    });

    this.scene.input.on("dragend", (
      pointer: Phaser.Input.Pointer,
      gameObject: any,
      dropped: boolean
    ) => {
      // Always clear touch-gesture state flags on pointer release
      gameObject.setData("isLongPressReady", false);
      if (gameObject.getData("isTouchScrolling") === true) {
        gameObject.setData("isTouchScrolling", undefined);
        return; // Was a touch scroll gesture — no drag cleanup needed
      }
      gameObject.setData("isTouchScrolling", undefined);

      if (gameObject.cardCopy !== null) {
        gameObject.cardCopy.setAlpha(1.0);
        if (dropped) {
          gameObject.cardCopy.setVisible(false);
        }
      }

      if (!dropped) {
        if (gameObject.zoomed) {
          gameObject.zoomOut(37.5);
        }
        // Snap card back to where it was dragged from (works for all card types)
        this.scene.tweens.add({
          targets: gameObject,
          x: gameObject.input.dragStartX,
          y: gameObject.input.dragStartY,
          duration: 37.5,
          onComplete: () => {
            gameObject.setDepth(990); // searchAreaDepth - 10
            if (this.mask) gameObject.setMask(this.mask);
            if (gameObject.cardCopy !== null) {
              gameObject.cardCopy.setVisible(false);
            }
            // Search area cards: re-run layout so the grid stays pixel-perfect
            if ("labelBg" in gameObject) {
              this.scene.events.emit("ui:deck-list-layout-refresh");
            }
          },
        });
      }

      // Reset both highlights
      this.deckArea.reset();
      this.reserveArea.reset();

      if (this.background) {
        this.scene.tweens.add({
          targets: this.background,
          alpha: 1,
          duration: 100,
        });
      }

      this.dragging = false;
      (this.scene as any).isDragging = false;
    });
  }

  public destroy() {
    this.scene.input.off("drag");
    this.scene.input.off("dragenter");
    this.scene.input.off("dragleave");
    this.scene.input.off("drop");
    this.scene.input.off("dragend");
  }
}
