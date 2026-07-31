import Phaser from "phaser";
import { type SoundManager } from "../../managers/SoundManager";
import { CardListModel } from "../../ui/deck-editor/CardListModel";
import {
  DeckListModel,
  type EditorCardData,
} from "../../ui/deck-editor/DeckListModel";
import { DeckListView } from "../../ui/deck-editor/DeckListView";
import { DeckCardView } from "../../ui/deck-editor/DeckCardView";
import { DeckButtonManager } from "../../ui/deck-editor/DeckButtonManager";
import { DeckDragDropHandler } from "../../ui/deck-editor/DeckDragDropHandler";
import { DeckScrollHandler } from "../../ui/deck-editor/DeckScrollHandler";
import { VerticalCardScrollList } from "../../ui/components/VerticalCardScrollList";
import {
  IconToggleGroup,
  type ToggleItemConfig,
} from "../../ui/components/IconToggleGroup";
import { TextFilterView } from "../../ui/deck-editor/TextFilterView";
import { DeckIO } from "../../ui/deck-editor/DeckIO";
import { DeckUtils } from "../../utils/DeckUtils";
import { editorEvents } from "../../ui/deck-editor/EditorEventCenter";
import { CardMetricsOverlay } from "../../ui/deck-editor/CardMetricsOverlay";
import { FilterManager } from "../../ui/components/filters/FilterManager";
import { DeckMetricsOverlayManager } from "../../ui/managers/DeckMetricsOverlayManager";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { log } from "../../utils/logger";
import { DeckValidator } from "../../../../shared/DeckValidator.js";
import { filterConfigData } from "../../ui/config/filter_config";
import { NotificationManager } from "../../ui/notifications/NotificationManager";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { HelpOverlay } from "../../ui/overlays";


const EDITOR_CONFIG = {
  width: 1280,
  height: 720,
  boundary: 0.01,
  searchAreaWidth: 1280 * 0.7,
  searchAreaHeight: 720 * 0.8,
  searchAreaRadius: 5,
  deckAreaWidth: 1280 * 0.27,
  deckAreaHeight: 720 * 0.5,
  deckAreaRadius: 5,
  reserveAreaWidth: 1280 * 0.27,
  reserveAreaHeight: 720 * 0.3,
  reserveAreaRadius: 5,
  statsFontSize: 27,
  cardWidth: 344,
  cardHeight: 512,
  cardScale: 0.32,
  cardZoomScale: 1.15,
  symbolScale: 0.25,
};

export class DeckEditorScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private cardListModel!: CardListModel;
  private deckListModel!: DeckListModel;
  private loadedDeckName: string | null = null;
  private isDirty = false;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null; // Debounce timer for window resize
  private batchActive = false; // Guards createCardViewsBatched against stale callbacks
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private scrollList!: VerticalCardScrollList;
  private deckListView!: DeckListView;
  private buttonManager!: DeckButtonManager;
  private cardMetricsOverlay!: CardMetricsOverlay;
  private dragDropHandler!: DeckDragDropHandler;
  private scrollHandler!: DeckScrollHandler;
  private textFilterView!: TextFilterView;

  private background!: Phaser.GameObjects.Image;
  private maskGfx!: Phaser.GameObjects.Graphics;
  private geometryMask!: Phaser.Display.Masks.GeometryMask;

  // Viewport Areas
  private searchAreaRect!: Phaser.Geom.Rectangle;
  private deckAreaRect!: Phaser.Geom.Rectangle;
  private reserveAreaRect!: Phaser.Geom.Rectangle;

  private deckZone!: Phaser.GameObjects.Zone;
  private reserveZone!: Phaser.GameObjects.Zone;

  // Scroll Indicators
  public searchArrowUp!: Phaser.GameObjects.Image;
  public searchArrowDown!: Phaser.GameObjects.Image;

  // Selection Status Label
  private cardsSelectedText!: Phaser.GameObjects.BitmapText;

  private allCardViews: DeckCardView[] = [];
  private buttons: { bg: Phaser.GameObjects.Image; text: Phaser.GameObjects.BitmapText; shadow: Phaser.GameObjects.BitmapText }[] = [];
  private settingsButton!: SidebarButton;
  private exitButton!: SidebarButton;
  private helpButton!: SidebarButton;

  private savedDeckIDsJSON: string | null = null;
  private layoutConfig!: {
    width: number;
    height: number;
    boundary: number;
    searchAreaWidth: number;
    searchAreaHeight: number;
    searchAreaRadius: number;
    searchAreaLeft: number;
    searchAreaTop: number;
    deckAreaWidth: number;
    deckAreaHeight: number;
    deckAreaRadius: number;
    deckAreaLeft: number;
    deckAreaTop: number;
    reserveAreaWidth: number;
    reserveAreaHeight: number;
    reserveAreaRadius: number;
    reserveAreaLeft: number;
    reserveAreaTop: number;
    statsFontSize: number;
    cardWidth: number;
    cardHeight: number;
    cardScale: number;
    cardZoomScale: number;
    symbolScale: number;
    row1Y: number;
    row2Y: number;
    statusBarTop: number;
    statusBarHeight: number;
    scale: number;
  };

  constructor() {
    super("DeckEditorScene");
  }

  init(data: any) {
    if (data) {
      if (data.deckIDsJSON) {
        this.savedDeckIDsJSON = data.deckIDsJSON;
      }
      if (data.deckName) {
        this.loadedDeckName = data.deckName;
      }
    }
  }

  preload() {
    // 1. Preload deck metrics HTML overlay template
    this.load.html("deckMetrics", "templates/deckMetrics.html?v=" + Date.now());
    this.load.html("cardMetrics", "templates/cardMetrics.html?v=" + Date.now());

    // 2. Preload specific graphics and spritesheets
    this.load.image("background", "assets/backgrounds/deck_editor_bg.jpg");
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png",
    );
    this.load.image(
      "button_exit",
      "assets/ui/buttons/Button_Copilot_20260730_001735_exit.png",
    );
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png"
    );
    this.load.image(
      "delete",
      "assets/deck-editor/symbols/cross_circle_small_compressed.png",
    );
    this.load.image(
      "symbolBGsmall",
      "assets/deck-editor/symbols/card_icon_small.png",
    );

    // Loaded from shared buttons
    this.load.image("arrowUp", "assets/ui/buttons/arrow-up_small.png");
    this.load.image("arrowDown", "assets/ui/buttons/arrow-down_small.png");
    this.load.image("load", "assets/deck-editor/symbols/Load_small.png");
    this.load.image("save", "assets/deck-editor/symbols/Save_small.png");
    this.load.image(
      "clear",
      "assets/deck-editor/symbols/Delete_small_compressed.png",
    );
    this.load.image(
      "logout",
      "assets/deck-editor/symbols/logout.png",
    );
    this.load.image(
      "battle",
      "assets/deck-editor/symbols/Battle.png",
    );
    this.load.image(
      "share",
      "assets/deck-editor/symbols/ShareURL_compressed.png",
    );
    this.load.image(
      "saveLackey",
      "assets/deck-editor/symbols/SaveLackey_compressed.png",
    );
    this.load.image(
      "loadLackey",
      "assets/deck-editor/symbols/LoadLackey_compressed.png",
    );
    this.load.image(
      "deckMetrics",
      "assets/deck-editor/symbols/chart_small.png",
    );

    this.load.image(
      "checkBoxUnChecked",
      "assets/ui/checkboxes/checkBox_Unchecked_compressed.png",
    );
    this.load.image(
      "checkBoxChecked",
      "assets/ui/checkboxes/checkBox_Checked_compressed.png",
    );

    // Load new unified filter config
    this.cache.json.add("filterConfig", filterConfigData);
    this.load.image("filterSelected", "assets/ui/filter-icons/selected.png");
    if (filterConfigData && filterConfigData.filters) {
      filterConfigData.filters.forEach((filter: any) => {
        if (filter.iconPath) {
          this.load.image(filter.id, filter.iconPath);
        }
        if (filter.iconSmallPath) {
          this.load.image(`${filter.id}_small`, filter.iconSmallPath);
        }
      });
    }

    // Fonts and audio
    this.load.bitmapFont(
      "fairyDust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml",
    );
    this.load.bitmapFont(
      "wazoo",
      "assets/fonts/bitmap/Wazoo.png",
      "assets/fonts/bitmap/Wazoo.xml",
    );

    // Preload exact 12 standalone editor sounds
    this.load.audio(
      "checkButtonHover",
      "assets/sounds/effects/swing-whoosh-110410_short.mp3",
    );
    this.load.audio(
      "checkButtonSelect",
      "assets/sounds/effects/notification-sound-7062.mp3",
    );
    this.load.audio(
      "checkButtonDeselect",
      "assets/sounds/effects/ToggleSwitchMetal PE1090917.mp3",
    );
    this.load.audio(
      "cardHover",
      "assets/deck-editor/sounds/TorchWhooshPanned PE1037805_short.mp3",
    );
    this.load.audio(
      "cardScroll",
      "assets/deck-editor/sounds/484967__spacejoe__quiet-page-turn-7.wav",
    );
    this.load.audio(
      "error",
      "assets/deck-editor/sounds/188013__isaac200000__error.wav",
    );
    this.load.audio("addCard", "assets/deck-editor/sounds/uisound1-79819.mp3");
    this.load.audio(
      "removeCard",
      "assets/deck-editor/sounds/Menu Selection Click.wav",
    );
    this.load.audio(
      "cardEntryOver",
      "assets/deck-editor/sounds/470377__erokia__menu-ui-click-140.wav",
    );
    this.load.audio(
      "ctrlBtn",
      "assets/deck-editor/sounds/clickswitch-03-104090.mp3",
    );
    this.load.audio(
      "clearDeck",
      "assets/deck-editor/sounds/cleardeck_short.mp3",
    );
    this.load.audio(
      "deckEditorBGM",
      "assets/deck-editor/sounds/rise-of-the-enemy-full-2-09-14302.mp3",
    );

    // Preload first 60 card fronts for immediate display
    const cardDatabase = this.registry.get("cardDatabase") as any;
    const first60Cards = cardDatabase.cards.slice(0, 60);
    first60Cards.forEach((c: any) => {
      const key = `card-${c.ImageFile}`;
      const url = `assets/cards/${c.ImageFile}.jpg`;
      this.load.image(key, url);
    });
  }

  create() {
    this.soundManager = this.registry.get("soundManager");
    this.input.setTopOnly(false);

    // Reset camera zoom and scroll to native coordinates
    this.cameras.main.setZoom(1.0);
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setRoundPixels(true);

    // Calculate layout configuration dynamically based on actual screen size
    this.calculateLayoutConfig(this.scale.width, this.scale.height);

    // Render wallpaper background aligned bottom-right
    this.background = this.add.image(
      this.scale.width,
      this.scale.height,
      "background",
    );
    this.adjustBackgroundSize();


    // ✨ Mobile: Schließe das Overlay, wenn man in den leeren Raum klickt
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
      // Wenn nichts Interaktives (wie Buttons oder Listen-Elemente) getroffen wurde
      if (pointer.wasTouch && gameObjects.length === 0) {
        if (this.cardMetricsOverlay) {
          this.cardMetricsOverlay.hide();
        }
        // Gib der DeckListView bescheid, dass der State zurückgesetzt werden soll
        if (this.deckListView) {
           this.deckListView.deckElements.forEach(e => e.box.emit("force-out"));
           this.deckListView.reserveElements.forEach(e => e.box.emit("force-out"));
        }
        // Gib allen DeckCardViews (Search Area) bescheid
        this.allCardViews.forEach(v => v.emit("force-out"));
      }
    });

    this.events.on("ui:force-deck-cards-out", () => {
      this.allCardViews.forEach(v => v.emit("force-out"));
    });
    
    this.events.on("ui:deck-list-layout-refresh", () => {
      if (this.scrollList) {
        this.scrollList.updateLayout();
      }
    });

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
      // Cancel any pending card-creation batch to avoid callbacks firing after scene teardown
      this.batchActive = false;
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      if (this.buttonManager) this.buttonManager.destroy();
      if (this.deckListView) this.deckListView.destroy();
      if (this.dragDropHandler) this.dragDropHandler.destroy();
      if (this.cardMetricsOverlay) this.cardMetricsOverlay.destroy();
      editorEvents.off("save-deck", this.saveDeckJSON, this);
      editorEvents.off("load-deck", this.loadDeckJSON, this);
      editorEvents.off("save-deck-lackey", this.saveDeckLackey, this);
      editorEvents.off("load-deck-lackey", this.loadDeckLackey, this);
      editorEvents.off("clear-deck", this.clearDeck, this);
      editorEvents.off("share-deck", this.shareDeck, this);
      editorEvents.off("show-deck-metrics", this.showDeckMetrics, this);
      editorEvents.off("battle-start", this.startBattleFromEditor, this);
    });

    // 1. Calculate positions and rects based on dynamic screen coordinates
    this.searchAreaRect = new Phaser.Geom.Rectangle(
      this.layoutConfig.searchAreaLeft,
      this.layoutConfig.searchAreaTop,
      this.layoutConfig.searchAreaWidth,
      this.layoutConfig.searchAreaHeight,
    );

    this.deckAreaRect = new Phaser.Geom.Rectangle(
      this.layoutConfig.deckAreaLeft,
      this.layoutConfig.deckAreaTop,
      this.layoutConfig.deckAreaWidth,
      this.layoutConfig.deckAreaHeight,
    );

    this.reserveAreaRect = new Phaser.Geom.Rectangle(
      this.layoutConfig.reserveAreaLeft,
      this.layoutConfig.reserveAreaTop,
      this.layoutConfig.reserveAreaWidth,
      this.layoutConfig.reserveAreaHeight,
    );

    // 2. Draw glassmorphic grid background rectangles
    const drawAreaGraphics = (rect: Phaser.Geom.Rectangle, radius: number) => {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
      g.lineStyle(1, 0xe9cd45, 0.4);
      g.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
      g.setDepth(5);
    };
    drawAreaGraphics(this.searchAreaRect, this.layoutConfig.searchAreaRadius);
    drawAreaGraphics(this.deckAreaRect, this.layoutConfig.deckAreaRadius);
    drawAreaGraphics(this.reserveAreaRect, this.layoutConfig.reserveAreaRadius);

    // 3. Register physical drop zones
    this.deckZone = this.add
      .zone(
        this.deckAreaRect.x + this.deckAreaRect.width / 2,
        this.deckAreaRect.y + this.deckAreaRect.height / 2,
        this.deckAreaRect.width,
        this.deckAreaRect.height,
      )
      .setRectangleDropZone(this.deckAreaRect.width, this.deckAreaRect.height);
    this.deckZone.name = "Deck";

    this.reserveZone = this.add
      .zone(
        this.reserveAreaRect.x + this.reserveAreaRect.width / 2,
        this.reserveAreaRect.y + this.reserveAreaRect.height / 2,
        this.reserveAreaRect.width,
        this.reserveAreaRect.height,
      )
      .setRectangleDropZone(
        this.reserveAreaRect.width,
        this.reserveAreaRect.height,
      );
    this.reserveZone.name = "Reserve";

    // 4. Construct Geometry Mask for the vertical card scroll list viewport
    this.maskGfx = this.make.graphics({});
    this.maskGfx.fillStyle(0xffffff);
    this.maskGfx.beginPath();
    this.maskGfx.fillRoundedRect(
      this.searchAreaRect.x,
      this.searchAreaRect.y,
      this.searchAreaRect.width,
      this.searchAreaRect.height,
      this.layoutConfig.searchAreaRadius,
    );
    this.geometryMask = this.maskGfx.createGeometryMask();

    // 5. Instantiate Models & FilterManager
    this.cardListModel = new CardListModel();
    const configData = this.cache.json.get("filterConfig");
    const filterManager = new FilterManager(configData);
    this.cardListModel.setFilterManager(filterManager);
    this.deckListModel = new DeckListModel();

    // 6. Instantiate Scroll list container
    this.scrollList = new VerticalCardScrollList(
      this,
      this.searchAreaRect.x,
      this.searchAreaRect.y,
      this.searchAreaRect.width,
      this.searchAreaRect.height,
    );
    this.scrollList.setDepth(15);
    this.scrollList.setListMask(this.geometryMask);
    this.scrollList.calculateLayout(
      this.layoutConfig.cardWidth,
      this.layoutConfig.cardHeight,
      this.layoutConfig.cardScale,
    );

    this.scrollHandler = new DeckScrollHandler(this.scrollList);

    // 7. Load database cards
    const cardDatabase = this.registry.get("cardDatabase") as any;
    this.cardListModel.loadCards(cardDatabase.cards);

    // Play custom loop music (smoothly fades out active playlist BGM first)
    this.soundManager.playLoopingMusic("deckEditorBGM");

    // Populate sprite pool in batches across multiple frames to avoid blocking
    // the main thread. Rendering the first batch immediately shows the UI
    // without a long black-screen freeze.
    this.allCardViews = [];
    this.createCardViewsBatched();

    if (this.loadedDeckName) {
      const localDB = new LocalDecksDB();
      localDB.getVirtualDeck(this.loadedDeckName).then(async (wrapped) => {
        if (wrapped && wrapped.deckData) {
          this.loadDeckFromIDs(
            wrapped.deckData.main || [],
            wrapped.deckData.reserve || []
          );
        } else if ("showDirectoryPicker" in window) {
          try {
            const targetDir = await localDB.getDirectoryHandle("target_dir");
            if (targetDir) {
              const fileHandle = await targetDir.getFileHandle(`${this.loadedDeckName}.json`, { create: false });
              const file = await fileHandle.getFile();
              const text = await file.text();
              const parsed = JSON.parse(text);
              const main = parsed.deckData?.main || parsed.deck?.main || parsed.main || [];
              const reserve = parsed.deckData?.reserve || parsed.deck?.reserve || parsed.reserve || [];
              this.loadDeckFromIDs(main, reserve);
            }
          } catch (err) {
            log("DeckEditorScene", `Could not load deck file from disk for ${this.loadedDeckName}`, err);
          }
        }
      });
    }
  }

  /**
   * Creates DeckCardView objects in chunks of BATCH_SIZE per frame using
   * setTimeout (not Phaser's time.delayedCall) so the browser truly yields
   * between batches: scroll events, pointer events, and rendering can all
   * happen between chunks, making the UI immediately interactive.
   *
   * Note: DeckCardView no longer creates expensive Text labels in the constructor —
   * those are created lazily when a card first enters the viewport (ensureLabels).
   * That means batches here are very fast (just Sprite creation) and the app
   * stays responsive from the very first frame.
   */
  private createCardViewsBatched() {
    const BATCH_SIZE = 30; // Small batches → browser breathes between each
    const cards = this.cardListModel.cards;
    let index = 0;
    this.batchActive = true;

    const processBatch = () => {
      // Guard: abort if scene was shut down (e.g. during window resize).
      // NOTE: do NOT check this.sys.isActive() here — Phaser sets status=RUNNING
      // only AFTER create() returns, so isActive() would be false for the first
      // synchronous batch call and all setTimeout callbacks fired during startup.
      if (!this.batchActive) return;

      const end = Math.min(index + BATCH_SIZE, cards.length);
      for (let i = index; i < end; i++) {
        const card = cards[i];
        const view = new DeckCardView(
          this,
          0,
          0,
          this.layoutConfig.cardWidth,
          this.layoutConfig.cardHeight,
          this.layoutConfig.cardScale,
          this.layoutConfig.cardZoomScale,
          "cardback",
          0,
          this.geometryMask,
          card,
          this.searchAreaRect,
        );
        view.active = card.selected ?? true;
        this.allCardViews.push(view);
      }
      index = end;

      // Refresh scroll list with what we have so far
      // Only reset scroll offset on the very first batch!
      this.scrollList.setItems(this.allCardViews, index <= BATCH_SIZE);
      // Only call updateScrollIndicators if the arrow objects are still alive
      if (this.searchArrowUp?.scene && this.searchArrowDown?.scene) {
        this.scrollList.updateScrollIndicators(
          this.searchArrowUp,
          this.searchArrowDown,
        );
      }

      if (index < cards.length) {
        // setTimeout (not time.delayedCall) yields to the BROWSER event loop:
        // scroll/pointer events are processed before the next batch runs.
        this.batchTimer = setTimeout(processBatch, 0);
      } else {
        // All views created — finalise
        this.batchActive = false;
        this.batchTimer = null;
        this.applyFilterChangesToViews(false);
      }
    };

    processBatch(); // First batch runs synchronously in this frame

    // 8. Create Scroll Chevrons
    const arrowX =
      this.searchAreaRect.x +
      this.searchAreaRect.width -
      20 * this.layoutConfig.scale;
    const arrowScale = 0.7 * this.layoutConfig.scale;
    this.searchArrowUp = this.add
      .image(
        arrowX,
        this.searchAreaRect.y + 16 * this.layoutConfig.scale,
        "arrowUp",
      )
      .setScale(arrowScale)
      .setAlpha(0.8)
      .setDepth(1050)
      .setInteractive({ useHandCursor: true });
    this.searchArrowDown = this.add
      .image(
        arrowX,
        this.searchAreaRect.y +
        this.searchAreaRect.height -
        16 * this.layoutConfig.scale,
        "arrowDown",
      )
      .setScale(arrowScale)
      .setAlpha(0.8)
      .setDepth(1050)
      .setInteractive({ useHandCursor: true });

    // Setup arrow click and hold events
    let isContinuousScrolling = false;
    let activeScrollDir = 0;

    const startContinuousScroll = (dir: number) => {
      if (isContinuousScrolling && activeScrollDir === dir) return;
      isContinuousScrolling = true;
      activeScrollDir = dir;

      // Play click/scroll feedback sound immediately
      const moved =
        (dir < 0 && !this.scrollList.atTop()) ||
        (dir > 0 && !this.scrollList.atBottom());
      this.soundManager.playSound(moved ? "DECK_CARD_SCROLL" : "DECK_ERROR");

      this.scrollList.startContinuousScroll(dir);
    };

    const stopContinuousScroll = () => {
      if (!isContinuousScrolling) return;
      isContinuousScrolling = false;
      this.scrollList.stopContinuousScroll(activeScrollDir);
      activeScrollDir = 0;
    };

    this.searchArrowUp.on("pointerdown", () => startContinuousScroll(-1));
    this.searchArrowUp.on("pointerup", stopContinuousScroll);
    this.searchArrowUp.on("pointerover", () => {
      if (this.searchArrowUp.input?.enabled) {
        this.searchArrowUp.setScale(arrowScale * 1.3);
      }
    });
    this.searchArrowUp.on("pointerout", () => {
      stopContinuousScroll();
      this.searchArrowUp.setScale(arrowScale);
    });

    this.searchArrowDown.on("pointerdown", () => startContinuousScroll(1));
    this.searchArrowDown.on("pointerup", stopContinuousScroll);
    this.searchArrowDown.on("pointerover", () => {
      if (this.searchArrowDown.input?.enabled) {
        this.searchArrowDown.setScale(arrowScale * 1.3);
      }
    });
    this.searchArrowDown.on("pointerout", () => {
      stopContinuousScroll();
      this.searchArrowDown.setScale(arrowScale);
    });

    this.input.on("pointerup", stopContinuousScroll);

    // Set initial chevron states
    this.scrollList.updateScrollIndicators(
      this.searchArrowUp,
      this.searchArrowDown,
    );

    // 9. Render Toolbar layouts
    const drawBarBg = (bgX: number, bgY: number, bgW: number, bgH: number) => {
      const g = this.add.graphics();
      g.fillStyle(0x1a1a2e, 0.9);
      g.fillRoundedRect(bgX, bgY, bgW, bgH, 12);
      g.lineStyle(2, 0x444466, 0.8);
      g.strokeRoundedRect(bgX, bgY, bgW, bgH, 12);
      g.setDepth(8);
    };
    drawBarBg(
      this.searchAreaRect.x,
      this.layoutConfig.row1Y,
      this.searchAreaRect.width,
      84 * this.layoutConfig.scale,
    ); // Left top filter bar
    drawBarBg(
      this.deckAreaRect.x,
      this.layoutConfig.row1Y,
      this.deckAreaRect.width,
      84 * this.layoutConfig.scale,
    ); // Right top operations bar
    drawBarBg(
      this.searchAreaRect.x,
      this.layoutConfig.statusBarTop,
      this.searchAreaRect.width,
      this.layoutConfig.statusBarHeight,
    ); // Left status bar
    drawBarBg(
      this.deckAreaRect.x,
      this.layoutConfig.statusBarTop,
      this.deckAreaRect.width,
      this.layoutConfig.statusBarHeight,
    ); // Right status bar

    // 10. Instantiate Sub view structures (DeckListView, buttons, text inputs)
    const deckAreaCenter = {
      x: this.deckAreaRect.x + this.deckAreaRect.width / 2,
      y: this.deckAreaRect.y + this.deckAreaRect.height / 2,
      width: this.deckAreaRect.width,
      height: this.deckAreaRect.height,
    };
    const reserveAreaCenter = {
      x: this.reserveAreaRect.x + this.reserveAreaRect.width / 2,
      y: this.reserveAreaRect.y + this.reserveAreaRect.height / 2,
      width: this.reserveAreaRect.width,
      height: this.reserveAreaRect.height,
    };

    this.deckListView = new DeckListView(
      this,
      deckAreaCenter as any,
      reserveAreaCenter as any,
      15, // depth
      this.cardListModel.filterManager.getFilters(),
      this,
    );

    this.buttonManager = new DeckButtonManager(this);
    this.createToolbarButtons();

    // Render selections status label (aligned bottom-left to match text input box's bottom edge)
    const cardsSelectedFontSize = Math.max(
      16,
      Math.min(48, Math.round(26 * this.layoutConfig.scale)),
    );
    this.cardsSelectedText = this.add
      .bitmapText(
        this.searchAreaRect.x + 25 * this.layoutConfig.scale,
        this.layoutConfig.statusBarTop +
        this.layoutConfig.statusBarHeight / 2 +
        16,
        "fairyDust",
        `Cards selected: ${this.cardListModel.cardsSelectedCount}/${this.cardListModel.cardCount}`,
        cardsSelectedFontSize,
      )
      .setOrigin(0, 1)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(20);

    this.textFilterView = new TextFilterView(this, this.cardsSelectedText);
    this.textFilterView.createTextFilterUI(
      this.layoutConfig,
      this.layoutConfig.scale,
      this.cardListModel.filterManager,
    );

    // Setup input keyboard locking during search typing
    const textInputNode = this.textFilterView.textFilterElem
      .node as HTMLInputElement;
    textInputNode.addEventListener("focus", () => {
      this.textFilterView.resetTextFilterInput(true);
      if (this.input.keyboard) this.input.keyboard.enabled = false;
    });
    textInputNode.addEventListener("blur", () => {
      this.textFilterView.resetTextFilterInput(false);
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    this.textFilterView.textFilterElem.addListener("input");
    this.textFilterView.textFilterElem.on("input", () => {
      const query = textInputNode.value;
      this.textFilterView.updateInputTextAndScroll(query);
      this.cardListModel.setFilterText(query);
      this.applyFilterChangesToViews();
    });

    this.textFilterView.textFilterElem.addListener("keydown");
    this.textFilterView.textFilterElem.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        textInputNode.blur();
      }
    });

    // 11. Create Symbol & Brigade Filters
    this.createFilterIconGroups(
      this.searchAreaRect.x + 40 * this.layoutConfig.scale,
      this.layoutConfig.row1Y + 24 * this.layoutConfig.scale,
    );

    // 12. Create Drag and Drop Handler
    this.dragDropHandler = new DeckDragDropHandler(
      this,
      this, // coordinates deckList views directly
      this.deckListView.deckElements as any, // passed as area deck/reserve targets
      this.deckListView.reserveElements as any,
      this.background,
      this.geometryMask,
    );

    // Override drag drop zones to properly target editorAreas
    this.setupPhysicalDragAndDrop();

    // 13. Map Toolbar Actions
    this.setupToolbarActions();

    // Setup initial stats
    this.updateStats();

    // Load saved deck JSON instantly now that deckListView is fully created
    if (this.savedDeckIDsJSON) {
      try {
        const deckData = JSON.parse(this.savedDeckIDsJSON);
        this.loadDeckFromIDs(
          deckData.deck?.main || [],
          deckData.deck?.reserve || [],
        );
      } catch (_err) {
        // Ignore
      }
    }

    this.cardMetricsOverlay = new CardMetricsOverlay(this);

    this.events.on(
      "ui:deck-card-hovered",
      (
        card: any,
        imgBounds?: { x: number; y: number },
        align?: "left" | "right",
      ) => {
        // imgBounds optional param from DeckListView / DeckCardView
        if (imgBounds) {
          this.cardMetricsOverlay.show(
            card,
            this.deckListModel,
            imgBounds.x,
            imgBounds.y,
            align || "right",
          );
        } else {
          // Fallback or centered
          this.cardMetricsOverlay.show(
            card,
            this.deckListModel,
            500,
            500,
            "right",
          );
        }
      },
    );

    editorEvents.on("card-zoomed-out", () => {
      this.cardMetricsOverlay.hide();
    });

    this.events.on("ui:deck-card-unhovered", () => {
      this.cardMetricsOverlay.hide();
    });

    this.createSideButtons();
  }


  private calculateLayoutConfig(width: number, height: number) {
    const boundary = 0.01;
    const padX = width * boundary;
    const scale = width / 1280;

    const row1Y = 6 * scale;
    const toolbarHeight = 84 * scale;
    const row2Y = row1Y + 44 * scale;

    const statusBarHeight = 44 * scale;
    const statusBarTop = row1Y + toolbarHeight + 4 * scale;

    const searchAreaTop = statusBarTop + statusBarHeight + 4 * scale;
    const searchAreaWidth = width * 0.7;
    const searchAreaHeight = height - searchAreaTop - height * boundary;
    const searchAreaLeft = padX;

    const deckAreaWidth = width * 0.27;
    const deckAreaLeft = width - padX - deckAreaWidth;
    const deckAreaTop = searchAreaTop;

    const remainingHeight = height - searchAreaTop - height * boundary;
    const deckAreaHeight = remainingHeight * 0.625;

    const reserveAreaWidth = deckAreaWidth;
    const reserveAreaLeft = deckAreaLeft;
    const reserveAreaTop = deckAreaTop + deckAreaHeight + height * boundary;
    const reserveAreaHeight = searchAreaTop + searchAreaHeight - reserveAreaTop;

    const cardWidth = 344;
    const cardHeight = 512;
    const cardScale = (searchAreaWidth / 896) * 0.25;
    const cardZoomScale = 0.78 * scale;
    const symbolScale = 0.25 * scale;

    const statsFontSize = Math.max(14, Math.min(28, Math.round(27 * scale)));

    this.layoutConfig = {
      width,
      height,
      boundary,
      searchAreaWidth,
      searchAreaHeight,
      searchAreaRadius: 5,
      searchAreaLeft,
      searchAreaTop,
      deckAreaWidth,
      deckAreaHeight,
      deckAreaRadius: 5,
      deckAreaLeft,
      deckAreaTop,
      reserveAreaWidth,
      reserveAreaHeight,
      reserveAreaRadius: 5,
      reserveAreaLeft,
      reserveAreaTop,
      statsFontSize,
      cardWidth,
      cardHeight,
      cardScale,
      cardZoomScale,
      symbolScale,
      row1Y,
      row2Y,
      statusBarTop,
      statusBarHeight,
      scale,
    };
  }

  private adjustBackgroundSize() {
    if (this.background) {
      const width = this.scale.width;
      const height = this.scale.height;
      this.background.setOrigin(1, 1);
      this.background.setPosition(width, height);
      const bgScale = Math.max(width / 2816, height / 1584);
      this.background.setScale(bgScale);
    }
  }

  private createSideButtons() {
    if (this.settingsButton) this.settingsButton.destroy();
    if (this.exitButton) this.exitButton.destroy();
    if (this.helpButton) this.helpButton.destroy();

    const width = this.scale.width;
    const height = this.scale.height;

    this.settingsButton = new SidebarButton(
      this,
      "button_settings",
      height * 0.18,
      true, // Right side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.scene.pause();
        this.scene.launch("SettingsDialogScene", { parentScene: "DeckEditorScene" });
      }
    );

    this.exitButton = new SidebarButton(
      this,
      "button_exit",
      height * 0.18,
      false, // Left side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.scene.start("DeckCatacombsScene");
      },
      "button_exit_to_catacombs"
    );

    this.helpButton = new SidebarButton(
      this,
      "button_help",
      height * 0.7,
      false, // Left side
      () => {
        this.soundManager.playSound("UI_TOGGLE");
        HelpOverlay.toggle();
      }
    );
  }

  /**
   * Debounced resize handler — waits 400ms after the last resize event
   * before restarting the scene. This prevents multiple rapid restarts
   * during window dragging and eliminates the "frozen / black screen" effect.
   */
  private handleResize() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.scene.restart({
        deckIDsJSON: this.deckListModel.deckAsIDs(),
        deckName: this.loadedDeckName,
      });
    }, 400);
  }

  private createToolbarButtons() {
    const rightBarWidth = this.layoutConfig.deckAreaWidth;
    const rightBarX = this.deckAreaRect.x;

    const startX = rightBarX + 40 * this.layoutConfig.scale;
    const endX = rightBarX + rightBarWidth - 40 * this.layoutConfig.scale;
    const buttonCount = 7;
    const spacing = (endX - startX) / (buttonCount - 1);
    const centerY = this.layoutConfig.row1Y + 24 * this.layoutConfig.scale;
    const buttonScale = 0.17 * this.layoutConfig.scale;

    this.buttonManager.createButton(
      "loadButton",
      startX + 0 * spacing,
      centerY,
      "load",
      0.1,
      "load-deck",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "saveButton",
      startX + 1 * spacing,
      centerY,
      "save",
      0.1,
      "save-deck",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "shareButton",
      startX + 2 * spacing,
      centerY,
      "share",
      0.1,
      "share-deck",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "loadLackeyButton",
      startX + 3 * spacing,
      centerY,
      "loadLackey",
      0.1,
      "load-deck-lackey",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "saveLackeyButton",
      startX + 4 * spacing,
      centerY,
      "saveLackey",
      0.1,
      "save-deck-lackey",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "deckMetricsButton",
      startX + 5 * spacing,
      centerY,
      "deckMetrics",
      0.1,
      "show-deck-metrics",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "clearButton",
      endX,
      centerY,
      "clear",
      0.1,
      "clear-deck",
      "DECK_CTRL_CLICK",
      buttonScale,
    );
    this.buttonManager.createButton(
      "battleButton",
      endX,
      centerY + 36 * this.layoutConfig.scale,
      "battle",
      0.1,
      "battle-start",
      "MENU_SELECT",
      buttonScale,
    );

    // Initialize button enabled/disabled states
    this.buttonManager.toggleButtonState("saveButton", false);
    this.buttonManager.toggleButtonState("clearButton", false);
    this.buttonManager.toggleButtonState("shareButton", false);
    this.buttonManager.toggleButtonState("saveLackeyButton", false);
    this.buttonManager.toggleButtonState("deckMetricsButton", false);
    this.buttonManager.toggleButtonState("battleButton", false);
  }

  private createFilterIconGroups(startX: number, startY: number) {
    const nextX = 45 * this.layoutConfig.scale;
    const nextY = 36 * this.layoutConfig.scale;
    const unifiedScale = 0.17 * this.layoutConfig.scale;

    const manager = this.cardListModel.filterManager;
    if (!manager) return;

    // 1. Symbol Filters
    const symbolFilters = manager.getFiltersByCategory("symbol");
    const symbolToggleItems = symbolFilters.map((s) => ({
      id: s.id,
      label: s.label,
      texture: s.id,
      frame: 0,
      attribute: s.rules[0]?.field,
      values: s.rules[0]?.values || null,
      alignments: s.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    const symbolGroup = new IconToggleGroup(
      this,
      startX,
      startY,
      symbolToggleItems,
      {
        scale: unifiedScale,
        spacingX: nextX,
        spacingY: 0,
        columns: symbolFilters.length,
        multiSelect: true,
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: symbolFilters.filter((s) => manager.isFilterActive(s.id)).map((s) => s.id),
      },
    );
    symbolGroup.setDepth(15);

    // 2. Brigade Filters
    const brigadeFilters = manager.getFiltersByCategory("brigade");
    const brigadeToggleItems = brigadeFilters.map((b) => ({
      id: b.id,
      label: b.label,
      texture: b.id,
      frame: 0,
      attribute: b.rules[0]?.field,
      values: b.rules[0]?.values || null,
      alignments: b.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    const brigadeGroup = new IconToggleGroup(
      this,
      startX,
      startY + nextY,
      brigadeToggleItems,
      {
        scale: unifiedScale,
        spacingX: nextX,
        spacingY: 0,
        columns: brigadeFilters.length,
        multiSelect: true,
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: brigadeFilters.filter((b) => manager.isFilterActive(b.id)).map((b) => b.id),
      },
    );
    brigadeGroup.setDepth(15);

    // Listen to local scene toggle changes for card list queries
    this.events.on("ui:toggle-changed", (data: any) => {
      if (this.cardListModel.hasSymbolFilter(data.changedId)) {
        this.cardListModel.updateCardSymbolFilters(
          data.changedId,
          data.selected,
        );
      } else {
        this.cardListModel.updateCardTextFilters(data.changedId, data.selected);
      }
      this.cardListModel.filterCards();
      this.applyFilterChangesToViews();
    });

    editorEvents.on("deck-changed", () => {
      this.cardListModel.filterCards();
      this.applyFilterChangesToViews(false); // don't reset scroll if not necessary, or keep it true if you want
    });
  }

  private applyFilterChangesToViews(resetScroll: boolean = true) {
    this.cardsSelectedText.setText(
      `Cards selected: ${this.cardListModel.cardsSelectedCount}/${this.cardListModel.cardCount}`,
    );

    this.allCardViews.forEach((cardView) => {
      const match = this.cardListModel.getCard(cardView.cardId);
      if (match) {
        cardView.active = match.selected ?? true;
      }
    });

    this.scrollList.setItems(this.allCardViews, resetScroll);
    this.scrollList.updateScrollIndicators(
      this.searchArrowUp,
      this.searchArrowDown,
    );
  }

  private setupToolbarActions() {
    editorEvents.on("save-deck", this.saveDeckJSON, this);
    editorEvents.on("load-deck", this.loadDeckJSON, this);
    editorEvents.on("save-deck-lackey", this.saveDeckLackey, this);
    editorEvents.on("load-deck-lackey", this.loadDeckLackey, this);
    editorEvents.on("clear-deck", this.clearDeck, this);
    editorEvents.on("share-deck", this.shareDeck, this);
    editorEvents.on("show-deck-metrics", this.showDeckMetrics, this);
    editorEvents.on("battle-start", this.startBattleFromEditor, this);
  }

  /**
   * Triggers the camera fade-out and transitions to the Lobby scene
   * with the current editor deck payload.
   *
   * Args: None
   * Returns: Void
   */
  private transitionToLobby() {
    this.input.enabled = false;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const deckData = {
        name: this.loadedDeckName || "Edited Deck",
        main: this.deckListModel.getFlatDeck().map((c) => c.id),
        reserve: this.deckListModel.getFlatReserve().map((c) => c.id),
      };
      this.scene.start("LobbyScene", { deck: deckData });
    });
  }

  /**
   * Event listener when the Battle button is clicked. Checks for unsaved changes
   * and presents a warning dialog if the deck is dirty.
   *
   * Args: None
   * Returns: Void
   */
  private startBattleFromEditor() {
    if (this.isDirty) {
      const notificationManager = this.registry.get("notificationManager") as NotificationManager;
      if (notificationManager) {
        notificationManager.showUnsavedChanges({
          onSaveJSON: () => {
            this.saveDeckJSON();
            this.transitionToLobby();
          },
          onSaveLackey: () => {
            this.saveDeckLackey();
            this.transitionToLobby();
          },
          onDiscard: () => {
            this.transitionToLobby();
          },
        });
      } else {
        this.transitionToLobby();
      }
    } else {
      this.transitionToLobby();
    }
  }

  private shareDeck() {
    const deckIDs = this.deckListModel.deckAsIDs();
    const shareURL = new URL(window.location.href);
    shareURL.searchParams.set("mode", "game"); // redirect to normal load if shared
    shareURL.hash = encodeURIComponent(deckIDs);
    this.deckListView.showURLOverlay(shareURL.toString());
  }

  /**
   * Shows the deck metrics overlay using an HTML DOM element.
   * Replicates the standalone editor's metricsView.js logic exactly.
   * The HTML template is loaded from templates/deckMetrics.html.
   */
  private showDeckMetrics() {
    const allCards = [
      ...this.deckListModel.deck.flatMap((entry) => Array(entry.quantity).fill(entry.card)),
      ...this.deckListModel.reserve.flatMap((entry) => Array(entry.quantity).fill(entry.card)),
    ];

    DeckMetricsOverlayManager.showMetrics(this, allCards);
  }

  private createBackButton() {
    const backBtnX = this.searchAreaRect.x + 45 * this.layoutConfig.scale;
    const backBtnY = this.layoutConfig.row1Y + 42 * this.layoutConfig.scale;
    const backBtnFontSize = Math.max(
      12,
      Math.min(24, Math.round(22 * this.layoutConfig.scale)),
    );

    const backBtn = this.add
      .bitmapText(backBtnX, backBtnY, "fairyDust", "⬅ BACK", backBtnFontSize)
      .setOrigin(0.5, 0.5)
      .setDropShadow(2, 2, 0x000000)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    backBtn.on("pointerover", () => backBtn.setScale(1.08).setTint(0xe9cd45));
    backBtn.on("pointerout", () => backBtn.setScale(1.0).clearTint());
    backBtn.on("pointerup", () => {
      this.soundManager.playSound("MENU_SELECT");
      this.input.enabled = false;
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("HubScene");
      });
    });
  }

  private setupPhysicalDragAndDrop() {
    // Redefine drag and drop targets to align deck and reserve lists
    const handler = this.dragDropHandler as any;
    handler.deckArea = {
      highlight: () => { },
      reset: () => { },
    };
    handler.reserveArea = {
      highlight: () => { },
      reset: () => { },
    };
  }

  public getCard(id: string): EditorCardData | undefined {
    return this.cardListModel.getCard(id);
  }

  public addCard(cardData: EditorCardData | undefined, areaName: string) {
    if (!cardData) return;

    if (areaName === "Deck") {
      this.deckListModel.addCardToDeck(cardData);
    } else if (areaName === "Reserve") {
      this.deckListModel.addCardToReserve(cardData);
    }

    this.isDirty = true;
    this.soundManager.playSound("DECK_ADD_CARD"); // nice sfx draw sound
    this.updateStats();
  }

  public removeCard(cardElement: any, areaName: string) {
    if (areaName === "Deck") {
      this.deckListModel.removeCardFromDeck(cardElement.card);
    } else if (areaName === "Reserve") {
      this.deckListModel.removeCardFromReserve(cardElement.card);
    }

    this.isDirty = true;
    this.soundManager.playSound("DECK_REMOVE_CARD");
    this.updateStats();
  }

  private updateStats() {
    const result = DeckValidator.validate(this.deckListModel.deck, this.deckListModel.reserve);

    this.deckListView.updateStats(result);
    editorEvents.emit("deck-changed", result.deckSize.current, result.reserveSize.current, result.isValid);
  }



  private async saveDeckJSON() {
    const deckIDsString = this.deckListModel.deckAsIDs();
    const name = this.loadedDeckName || "deck";
    const filename = name + ".json";
    DeckIO.saveDeckFile(filename, deckIDsString);

    try {
      const localDB = new LocalDecksDB();
      const existing = await localDB.getVirtualDeck(name);
      if (existing) {
        const parsed = typeof deckIDsString === "string" ? JSON.parse(deckIDsString) : deckIDsString;
        existing.deckData = {
          main: parsed.deck?.main || parsed.main || [],
          reserve: parsed.deck?.reserve || parsed.reserve || []
        };
        await localDB.saveVirtualDeck(existing);
      }
    } catch (err) {
      log("DeckEditorScene", "Could not save virtual deck on JSON save", err);
    }

    this.isDirty = false;
  }

  private loadDeckJSON() {
    DeckIO.loadDeckFile(".json", (content, filename) => {
      try {
        this.loadedDeckName = filename.replace(/\.[^/.]+$/, "");
        const deckData = JSON.parse(content);

        const main = deckData.deckData?.main || deckData.deck?.main || deckData.main || [];
        const reserve = deckData.deckData?.reserve || deckData.deck?.reserve || deckData.reserve || [];

        this.loadDeckFromIDs(main, reserve);
      } catch (err) {
        log("DeckEditorScene", "Error loading JSON deck file", err);
        this.soundManager.playSound("DECK_ERROR"); // locked sfx
      }
    });
  }

  private saveDeckLackey() {
    const defaultName = this.loadedDeckName || "deck";
    DeckIO.saveLackeyDeck(defaultName, (ext) => {
      return ext === ".dek" ? this.deckListModel.deckAsDek() : this.deckListModel.deckAsTxt();
    });
    this.isDirty = false;
  }

  private loadDeckLackey() {
    DeckIO.loadDeckFile(".txt,.dek", (content, filename) => {
      try {
        this.loadedDeckName = filename.replace(/\.[^/.]+$/, "");
        const deck = DeckUtils.parseDeck(content, filename);

        // Loop search matching card database names to resolve their IDs
        const mainIDs: string[] = [];
        deck.main.forEach((name) => {
          const match = this.cardListModel.cards.find((c) => c.Name === name);
          if (match) mainIDs.push(match.id);
        });

        const reserveIDs: string[] = [];
        deck.reserve.forEach((name) => {
          const match = this.cardListModel.cards.find((c) => c.Name === name);
          if (match) reserveIDs.push(match.id);
        });

        this.loadDeckFromIDs(mainIDs, reserveIDs);
      } catch (err) {
        this.soundManager.playSound("DECK_ERROR");
      }
    });
  }

  private loadDeckFromIDs(deckIDArray: string[], reserveIDArray: string[]) {
    this.deckListModel.clear();

    deckIDArray.forEach((id) => {
      let card = this.cardListModel.getCard(id);
      if (!card) {
        card = this.cardListModel.cards.find((c) => c.id === id || c.Name === id || c.ImageFile === id) as any;
      }
      if (card) this.deckListModel.addCardToDeck(card, true);
    });

    reserveIDArray.forEach((id) => {
      let card = this.cardListModel.getCard(id);
      if (!card) {
        card = this.cardListModel.cards.find((c) => c.id === id || c.Name === id || c.ImageFile === id) as any;
      }
      if (card) this.deckListModel.addCardToReserve(card, true);
    });

    // Manually emit the events once after all cards are loaded
    // to prevent hundreds of useless list re-renders.
    editorEvents.emit("deck-updated", this.deckListModel.deck);
    editorEvents.emit("reserve-updated", this.deckListModel.reserve);

    this.isDirty = false;
    this.updateStats();
  }

  private clearDeck(silent: boolean = false) {
    this.deckListView.clearAllElements();
    this.deckListModel.clear();
    this.loadedDeckName = null;
    this.isDirty = true;

    if (!silent) {
      this.soundManager.playSound("DECK_CLEAR");
    }

    this.updateStats();
  }
}
