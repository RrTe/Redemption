import Phaser from "phaser";
import { editorEvents } from "../deck-editor/EditorEventCenter";

export interface ScrollableItem extends Phaser.GameObjects.GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  scaleX: number;
  scaleY: number;
  setMask(mask: Phaser.Display.Masks.GeometryMask | null): this;
  setCrop(x?: number, y?: number, width?: number, height?: number): this;
  setDepth(value: number): this;
  
  // Custom interface additions for label sub-elements if present
  labelBg?: Phaser.GameObjects.Graphics;
  labelText?: Phaser.GameObjects.Text;
  
  // Custom functions if the card handles its own clipping or visibility
  showCard?(shown: boolean): void;
  applySearchClip?(area: Phaser.Geom.Rectangle): boolean;
}

export class VerticalCardScrollList extends Phaser.GameObjects.Container {
  private viewArea: Phaser.Geom.Rectangle;
  private columns: number;
  private spacingX: number = 0;
  private spacingY: number = 55; // Additional vertical gap for label overlays
  private cardScale: number = 0.32;
  private scrollOffsetY: number = 0;
  private targetScrollOffsetY: number = 0;
  private maxScrollY: number = 0;
  private scrollTween: Phaser.Tweens.Tween | null = null;
  private items: ScrollableItem[] = [];
  private listMask: Phaser.Display.Masks.GeometryMask | null = null;

  // Sound pacing parameters
  private lastSoundRowIndex: number = 0;
  private lastScrollSoundAt: number = 0;

  // Scroll Indicators
  private upArrowBtn: Phaser.GameObjects.Image | null = null;
  private downArrowBtn: Phaser.GameObjects.Image | null = null;

  private zoomedItem: any = null;

  private onCardZoomedIn = (item: any) => {
    this.zoomedItem = item;
  };

  private onCardZoomedOut = (item: any) => {
    if (this.zoomedItem === item) {
      this.zoomedItem = null;
    }
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    columns: number = 6
  ) {
    super(scene, x, y);

    this.viewArea = new Phaser.Geom.Rectangle(x, y, width, height);
    this.columns = columns;

    // Register input events for scrolling
    this.setupWheelHandling();

    editorEvents.on("card-zoomed-in", this.onCardZoomedIn);
    editorEvents.on("card-zoomed-out", this.onCardZoomedOut);

    scene.add.existing(this);
  }

  /**
   * Sets the clipping geometry mask for the scroll list view area.
   */
  public setListMask(mask: Phaser.Display.Masks.GeometryMask) {
    this.listMask = mask;
    this.items.forEach((item) => item.setMask(mask));
  }

  /**
   * Configures layout parameters and calculates column grid spacings.
   */
  public calculateLayout(cardWidth: number, cardHeight: number, scale: number = 0.32) {
    this.cardScale = scale;
    
    const layoutScale = (this.scene as any).layoutConfig?.scale ?? 1.0;
    const paddingLeft = 25 * layoutScale;
    const paddingRight = 52 * layoutScale;
    const displayWidth = cardWidth * scale;

    const minGap = 20 * layoutScale;
    const availableWidth = this.viewArea.width - paddingLeft - paddingRight;
    
    this.columns = Math.floor((availableWidth + minGap) / (displayWidth + minGap));
    this.columns = Math.max(1, this.columns);

    const totalCardWidth = displayWidth * this.columns;
    const availableWidthForGaps = availableWidth - totalCardWidth;
    
    if (this.columns > 1) {
      this.spacingX = displayWidth + (availableWidthForGaps / (this.columns - 1));
    } else {
      this.spacingX = displayWidth;
    }
    this.spacingY = cardHeight * scale + 55 * layoutScale; // Card height + label height spacing
  }

  /**
   * Assigns scrollable card items to the list and recalculates dimensions.
   */
  public setItems(newItems: ScrollableItem[], resetScroll = true) {
    this.items = newItems;
    this.items.forEach((item) => {
      if (this.listMask) {
        item.setMask(this.listMask);
      }
    });

    if (resetScroll) {
      this.scrollOffsetY = 0;
      this.targetScrollOffsetY = 0;
    }
    this.updateScrollBounds();
    this.updateLayout();
  }

  /**
   * Recalculates maximum scroll boundary based on the number of active items.
   */
  public updateScrollBounds() {
    const visibleItems = this.items.filter((item) => item.active);
    const totalRows = Math.ceil(visibleItems.length / this.columns);
    const contentHeight = totalRows * this.spacingY;

    // Let the content scroll slightly past the bottom for comfort
    this.maxScrollY = Math.max(0, contentHeight - this.viewArea.height + this.spacingY * 0.25);
    this.scrollOffsetY = Phaser.Math.Clamp(this.scrollOffsetY, 0, this.maxScrollY);
    this.targetScrollOffsetY = Phaser.Math.Clamp(this.targetScrollOffsetY, 0, this.maxScrollY);
  }

  /**
   * Checks if a new row index has been crossed and plays a scroll audio tick.
   */
  private checkRowCrossingSound() {
    const currentRow = Math.round(this.scrollOffsetY / this.spacingY);
    if (currentRow === this.lastSoundRowIndex) return;

    this.lastSoundRowIndex = currentRow;
    const now = this.scene.time.now;

    // Cooldown check to prevent audio overlaps
    if (now - this.lastScrollSoundAt < 160) return;

    this.scene.game.events.emit("playSound", "DECK_CARD_SCROLL");
    this.lastScrollSoundAt = now;
  }

  /**
   * Refreshes absolute child positions based on grid structure and scroll offsets.
   */
  public updateLayout() {
    const visibleItems = this.items.filter((item) => item.active);
    const scale = (this.scene as any).layoutConfig?.scale ?? 1.0;
    const paddingLeft = 25 * scale;
    const paddingY = this.viewArea.height * 0.035;

    this.items.forEach((item) => {
      if (item.showCard) {
        item.showCard(false);
      } else {
        item.visible = false;
      }
    });

    // Pre-compute positions and collect max displayHeight per row so that
    // ALL name labels in a row share the same bottom baseline (as in the standalone editor).
    const rowMaxHeight: Map<number, number> = new Map();
    visibleItems.forEach((item, index) => {
      const row = Math.floor(index / this.columns);
      const displayHeight = item.height * this.cardScale;
      rowMaxHeight.set(row, Math.max(rowMaxHeight.get(row) ?? 0, displayHeight));
    });

    visibleItems.forEach((item, index) => {
      const col = index % this.columns;
      const row = Math.floor(index / this.columns);

      const displayWidth = item.width * this.cardScale;
      const displayHeight = item.height * this.cardScale;
      const maxRowHeight = rowMaxHeight.get(row) ?? displayHeight;

      const cardX = this.viewArea.x + paddingLeft + displayWidth / 2 + col * this.spacingX;
      const cardY = this.viewArea.y + paddingY + maxRowHeight / 2 + row * this.spacingY - this.scrollOffsetY;

      item.x = cardX;
      item.y = cardY;

      // All labels in the same row share the same baseline Y:
      // use maxRowHeight (not individual displayHeight) so the label bottom
      // stays on the same horizontal line regardless of minor card-size differences.
      const labelY = cardY + maxRowHeight / 2 + 14 * scale;
      if (item.labelBg) {
        item.labelBg.x = cardX;
        item.labelBg.y = labelY;
      }
      if (item.labelText) {
        item.labelText.x = cardX;
        item.labelText.y = labelY;
      }

      // Visibility bounds checking (use maxRowHeight for conservative culling)
      // Expanded by exactly 3 card rows (spacingY) up and down to solve texture upload lag
      const bufferPadding = 3 * this.spacingY;
      const cullingTop = this.viewArea.y - bufferPadding;
      const cullingBottom = this.viewArea.y + this.viewArea.height + bufferPadding;
      const labelBottom = cardY + maxRowHeight / 2 + 32 * scale;

      if (labelBottom >= cullingTop && cardY - maxRowHeight / 2 <= cullingBottom) {
        if (item.showCard) {
          item.showCard(true);
        } else {
          item.visible = true;
        }

        if (item.applySearchClip) {
          item.applySearchClip(this.viewArea);
        } else {
          this.applyItemClip(item);
        }
      }
    });

    this.checkRowCrossingSound();
    this.updateScrollIndicators();
  }


  /**
   * Clip item visually using Phaser's crop component when geometry mask is not enough.
   */
  private applyItemClip(item: ScrollableItem) {
    const scale = this.cardScale;
    const displayWidth = item.width * scale;
    const displayHeight = item.height * scale;

    const left = item.x - displayWidth / 2;
    const right = item.x + displayWidth / 2;
    const top = item.y - displayHeight / 2;
    const bottom = item.y + displayHeight / 2;

    const clipLeft = Math.max(left, this.viewArea.x);
    const clipRight = Math.min(right, this.viewArea.x + this.viewArea.width);
    const clipTop = Math.max(top, this.viewArea.y);
    const clipBottom = Math.min(bottom, this.viewArea.y + this.viewArea.height);

    if (clipLeft >= clipRight || clipTop >= clipBottom) {
      item.setCrop(0, 0, 0, 0);
      return;
    }

    item.setCrop(
      (clipLeft - left) / scale,
      (clipTop - top) / scale,
      (clipRight - clipLeft) / scale,
      (clipBottom - clipTop) / scale
    );
  }

  private activePointerId: number | null = null;

  /**
   * Registers a mouse-wheel callback specifically inside the bounds of the list area.
   */
  private setupWheelHandling() {
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch && Phaser.Geom.Rectangle.Contains(this.viewArea, pointer.x, pointer.y)) {
        if (this.activePointerId === null) {
          this.activePointerId = pointer.id;
        }
      }
    });

    this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.activePointerId === pointer.id) {
        this.activePointerId = null;
      }
    });
    this.scene.input.on("wheel", (
      pointer: Phaser.Input.Pointer,
      gameObjects: Phaser.GameObjects.GameObject[],
      deltaX: number,
      deltaY: number
    ) => {
      // Confirm the wheel occurred inside our scroll list bounds
      if (Phaser.Geom.Rectangle.Contains(this.viewArea, pointer.x, pointer.y)) {
        this.scroll(deltaY);
      }
    });

    // ✨ Mobile: Swipe/Drag support for scrolling
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.wasTouch && this.activePointerId === pointer.id) {
        if (Phaser.Geom.Rectangle.Contains(this.viewArea, pointer.x, pointer.y)) {
          const deltaY = pointer.prevPosition.y - pointer.y;
          if (Math.abs(deltaY) > 2) {
            this.scroll(deltaY);
          }
        }
      }
    });
  }

  private resetZoomedItem() {
    if (this.zoomedItem) {
      const temp = this.zoomedItem;
      this.zoomedItem = null;
      temp.out(990);
    }
  }

  /**
   * Adjusts the current scroll offset instantly.
   */
  public scroll(deltaY: number) {
    if (Math.abs(deltaY) > 2) {
      this.resetZoomedItem();
    }
    this.updateScrollBounds();
    const prevScrollOffsetY = this.scrollOffsetY;
    this.scrollOffsetY = Phaser.Math.Clamp(
      this.scrollOffsetY + deltaY,
      0,
      this.maxScrollY
    );
    this.targetScrollOffsetY = this.scrollOffsetY;

    // Play thud error sound when scroll limit is hit
    if (prevScrollOffsetY === this.scrollOffsetY && deltaY !== 0) {
      const now = this.scene.time.now;
      if (now - this.lastScrollSoundAt > 200) {
        this.scene.game.events.emit("playSound", "DECK_ERROR");
        this.lastScrollSoundAt = now;
      }
    }

    this.updateLayout();
  }

  /**
   * Initiates a continuous scroll animation towards the top or bottom of the list.
   */
  public startContinuousScroll(direction: number) {
    this.resetZoomedItem();
    this.updateScrollBounds();

    const target = direction < 0 ? 0 : this.maxScrollY;
    const distance = Math.abs(target - this.scrollOffsetY);
    if (distance <= 0) return;

    if (this.scrollTween) {
      this.scrollTween.stop();
    }

    const speed = 800; // 800px per second scroll speed
    const duration = (distance / speed) * 1000;

    this.scrollTween = this.scene.tweens.add({
      targets: this,
      scrollOffsetY: target,
      duration: duration,
      ease: "Linear",
      onUpdate: () => this.updateLayout(),
      onComplete: () => this.updateLayout(),
    });
  }

  /**
   * Terminates active scroll animations and starts the deceleration/damping slide.
   */
  public stopContinuousScroll(direction?: number) {
    this.resetZoomedItem();
    if (this.scrollTween) {
      this.scrollTween.stop();
    }

    const dir = direction === 1 || direction === -1 ? direction : 0;
    if (dir === 0) {
      this.targetScrollOffsetY = this.scrollOffsetY;
      this.updateLayout();
      return;
    }

    // Apply smooth inertia glide
    const currentVel = dir * 800; // Glide speed
    const duration = 280; // 280ms glide duration
    const distance = currentVel * (duration / 1000) * 0.45;
    const target = Phaser.Math.Clamp(
      this.scrollOffsetY + distance,
      0,
      this.maxScrollY
    );

    this.targetScrollOffsetY = target;
    this.scrollTween = this.scene.tweens.add({
      targets: this,
      scrollOffsetY: target,
      duration: duration,
      ease: "Quad.easeOut",
      onUpdate: () => this.updateLayout(),
      onComplete: () => this.updateLayout(),
    });
  }

  /**
   * Validates and updates visibility states of up and down scroll indicators.
   */
  public updateScrollIndicators(upBtn?: Phaser.GameObjects.Image, downBtn?: Phaser.GameObjects.Image) {
    if (upBtn) this.upArrowBtn = upBtn;
    if (downBtn) this.downArrowBtn = downBtn;

    const up = this.upArrowBtn;
    const down = this.downArrowBtn;
    if (!up || !down) return;

    const isAtTop = this.scrollOffsetY <= 5;
    const isAtBottom = this.scrollOffsetY >= this.maxScrollY - 5;
    const scale = (this.scene as any).layoutConfig?.scale ?? 1.0;
    const baseScale = 0.7 * scale;

    const isVisible = this.maxScrollY > 0;

    up.setVisible(isVisible);
    if (isVisible) {
      if (isAtTop) {
        up.setAlpha(0.2);
        up.disableInteractive();
        up.setScale(baseScale); // Prevent hover scaling at limit
      } else {
        up.setAlpha(0.8);
        up.setInteractive({ useHandCursor: true });
      }
    }

    down.setVisible(isVisible);
    if (isVisible) {
      if (isAtBottom) {
        down.setAlpha(0.2);
        down.disableInteractive();
        down.setScale(baseScale); // Prevent hover scaling at limit
      } else {
        down.setAlpha(0.8);
        down.setInteractive({ useHandCursor: true });
      }
    }
  }

  public getScrollOffsetY(): number {
    return this.scrollOffsetY;
  }

  public getMaxScrollY(): number {
    return this.maxScrollY;
  }

  public atTop(): boolean {
    return this.scrollOffsetY <= 5;
  }

  public atBottom(): boolean {
    return this.scrollOffsetY >= this.maxScrollY - 5;
  }

  public destroy(fromScene?: boolean) {
    editorEvents.off("card-zoomed-in", this.onCardZoomedIn);
    editorEvents.off("card-zoomed-out", this.onCardZoomedOut);
    super.destroy(fromScene);
  }
}
