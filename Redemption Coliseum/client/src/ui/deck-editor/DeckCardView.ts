import Phaser from "phaser";
import { type EditorCardData } from "./DeckListModel";
import { editorEvents } from "./EditorEventCenter";
import { AssetManager } from "../managers/AssetManager";
import { log, error } from "../../utils/logger";


export class DeckCardView extends Phaser.GameObjects.Sprite {
  public cardId: string;
  public cardProps: EditorCardData;
  public scaleFactor: number;
  public zoomScaleFactor: number;

  public cardCopy: Phaser.GameObjects.Image | null = null;
  public labelBg: Phaser.GameObjects.Graphics | null = null;
  public labelText: Phaser.GameObjects.Text | null = null;

  private maskRef: Phaser.Display.Masks.GeometryMask | null = null;
  private searchArea: Phaser.Geom.Rectangle | null = null;
  private assetManager: AssetManager;

  private cardImageLoaded: boolean = false;
  private isLoadingImage: boolean = false;
  private isZoomed: boolean = false;

  /** Shared off-screen canvas 2D context used for pixel-accurate text width measurement. */
  private static _measureCtx: CanvasRenderingContext2D | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
    zoomScale: number,
    texture: string,
    frame: string | number | undefined,
    mask: Phaser.Display.Masks.GeometryMask | null,
    cardProps: EditorCardData,
    searchArea: Phaser.Geom.Rectangle | null,
  ) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);

    this.cardId = cardProps.id;
    this.width = width;
    this.height = height;
    this.scaleFactor = scale;
    this.zoomScaleFactor = zoomScale;
    this.maskRef = mask;
    this.cardProps = cardProps;
    this.searchArea = searchArea;
    this.assetManager = new AssetManager(scene);

    // Format fields if they are string lists (e.g. Type: "Hero/EC")
    const formatField = (field: keyof EditorCardData) => {
      if (typeof this.cardProps[field] === "string") {
        (this.cardProps as any)[field] = (this.cardProps[field] as any)
          .split("/")
          .map((item: string) => item.trim());
      }
    };
    formatField("Type");
    formatField("Alignment");
    formatField("Brigade");

    if (this.maskRef) {
      this.setMask(this.maskRef);
    }
    this.setDisplaySize(width * scale, height * scale);
    this.setVisible(false);

    // Register custom interactive hitArea bounding box logic
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      (hitArea, localX, localY) => this.hitAreaCheck(hitArea, localX, localY),
    );

    // Configure drag handlers
    scene.input.setDraggable(this);

    this.on("pointerover", () => this.hover());
    this.on("pointerout", () => this.out(990)); // default searchAreaDepth - 10

    // Glassmorphic name label — created once per card in the constructor.
    // Labels are hidden by default and only made visible when showCard(true) is called.
    // Canvas text measurement ensures accurate 2-line wrapping with ellipsis.
    const labelScale = (scene as any).layoutConfig?.scale ?? 1.0;
    const labelW = width * scale + 10;
    const labelH = 32 * labelScale;
    const cornerRadius = 6 * labelScale;

    this.labelBg = scene.add.graphics();
    this.labelBg.setDepth(985);
    if (this.maskRef) this.labelBg.setMask(this.maskRef);
    this.labelBg.fillStyle(0x131826, 0.85);
    this.labelBg.fillRoundedRect(
      -labelW / 2,
      -labelH / 2,
      labelW,
      labelH,
      cornerRadius,
    );
    this.labelBg.lineStyle(1, 0xe9cd45, 0.4);
    this.labelBg.strokeRoundedRect(
      -labelW / 2,
      -labelH / 2,
      labelW,
      labelH,
      cornerRadius,
    );
    this.labelBg.setVisible(false);

    // Shared canvas context for pixel-accurate text measurement — created once for all cards.
    const fontScale = 0.5 * labelScale;
    const maxLineWidthPx = (labelW - 12) / fontScale;
    if (!DeckCardView._measureCtx) {
      DeckCardView._measureCtx = document
        .createElement("canvas")
        .getContext("2d")!;
    }
    DeckCardView._measureCtx.font = `bold 22px "Segoe UI","Trebuchet MS",Arial,sans-serif`;

    const displayText = DeckCardView.wrapNameToTwoLines(
      cardProps.Name || "",
      DeckCardView._measureCtx,
      maxLineWidthPx,
    );

    this.labelText = scene.add.text(0, 0, displayText, {
      fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#ffd84d",
      stroke: "#000000",
      strokeThickness: 3,
      align: "center",
      maxLines: 2,
      wordWrap: { width: maxLineWidthPx, useAdvancedWrap: true },
    });
    this.labelText.setOrigin(0.5);
    this.labelText.setScale(fontScale);
    this.labelText.setDepth(986);
    if (this.maskRef) this.labelText.setMask(this.maskRef);
    this.labelText.setVisible(false);

    scene.add.existing(this);
  }

  /**
   * Wraps `name` to at most 2 lines using pixel-accurate canvas measurement.
   * If the text overflows 2 lines, the last visible word is removed from line 2
   * and replaced with a trailing `…`.
   *
   * Args:
   *   name: The card name to wrap.
   *   ctx:  A CanvasRenderingContext2D whose `font` is already set.
   *   maxW: Maximum line width in pixels (in the label's unscaled coordinate system).
   *
   * Returns:
   *   A string with at most 2 `\n`-separated lines, ellipsis-terminated if truncated.
   */
  private static wrapNameToTwoLines(
    name: string,
    ctx: CanvasRenderingContext2D,
    maxW: number,
  ): string {
    const words = name.split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width <= maxW) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length >= 2) break; // overflow — stop collecting
      }
    }
    if (current && lines.length < 2) lines.push(current);

    // Check if all words fit in the collected lines
    const usedText = lines.join(" ");
    const hasOverflow = usedText.replace(/\s+/g, " ").trim() !== name.trim();

    if (hasOverflow && lines.length === 2) {
      // Trim the last word from line 2 until the line + "…" fits
      const words2 = lines[1].split(" ");
      while (words2.length > 0) {
        const candidate = words2.join(" ") + "…";
        if (ctx.measureText(candidate).width <= maxW) {
          lines[1] = candidate;
          break;
        }
        words2.pop();
      }
      if (words2.length === 0) lines[1] = "…";
    }

    return lines.join("\n");
  }

  private hitAreaCheck(
    hitArea: Phaser.Geom.Rectangle,
    localX: number,
    localY: number,
  ): boolean {
    hitArea.setTo(0, 0, this.width, this.height);
    const pointer = this.scene.input.activePointer;

    const originalWidth = this.width * this.scaleFactor;
    const originalHeight = this.height * this.scaleFactor;
    const margin = this.isZoomed ? 12 : 0;

    const originalRect = new Phaser.Geom.Rectangle(
      this.x - (originalWidth + margin * 2) / 2,
      this.y - (originalHeight + margin * 2) / 2,
      originalWidth + margin * 2,
      originalHeight + margin * 2,
    );

    // Strict hover boundary checking in world coordinates
    if (
      !Phaser.Geom.Rectangle.Contains(
        originalRect,
        pointer.worldX,
        pointer.worldY,
      )
    ) {
      return false;
    }

    // Ensure click is inside searchArea viewport bounds
    if (this.searchArea) {
      if (
        !Phaser.Geom.Rectangle.Contains(this.searchArea, pointer.x, pointer.y)
      ) {
        return false;
      }
    }

    return true;
  }

  private loadCardImage() {
    if (!this.scene) return;

    const key = `card-${this.cardProps.ImageFile}`;
    const url = `/assets/cards/${this.cardProps.ImageFile}.jpg`;
    this.isLoadingImage = true;

    this.assetManager.loadCardImage(key, url, (loadedKey) => {
      if (!this.scene) return;

      log(
        "DeckCardView",
        `loadCardImage callback for "${this.cardProps.Name}". isZoomed: ${this.isZoomed}, texture: ${loadedKey}`,
      );
      this.setTexture(loadedKey);

      if (!this.isZoomed) {
        this.setDisplaySize(
          this.width * this.scaleFactor,
          this.height * this.scaleFactor,
        );
      } else {
        this.setDisplaySize(
          this.width * this.zoomScaleFactor,
          this.height * this.zoomScaleFactor,
        );
      }

      if (this.cardCopy === null) {
        this.cardCopy = this.scene.add.image(this.x, this.y, loadedKey);
        this.cardCopy.setDisplaySize(
          this.width * this.scaleFactor,
          this.height * this.scaleFactor,
        );
        this.cardCopy.setDepth(980); // searchAreaDepth - 20
        if (this.maskRef) this.cardCopy.setMask(this.maskRef);
        this.cardCopy.setVisible(this.visible && !this.isZoomed);
      } else {
        this.cardCopy.setTexture(loadedKey);
        this.cardCopy.setVisible(this.visible && !this.isZoomed);
      }
      this.cardImageLoaded = true;
      this.isLoadingImage = false;

      if (!this.isZoomed && this.searchArea) {
        this.applySearchClip(this.searchArea);
      }
    });
  }

  private isSupposedToBeShown: boolean = false;

  public showCard(shown: boolean) {
    this.isSupposedToBeShown = shown;

    if (shown) {
      if (!this.isZoomed) {
        this.setMask(this.maskRef);
      }
      if (!this.cardImageLoaded && !this.isLoadingImage) {
        this.isLoadingImage = true;
        this.loadCardImage();
      }
      this.setVisible(true);
    } else {
      this.setVisible(false);
      this.setMask(this.maskRef);
      this.setCrop();
    }

    if (this.cardCopy !== null) {
      this.cardCopy.setVisible(this.visible && !this.isZoomed);
      this.cardCopy.x = this.x;
      this.cardCopy.y = this.y;
    }

    const labelVisible = this.visible && !this.isZoomed;
    if (this.labelBg) this.labelBg.setVisible(labelVisible);
    if (this.labelText) this.labelText.setVisible(labelVisible);
  }

  public applySearchClip(area: Phaser.Geom.Rectangle): boolean {
    if (this.isZoomed) {
      return true;
    }
    const scale = this.scaleFactor;
    const displayWidth = this.width * scale;
    const displayHeight = this.height * scale;

    const left = this.x - displayWidth / 2;
    const right = this.x + displayWidth / 2;
    const top = this.y - displayHeight / 2;
    const bottom = this.y + displayHeight / 2;

    const clipLeft = Math.max(left, area.x);
    const clipRight = Math.min(right, area.x + area.width);
    const clipTop = Math.max(top, area.y);
    const clipBottom = Math.min(bottom, area.y + area.height);

    if (clipLeft >= clipRight || clipTop >= clipBottom) {
      this.setCrop(0, 0, 0, 0);
      if (this.cardCopy !== null) {
        this.cardCopy.setCrop(0, 0, 0, 0);
      }
      if (this.labelBg) this.labelBg.setVisible(false);
      if (this.labelText) this.labelText.setVisible(false);
      return true;
    }

    // Proportional texture coordinates crop
    const texWidth = this.frame.width;
    const texHeight = this.frame.height;

    const cropX = ((clipLeft - left) / displayWidth) * texWidth;
    const cropY = ((clipTop - top) / displayHeight) * texHeight;
    const cropW = ((clipRight - clipLeft) / displayWidth) * texWidth;
    const cropH = ((clipBottom - clipTop) / displayHeight) * texHeight;

    this.setCrop(cropX, cropY, cropW, cropH);

    if (this.cardCopy !== null) {
      this.cardCopy.x = this.x;
      this.cardCopy.y = this.y;
      this.cardCopy.setDisplaySize(displayWidth, displayHeight);

      const copyTexWidth = this.cardCopy.frame.width;
      const copyTexHeight = this.cardCopy.frame.height;

      const copyCropX = ((clipLeft - left) / displayWidth) * copyTexWidth;
      const copyCropY = ((clipTop - top) / displayHeight) * copyTexHeight;
      const copyCropW = ((clipRight - clipLeft) / displayWidth) * copyTexWidth;
      const copyCropH =
        ((clipBottom - clipTop) / displayHeight) * copyTexHeight;

      this.cardCopy.setCrop(copyCropX, copyCropY, copyCropW, copyCropH);
    }

    const labelVisible = this.visible && !this.isZoomed;
    if (this.labelBg) this.labelBg.setVisible(labelVisible);
    if (this.labelText) this.labelText.setVisible(labelVisible);

    return true;
  }

  private zoomIn(duration: number) {
    this.scene.tweens.add({
      targets: this,
      displayWidth: this.width * this.zoomScaleFactor,
      displayHeight: this.height * this.zoomScaleFactor,
      duration: duration,
    });
    this.isZoomed = true;
  }

  private zoomOut(duration: number) {
    this.scene.tweens.add({
      targets: this,
      displayWidth: this.width * this.scaleFactor,
      displayHeight: this.height * this.scaleFactor,
      duration: duration,
    });
    this.isZoomed = false;
  }

  public hover() {
    if ((this.scene as any).isDragging || this.scene.input.activePointer.isDown)
      return;

    if (!this.isZoomed) {
      this.isZoomed = true;
      this.scene.game.events.emit("playSound", "DECK_CARD_HOVER");
      this.scene.children.bringToTop(this);
      this.setDepth(20000);
      this.setCrop();

      const zoomWidth = this.width * this.zoomScaleFactor;
      const zoomHeight = this.height * this.zoomScaleFactor;
      const overlayX = this.x + zoomWidth / 2;
      const overlayY = this.y - zoomHeight / 2;

      const textureKey = `card-${this.cardProps.ImageFile}`;

      const emitHover = () => {
        if (this.isZoomed) {
          this.scene.events.emit(
            "ui:deck-card-hovered",
            this.cardProps,
            { x: overlayX, y: overlayY },
            "right",
          );
        }
      };

      if (
        this.scene.textures.exists(textureKey) &&
        this.texture.key === textureKey
      ) {
        emitHover();
      } else {
        const url = `/assets/cards/${this.cardProps.ImageFile}.jpg`;
        fetch(url, { priority: "high" } as any)
          .then((response) => response.blob())
          .then((blob) => {
            const objectUrl = URL.createObjectURL(blob);
            const htmlImage = new Image();
            htmlImage.onload = () => {
              URL.revokeObjectURL(objectUrl);
              if (this.scene && !this.scene.textures.exists(textureKey)) {
                this.scene.textures.addImage(textureKey, htmlImage);
              }
              if (this.scene) {
                AssetManager.forceGPUUpload(this.scene, textureKey);
              }
              if (this.scene && this.texture.key !== textureKey) {
                this.setTexture(textureKey);
                if (this.cardCopy) this.cardCopy.setTexture(textureKey);

                if (this.isZoomed) {
                  this.setDisplaySize(
                    this.width * this.zoomScaleFactor,
                    this.height * this.zoomScaleFactor,
                  );
                } else {
                  this.setDisplaySize(
                    this.width * this.scaleFactor,
                    this.height * this.scaleFactor,
                  );
                }
              }
              emitHover();
            };
            htmlImage.src = objectUrl;
          })
          .catch((err) => error("DeckCardView", "Hover fetch error:", err));
      }

      if (this.cardCopy !== null) {
        this.cardCopy.setVisible(false);
      }
      this.clearMask(false);

      if (this.labelBg) this.labelBg.setVisible(false);
      if (this.labelText) this.labelText.setVisible(false);

      this.zoomIn(75);
      editorEvents.emit("card-zoomed-in", this);
    }
  }

  public out(depth: number) {
    editorEvents.emit("card-zoomed-out", this);
    this.scene.events.emit("ui:deck-card-unhovered", this.cardProps);

    if (this.labelBg) this.labelBg.setVisible(true);
    if (this.labelText) this.labelText.setVisible(true);

    this.zoomOut(75);
    if (this.cardCopy !== null) {
      this.cardCopy.setVisible(this.visible);
    }
    this.setDepth(depth);
    if (this.maskRef) this.setMask(this.maskRef);

    if (this.searchArea) {
      this.applySearchClip(this.searchArea);
    } else {
      this.setCrop();
    }
  }

  public setMask(mask: Phaser.Display.Masks.GeometryMask | null): this {
    if (this.isZoomed) {
      return this;
    }
    return super.setMask(mask);
  }

  public reset() {
    this.scene.tweens.killTweensOf(this);
  }

  public destroy(fromScene?: boolean) {
    if (this.labelBg) this.labelBg.destroy();
    if (this.labelText) this.labelText.destroy();
    if (this.cardCopy) this.cardCopy.destroy();
    super.destroy(fromScene);
  }
}
