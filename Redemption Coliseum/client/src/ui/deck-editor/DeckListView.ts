import Phaser from "phaser";
import { type EditorCardData, type DeckEntry } from "./DeckListModel";
import { editorEvents } from "./EditorEventCenter";
import { AssetManager } from "../managers/AssetManager";
import { type FilterDefinition } from "../components/filters/FilterTypes";
import { NotificationManager } from "../notifications/NotificationManager";
import { renderBrigadeCircles } from "./BrigadeRenderer";


// Layout and UI configuration constants matching standalone specs
const EDITOR_LAYOUT = {
  deckAreaName: "Deck",
  reserveAreaName: "Reserve",
  deckEntryHeight: 30,
  deckEntrySpacing: 2,
  deckEntryScale: 1.05,
  scrollbarWidth: 10,
  scrollbarColor: 0xe9cd45,
  deleteSymbolSize: 24,
  deleteSymbolScale: 1.1,
  smallSymbolBGWidth: 32,
  goldColor: "#e9cd45",
  deckAreaFontSize: 28,
  boundary: 0.01,
  statsFontSize: 27,
  cardWidth: 344,
  cardHeight: 512,
  messageAreaWidth: 450,
  messageAreaHeight: 250,
};

export interface DeckEntryElement {
  card: EditorCardData;
  stack: DeckEntry;
  box: Phaser.GameObjects.Rectangle;
  del: Phaser.GameObjects.Image;
  qty: Phaser.GameObjects.BitmapText;
  text: Phaser.GameObjects.BitmapText;
  cont: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
}

export class DeckListView {
  private scene: Phaser.Scene;
  private deckArea: Phaser.Geom.Rectangle;
  private reserveArea: Phaser.Geom.Rectangle;
  private depth: number;
  private symbols: FilterDefinition[];
  private controller: any;
  private assetManager: AssetManager;

  public deckElements: DeckEntryElement[] = [];
  public reserveElements: DeckEntryElement[] = [];

  private deckMask: Phaser.Display.Masks.GeometryMask;
  private reserveMask: Phaser.Display.Masks.GeometryMask;

  private deckAreaRect: Phaser.Geom.Rectangle;
  private reserveAreaRect: Phaser.Geom.Rectangle;

  private deckScrolledDown: number = 0;
  private reserveScrolledDown: number = 0;
  private deckVisibleLines: number = 0;
  private reserveVisibleLines: number = 0;

  // Stats Text Elements
  private cardsInDeckText: Phaser.GameObjects.BitmapText;
  private cardsInReserveText: Phaser.GameObjects.BitmapText;
  private domsText: Phaser.GameObjects.BitmapText;
  private LSText: Phaser.GameObjects.BitmapText;

  // Scrollbar graphics
  private deckScrollbar: Phaser.GameObjects.Graphics;
  private reserveScrollbar: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    deckArea: Phaser.Geom.Rectangle,
    reserveArea: Phaser.Geom.Rectangle,
    depth: number,
    symbols: FilterDefinition[],
    controller: any
  ) {
    this.scene = scene;
    this.deckArea = deckArea;
    this.reserveArea = reserveArea;
    this.depth = depth;
    this.symbols = symbols;
    this.controller = controller;
    this.assetManager = new AssetManager(scene);

    this.deckMask = this.createMask(deckArea, 5);
    this.reserveMask = this.createMask(reserveArea, 5);

    this.deckAreaRect = new Phaser.Geom.Rectangle(
      deckArea.x - deckArea.width / 2,
      deckArea.y - deckArea.height / 2,
      deckArea.width,
      deckArea.height
    );
    this.reserveAreaRect = new Phaser.Geom.Rectangle(
      reserveArea.x - reserveArea.width / 2,
      reserveArea.y - reserveArea.height / 2,
      reserveArea.width,
      reserveArea.height
    );

    // Event listeners
    editorEvents.on("deck-updated", this.onDeckUpdated, this);
    editorEvents.on("reserve-updated", this.onReserveUpdated, this);

    this.deckVisibleLines = Math.floor(
      this.deckArea.height / (EDITOR_LAYOUT.deckEntryHeight + EDITOR_LAYOUT.deckEntrySpacing)
    );
    this.reserveVisibleLines = Math.floor(
      this.reserveArea.height / (EDITOR_LAYOUT.deckEntryHeight + EDITOR_LAYOUT.deckEntrySpacing)
    );

    // Stats layout calculation
    const scale = this.scene.scale.width / 1280;
    const statsFontSize = Math.max(16, Math.min(36, Math.round(EDITOR_LAYOUT.statsFontSize * scale)));
    const barHeight = 44 * scale;
    const statusBarTop =
      deckArea.y -
      deckArea.height / 2 -
      barHeight -
      deckArea.height * EDITOR_LAYOUT.boundary;

    const row1Y = statusBarTop + 10 * scale;
    const row2Y = statusBarTop + 30 * scale;

    const rightAnchor = deckArea.x + deckArea.width / 2 - 15 * scale;
    const buttonHalfWidth = (196 * 0.17 * scale) / 2;
    const leftAlignX = deckArea.x - deckArea.width / 2 + 40 * scale - buttonHalfWidth;

    // Load Wazoo font for deck metrics text
    this.cardsInDeckText = this.scene.add
      .bitmapText(leftAlignX, row1Y, "wazoo", "", statsFontSize)
      .setOrigin(0, 0.5)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(depth + 20);

    this.cardsInReserveText = this.scene.add
      .bitmapText(leftAlignX, row2Y, "wazoo", "", statsFontSize)
      .setOrigin(0, 0.5)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(depth + 20);

    this.domsText = this.scene.add
      .bitmapText(rightAnchor, row1Y, "wazoo", "", statsFontSize)
      .setOrigin(1, 0.5)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(depth + 20);

    this.LSText = this.scene.add
      .bitmapText(rightAnchor, row2Y, "wazoo", "", statsFontSize)
      .setOrigin(1, 0.5)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(depth + 20);

    this.deckScrollbar = this.scene.add.graphics().setDepth(depth + 10);
    this.reserveScrollbar = this.scene.add.graphics().setDepth(depth + 10);

    this.setupScrollbarInteraction();

    this.scene.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number, deltaZ: number) => {
        const x = pointer.x;
        const y = pointer.y;

        const inDeckArea =
          x >= this.deckArea.x - this.deckArea.width / 2 &&
          x <= this.deckArea.x + this.deckArea.width / 2 &&
          y >= this.deckArea.y - this.deckArea.height / 2 &&
          y <= this.deckArea.y + this.deckArea.height / 2;

        const inReserveArea =
          x >= this.reserveArea.x - this.reserveArea.width / 2 &&
          x <= this.reserveArea.x + this.reserveArea.width / 2 &&
          y >= this.reserveArea.y - this.reserveArea.height / 2 &&
          y <= this.reserveArea.y + this.reserveArea.height / 2;

        if (inDeckArea) {
          this.scroll(pointer, deltaX, Math.sign(deltaY), deltaZ, EDITOR_LAYOUT.deckAreaName);
        } else if (inReserveArea) {
          this.scroll(pointer, deltaX, Math.sign(deltaY), deltaZ, EDITOR_LAYOUT.reserveAreaName);
        }
      }
    );
  }

  private createMask(area: Phaser.Geom.Rectangle, radius: number): Phaser.Display.Masks.GeometryMask {
    const maskGfx = this.scene.make.graphics({});
    maskGfx.fillStyle(0xffffff);
    maskGfx.beginPath();
    maskGfx.fillRoundedRect(
      area.x - area.width / 2,
      area.y - area.height / 2,
      area.width,
      area.height,
      radius
    );
    return maskGfx.createGeometryMask();
  }

  public addCardElement(stack: DeckEntry, areaName: string, startCardX: number, cardElementY?: number): DeckEntryElement {
    const card = stack.card;
    const quantity = stack.quantity;

    // Filter matching symbols (Brigade and Icon badges)
    const filterManager = this.controller?.cardListModel?.filterManager;
    const matchingSymbols = filterManager
      ? this.symbols.filter(
          (f) =>
            (f.category === "symbol" || f.category === "brigade") &&
            f.iconSmallPath &&
            filterManager.evaluateFilter(card, f)
        )
      : [];

    const zoomScale = this.controller?.cardList?.cardZoomScale ?? 0.85;
    const zoomedWidth = EDITOR_LAYOUT.cardWidth * zoomScale;
    const zoomedHeight = EDITOR_LAYOUT.cardHeight * zoomScale;

    // Layout zoom image position (flush left of deck area)
    const imgX = this.deckArea.x - this.deckArea.width / 2 - zoomedWidth / 2 - 15;
    const imgY = this.deckArea.y - this.deckArea.height / 2 + zoomedHeight / 2;

    const boxW =
      this.deckArea.width -
      2 * this.deckArea.width * EDITOR_LAYOUT.boundary -
      EDITOR_LAYOUT.scrollbarWidth -
      5;

    const box = this.scene.add.rectangle(0, 0, boxW, EDITOR_LAYOUT.deckEntryHeight, 0x000000, 0.5);
    const del = this.scene.add.image(
      EDITOR_LAYOUT.deckEntrySpacing -
        this.deckArea.width / 2 +
        2 * (this.deckArea.width * EDITOR_LAYOUT.boundary) +
        EDITOR_LAYOUT.deleteSymbolSize / 2,
      0,
      "delete"
    );

    const qtyX =
      2 * EDITOR_LAYOUT.deckEntrySpacing -
      this.deckArea.width / 2 +
      2 * (this.deckArea.width * EDITOR_LAYOUT.boundary) +
      EDITOR_LAYOUT.deleteSymbolSize +
      10;

    const qty = this.scene.add
      .bitmapText(qtyX, -EDITOR_LAYOUT.deckEntryHeight / 2 + 2, "wazoo", `${quantity} x `, EDITOR_LAYOUT.deckAreaFontSize)
      .setDropShadow(3, 4, 0x000000)
      .setTint(Phaser.Display.Color.HexStringToColor(EDITOR_LAYOUT.goldColor).color);

    const text = this.scene.add
      .bitmapText(qtyX, -EDITOR_LAYOUT.deckEntryHeight / 2 + 2, "wazoo", card.Name, EDITOR_LAYOUT.deckAreaFontSize)
      .setDropShadow(3, 4, 0x000000);

    const containerX = Math.round(startCardX + this.deckArea.width / 2);
    const containerY = Math.round(cardElementY || 0);
    const container = this.scene.add.container(containerX, containerY);
    const textureKey = `card-${card.ImageFile}`;
    
    // Create image with existing texture or default missing texture
    const img = this.scene.add
      .image(imgX, imgY, textureKey)
      .setVisible(false)
      .setScale(zoomScale);

    // Eagerly load all images in the background so they are ready when hovered
    this.assetManager.loadCardImage(textureKey, `/assets/cards/${card.ImageFile}.jpg`, (loadedKey) => {
      if (img.scene && img.texture.key !== loadedKey) {
        img.setTexture(loadedKey);
      }
    });

    // Restrict text width to prevent overflowing into symbols
    const scrollbarOffset = EDITOR_LAYOUT.scrollbarWidth + 5;
    const maxWidth = this.deckArea.width - scrollbarOffset - 120;
    if (text.width > maxWidth) {
      let name = card.Name;
      while (text.width > maxWidth && name.length > 0) {
        name = name.substring(0, name.length - 1);
        text.setText(name + "...");
      }
    }
    text.setX(qty.x + qty.width + 5);

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      container.setMask(this.deckMask);
    } else {
      container.setMask(this.reserveMask);
    }

    container.add([box, del, qty, text]);

    // Separate brigade and other symbols to lay them out differently
    const brigadeSymbols = matchingSymbols.filter((s) => s.category === "brigade");
    const otherSymbols = matchingSymbols.filter((s) => s.category === "symbol");

    const SYMBOL_SPACING = 22; // Compact spacing for symbols without backgrounds

    // Draw brigade & symbol icon badges on the right side of the list element
    let symbolX =
      this.deckArea.width / 2 -
      2 * (this.deckArea.width * EDITOR_LAYOUT.boundary) -
      EDITOR_LAYOUT.deckEntrySpacing -
      12 - // 12px shift to safely clear the scrollbar thumb
      scrollbarOffset;

    // Render non-brigade symbols first (right-to-left)
    otherSymbols.forEach((symbol) => {
      const icon = this.scene.add.image(symbolX, 0, `${symbol.id}_small`);
      if (icon.texture) {
        icon.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      container.add(icon);
      symbolX -= SYMBOL_SPACING;
    });

    // Render brigade circles using the new BrigadeRenderer utility
    const goldColorNum = Phaser.Display.Color.HexStringToColor(EDITOR_LAYOUT.goldColor).color;
    symbolX = renderBrigadeCircles(this.scene, container, symbolX, brigadeSymbols, goldColorNum);

    container.setDepth(this.depth);
    box.setInteractive({ useHandCursor: true });

    box.on("pointerover", () => {
      if ((this.scene as any).isDragging || this.scene.input.activePointer.isDown) return;

      this.scene.game.events.emit("playSound", "DECK_CARD_ENTRY_OVER");
      
      box.setFillStyle(0x000000, 0.7);
      container.setScale(EDITOR_LAYOUT.deckEntryScale).setDepth(5000);
      img.setData('isHovered', true);
      img.setDepth(20000);

      const emitHover = () => {
        if (img.getData('isHovered')) {
          const imgBounds = img.getBounds();
          this.scene.events.emit("ui:deck-card-hovered", card, { x: imgBounds.x, y: imgBounds.y }, "left");
        }
      };

      // Update texture just in case it loaded while we weren't looking
      if (img.texture.key !== textureKey && this.scene.textures.exists(textureKey)) {
        img.setTexture(textureKey);
      }

      if (img.texture.key === textureKey) {
        img.setVisible(true);
        img.setDepth(20000);
        if (img.scene) img.scene.children.bringToTop(img);
        emitHover();
      } else if (img.texture.key !== textureKey || !this.scene.textures.exists(textureKey)) {
        // High-priority bypass for Vite Dev Server queue clogging
        const url = `/assets/cards/${card.ImageFile}.jpg`;
        fetch(url, { priority: 'high' } as any)
          .then(response => response.blob())
          .then(blob => {
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
              if (img.scene && img.texture.key !== textureKey) {
                img.setTexture(textureKey);
                if (img.getData('isHovered')) {
                  img.setVisible(true);
                  img.setDepth(20000);
                  if (img.scene) img.scene.children.bringToTop(img);
                  emitHover();
                }
              }
            };
            htmlImage.src = objectUrl;
          });
      }
    });

    box.on("pointerout", () => {
      this.scene.events.emit("ui:deck-card-unhovered", card);
      img.setData('isHovered', false);
      img.setVisible(false);
      box.setFillStyle(0x000000, 0.5);
      container.setScale(1.0).setDepth(this.depth);
    });

    del.setInteractive({ useHandCursor: true });
    del.on("pointerover", () => del.setScale(EDITOR_LAYOUT.deleteSymbolScale));
    del.on("pointerout", () => del.setScale(1.0));
    del.on("pointerup", () => {
      if (this.controller) {
        this.controller.removeCard(cardElement, areaName);
      }
    });

    const cardElement: DeckEntryElement = {
      card,
      stack,
      box,
      del,
      qty,
      text,
      cont: container,
      img,
    };

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      this.deckElements.push(cardElement);
    } else {
      this.reserveElements.push(cardElement);
    }

    this.updateLayout(areaName);
    return cardElement;
  }

  public removeCardElement(cardElement: DeckEntryElement, areaName: string) {
    this.scene.events.emit("ui:deck-card-unhovered", cardElement.card);
    if (cardElement.text) cardElement.text.destroy();
    if (cardElement.qty) cardElement.qty.destroy();
    if (cardElement.del) cardElement.del.destroy();
    if (cardElement.box) cardElement.box.destroy();
    if (cardElement.cont) cardElement.cont.destroy();
    if (cardElement.img) cardElement.img.destroy();

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      const idx = this.deckElements.indexOf(cardElement);
      if (idx !== -1) this.deckElements.splice(idx, 1);
    } else {
      const idx = this.reserveElements.indexOf(cardElement);
      if (idx !== -1) this.reserveElements.splice(idx, 1);
    }
  }

  public clearAllElements() {
    this.renderList([], EDITOR_LAYOUT.deckAreaName);
    this.renderList([], EDITOR_LAYOUT.reserveAreaName);
  }

  public renderList(stacks: DeckEntry[], areaName: string) {
    const elements =
      areaName === EDITOR_LAYOUT.deckAreaName ? this.deckElements : this.reserveElements;
    
    // Deep clone copy array since elements array gets spliced during removal
    const listCopy = [...elements];
    listCopy.forEach((elem) => this.removeCardElement(elem, areaName));

    const startCardX =
      (areaName === EDITOR_LAYOUT.deckAreaName ? this.deckArea.x : this.reserveArea.x) -
      this.deckArea.width / 2;

    stacks.forEach((stack) => {
      this.addCardElement(stack, areaName, startCardX);
    });

    this.updateScrollbar(areaName);
  }

  public updateLayout(areaName: string) {
    let elements: DeckEntryElement[];
    let startY: number;
    let scrolledDown: number;

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      elements = this.deckElements;
      startY =
        this.deckArea.y -
        this.deckArea.height / 2 +
        EDITOR_LAYOUT.deckEntryHeight / 2 +
        this.deckArea.height * EDITOR_LAYOUT.boundary;
      scrolledDown = this.deckScrolledDown;
    } else {
      elements = this.reserveElements;
      startY =
        this.reserveArea.y -
        this.reserveArea.height / 2 +
        EDITOR_LAYOUT.deckEntryHeight / 2 +
        this.reserveArea.height * EDITOR_LAYOUT.boundary;
      scrolledDown = this.reserveScrolledDown;
    }

    for (let i = 0; i < elements.length; i++) {
      elements[i].cont.y = Math.round(
        startY + (i - scrolledDown) * (EDITOR_LAYOUT.deckEntryHeight + EDITOR_LAYOUT.deckEntrySpacing)
      );
      this.checkDeckElementVisibility(elements[i], areaName);
    }

    this.updateScrollbar(areaName);
  }

  public updateStats(result: any) {
    if (!result.deckSize.isValid) {
      this.cardsInDeckText.setTint(0xff0000);
    } else {
      this.cardsInDeckText.clearTint();
    }

    if (!result.reserveSize.isValid) {
      this.cardsInReserveText.setTint(0xff0000);
    } else {
      this.cardsInReserveText.clearTint();
    }

    if (!result.dominants.isValid) {
      this.domsText.setTint(0xff0000);
    } else {
      this.domsText.clearTint();
    }

    if (!result.lostSouls.isValid) {
      this.LSText.setTint(0xff0000);
    } else {
      this.LSText.clearTint();
    }

    this.cardsInDeckText.setText(`Cards in deck: ${result.deckSize.current}/${result.deckSize.min}`);
    this.cardsInReserveText.setText(`Cards in Reserve: ${result.reserveSize.current}/${result.reserveSize.max}`);
    this.domsText.setText(`Dominants: ${result.dominants.current}/${result.dominants.maxAllowed}`);
    this.LSText.setText(`Lost Souls: ${result.lostSouls.current}/${result.lostSouls.minRequired}`);
  }

  public scroll(pointer: any, deltaX: number, deltaY: number, deltaZ: number, areaName: string) {
    let scrolledDown: number;
    let cardElements: DeckEntryElement[];
    let visibleLines: number;

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      scrolledDown = this.deckScrolledDown;
      cardElements = this.deckElements;
      visibleLines = this.deckVisibleLines;
    } else {
      scrolledDown = this.reserveScrolledDown;
      cardElements = this.reserveElements;
      visibleLines = this.reserveVisibleLines;
    }

    if (cardElements.length > visibleLines) {
      const scrollStep = Math.sign(deltaY);
      if (
        (scrolledDown > 0 && scrollStep < 0) ||
        (scrolledDown < Math.ceil(cardElements.length - visibleLines) && scrollStep > 0)
      ) {
        cardElements.forEach((element) => {
          element.cont.y = Math.round(
            element.cont.y - scrollStep * (EDITOR_LAYOUT.deckEntryHeight + EDITOR_LAYOUT.deckEntrySpacing)
          );
          this.checkDeckElementVisibility(element, areaName);
        });
        scrolledDown += scrollStep;
      }
    }

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      this.deckScrolledDown = scrolledDown;
      this.updateScrollbar(EDITOR_LAYOUT.deckAreaName);
    } else {
      this.reserveScrolledDown = scrolledDown;
      this.updateScrollbar(EDITOR_LAYOUT.reserveAreaName);
    }
  }

  private checkDeckElementVisibility(deckElement: DeckEntryElement, areaName: string) {
    const areaRect =
      areaName === EDITOR_LAYOUT.deckAreaName ? this.deckAreaRect : this.reserveAreaRect;
    const y = deckElement.cont.y;
    deckElement.cont.setVisible(
      areaRect !== null && y >= areaRect.top && y <= areaRect.bottom
    );
  }

  private setupScrollbarInteraction() {
    const areas = [
      { name: EDITOR_LAYOUT.deckAreaName, rect: this.deckAreaRect, isDragging: false },
      { name: EDITOR_LAYOUT.reserveAreaName, rect: this.reserveAreaRect, isDragging: false },
    ];

    areas.forEach((area) => {
      const scrollbarWidth = EDITOR_LAYOUT.scrollbarWidth;
      const interactiveZone = this.scene.add
        .rectangle(
          area.rect.right - scrollbarWidth,
          area.rect.top,
          scrollbarWidth + 10,
          area.rect.height,
          0x000000,
          0
        )
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(9999);

      interactiveZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        area.isDragging = true;
        this.handleScrollbarPointer(pointer, area.name);
      });

      window.addEventListener("mousemove", (e: MouseEvent) => {
        if (!area.isDragging) return;
        const canvas = this.scene.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;
        this.handleScrollbarPointer(
          { y: (e.clientY - rect.top) * scaleY } as any,
          area.name
        );
      });

      window.addEventListener("mouseup", () => {
        area.isDragging = false;
      });
    });
  }

  private handleScrollbarPointer(pointer: any, areaName: string) {
    let areaRect: Phaser.Geom.Rectangle;
    let visibleLines: number;
    let elements: DeckEntryElement[];
    let currentScroll: number;

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      areaRect = this.deckAreaRect;
      visibleLines = this.deckVisibleLines;
      elements = this.deckElements;
      currentScroll = this.deckScrolledDown;
    } else {
      areaRect = this.reserveAreaRect;
      visibleLines = this.reserveVisibleLines;
      elements = this.reserveElements;
      currentScroll = this.reserveScrolledDown;
    }

    if (elements.length <= visibleLines) return;
    const targetScroll = Math.round(
      Phaser.Math.Clamp((pointer.y - areaRect.top) / areaRect.height, 0, 1) *
        (elements.length - visibleLines)
    );
    if (targetScroll !== currentScroll) {
      this.scroll(null, 0, targetScroll - currentScroll, 0, areaName);
    }
  }

  private updateScrollbar(areaName: string) {
    let graphics: Phaser.GameObjects.Graphics;
    let areaRect: Phaser.Geom.Rectangle;
    let visibleLines: number;
    let elements: DeckEntryElement[];
    let scrolledDown: number;

    if (areaName === EDITOR_LAYOUT.deckAreaName) {
      graphics = this.deckScrollbar;
      areaRect = this.deckAreaRect;
      visibleLines = this.deckVisibleLines;
      elements = this.deckElements;
      scrolledDown = this.deckScrolledDown;
    } else {
      graphics = this.reserveScrollbar;
      areaRect = this.reserveAreaRect;
      visibleLines = this.reserveVisibleLines;
      elements = this.reserveElements;
      scrolledDown = this.reserveScrolledDown;
    }

    graphics.clear();
    if (elements.length <= visibleLines) return;

    const scrollbarWidth = EDITOR_LAYOUT.scrollbarWidth;
    const x = areaRect.right - scrollbarWidth - 2;
    const trackHeight = areaRect.height;

    // Draw scrollbar track
    graphics.fillStyle(0x000000, 0.5);
    graphics.fillRoundedRect(x, areaRect.top, scrollbarWidth, trackHeight, scrollbarWidth / 2);
    graphics.lineStyle(1, EDITOR_LAYOUT.scrollbarColor, 0.3);
    graphics.strokeRoundedRect(x, areaRect.top, scrollbarWidth, trackHeight, scrollbarWidth / 2);

    // Draw thumb handle
    const thumbHeight = Math.max(20, (visibleLines / elements.length) * trackHeight);
    const thumbY =
      areaRect.top + (scrolledDown / (elements.length - visibleLines)) * (trackHeight - thumbHeight);

    graphics.fillStyle(EDITOR_LAYOUT.scrollbarColor, 0.8);
    graphics.fillRoundedRect(x, thumbY, scrollbarWidth, thumbHeight, scrollbarWidth / 2);
    graphics.lineStyle(1, 0xffffff, 0.3);
    graphics.strokeRoundedRect(x, thumbY, scrollbarWidth, thumbHeight, scrollbarWidth / 2);
  }

  /**
   * Displays the HTML sharing dialog.
   */
  public showURLOverlay(deckURLString: string) {
    const notificationManager = this.scene.registry.get("notificationManager") as NotificationManager;
    if (notificationManager) {
      notificationManager.showDeckShare(deckURLString);
    }
  }


  private onDeckUpdated(deck: DeckEntry[]) {
    this.renderList(deck, EDITOR_LAYOUT.deckAreaName);
  }

  private onReserveUpdated(reserve: DeckEntry[]) {
    this.renderList(reserve, EDITOR_LAYOUT.reserveAreaName);
  }

  public destroy() {
    editorEvents.off("deck-updated", this.onDeckUpdated, this);
    editorEvents.off("reserve-updated", this.onReserveUpdated, this);
    this.deckScrollbar.destroy();
    this.reserveScrollbar.destroy();
    this.cardsInDeckText.destroy();
    this.cardsInReserveText.destroy();
    this.domsText.destroy();
    this.LSText.destroy();
  }
}
