import Phaser from "phaser";
import { FilterManager } from "./FilterManager";
import { IconToggleGroup, type ToggleItemConfig } from "../IconToggleGroup";
import { TIER_CONFIG } from "../../../config/BrigadeConfig";
import { filterConfigData } from "../../config/filter_config";

export interface DeckFilterOptions {
  searchQuery: string;
  searchInName: boolean;
  searchInCard: boolean;
  activeBrigades: string[];
  activeTiers: string[];
  activeFormat: string | null;
  sortMode: "name_asc" | "name_desc" | "tier_desc" | "tier_asc" | "brigade" | "format";
  isAndMode: boolean;
}

export interface HeaderFilterCallbacks {
  onSync?: () => void;
  onReset?: () => void;
}

export class DeckHeaderFilterUI {
  private scene: Phaser.Scene;
  private onFilterChange: (options: DeckFilterOptions) => void;
  private callbacks?: HeaderFilterCallbacks;
  public filterManager: FilterManager;

  private topLeftBg!: Phaser.GameObjects.Graphics;
  private bottomLeftBg!: Phaser.GameObjects.Graphics;
  private topRightBg!: Phaser.GameObjects.Graphics;
  private bottomRightBg!: Phaser.GameObjects.Graphics;

  private brigadeToggleGroup!: IconToggleGroup;
  private tierToggleGroup!: IconToggleGroup;
  private checkboxToggleGroup!: IconToggleGroup;

  public countLabel!: Phaser.GameObjects.BitmapText;
  public textFilterElem!: Phaser.GameObjects.DOMElement;
  public textFilterInput!: Phaser.GameObjects.Graphics;
  public textFilterInputTxt!: Phaser.GameObjects.BitmapText;

  private syncBtn?: Phaser.GameObjects.Image;
  private resetBtn?: Phaser.GameObjects.Image;

  private activeTiersSet: Set<string> = new Set();
  private sortMode: DeckFilterOptions["sortMode"] = "name_asc";
  private activeFormat: string | null = null;
  private sortButtonsMap: Map<string, { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.BitmapText }> = new Map();

  constructor(
    scene: Phaser.Scene,
    onFilterChange: (options: DeckFilterOptions) => void,
    callbacks?: HeaderFilterCallbacks
  ) {
    this.scene = scene;
    this.onFilterChange = onFilterChange;
    this.callbacks = callbacks;

    const configData = scene.cache.json.get("filterConfig") || filterConfigData;
    this.filterManager = new FilterManager(configData);
    this.ensureTierTextures();
  }

  private ensureTierTextures(): void {
    const tiers = [
      { id: "tier_gold", key: "tier_gold_med", stroke: 0xfff099, fallbackColor: 0xffd700 },
      { id: "tier_silver", key: "tier_silver_med", stroke: 0xffffff, fallbackColor: 0xc0c0c0 },
      { id: "tier_bronze", key: "tier_bronze_med", stroke: 0xe6a366, fallbackColor: 0xcd7f32 },
      { id: "tier_stone", key: "tier_stone_med", stroke: 0x999999, fallbackColor: 0x666666 },
    ];

    tiers.forEach((t) => {
      if (!this.scene.textures.exists(t.key)) {
        const canvas = this.scene.textures.createCanvas(t.key, 40, 40);
        if (canvas) {
          const ctx = canvas.getContext();
          const bgTexKey = `${t.id}_bg`;

          if (this.scene.textures.exists(bgTexKey)) {
            const srcImage = this.scene.textures.get(bgTexKey).getSourceImage() as HTMLImageElement;
            if (srcImage && srcImage.width > 0) {
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(2, 2, 36, 36, 6);
              ctx.clip();
              ctx.drawImage(srcImage, 0, 0, srcImage.width, srcImage.height, 2, 2, 36, 36);
              ctx.restore();
            } else {
              ctx.fillStyle = `#${t.fallbackColor.toString(16).padStart(6, "0")}`;
              ctx.beginPath();
              ctx.roundRect(2, 2, 36, 36, 6);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = `#${t.fallbackColor.toString(16).padStart(6, "0")}`;
            ctx.beginPath();
            ctx.roundRect(2, 2, 36, 36, 6);
            ctx.fill();
          }

          ctx.strokeStyle = `#${t.stroke.toString(16).padStart(6, "0")}`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(2, 2, 36, 36, 6);
          ctx.stroke();
          canvas.refresh();
        }
      }
    });

    this.ensureAndFilterTexture();
  }

  private ensureAndFilterTexture(): void {
    if (this.scene.textures.exists("AndFilter_med")) {
      this.scene.textures.remove("AndFilter_med");
    }
    if (this.scene.textures.exists("AndFilter")) {
      const srcImage = this.scene.textures.get("AndFilter").getSourceImage() as HTMLImageElement;
      if (srcImage && srcImage.width > 0) {
        const canvas = this.scene.textures.createCanvas("AndFilter_med", 40, 40);
        if (canvas) {
          const ctx = canvas.getContext();
          ctx.drawImage(srcImage, 0, 0, srcImage.width, srcImage.height, 0, 0, 40, 40);
          canvas.refresh();
        }
      }
    }
  }

  public createUI(width: number, topY: number, totalDecksCount: number): void {
    const scale = Math.max(0.85, width / 1280);

    // Exact margins and widths 1:1 from DeckEditorScene.calculateLayoutConfig
    const padX = width * 0.01;
    const searchAreaWidth = width * 0.70;
    const deckAreaWidth = width * 0.27;
    const deckAreaLeft = width - padX - deckAreaWidth;

    const toolbarHeight = 84 * scale;
    const statusBarHeight = 44 * scale;
    const row1Y = topY + 6 * scale;
    const row2Y = row1Y + toolbarHeight + 6 * scale;
    const borderRadius = 6 * scale;

    const drawBarBg = (bx: number, by: number, bw: number, bh: number): Phaser.GameObjects.Graphics => {
      const g = this.scene.add.graphics().setDepth(8);
      g.fillStyle(0x1a1a2e, 0.90);
      g.fillRoundedRect(bx, by, bw, bh, borderRadius);
      g.lineStyle(1.5, 0x444466, 0.8);
      g.strokeRoundedRect(bx, by, bw, bh, borderRadius);
      return g;
    };

    // 1. Draw 4 Stacked Bars (Top bars double height 84px, Bottom bars 44px)
    this.topLeftBg = drawBarBg(padX, row1Y, searchAreaWidth, toolbarHeight);
    this.bottomLeftBg = drawBarBg(padX, row2Y, searchAreaWidth, statusBarHeight);
    this.topRightBg = drawBarBg(deckAreaLeft, row1Y, deckAreaWidth, toolbarHeight);
    this.bottomRightBg = drawBarBg(deckAreaLeft, row2Y, deckAreaWidth, statusBarHeight);

    // 2. Top-Left Bar Row 1: Brigade Filters (18 icons + AndFilter)
    const brigadeFilters = this.filterManager.getFiltersByCategory("brigade");
    const brigadeItems: ToggleItemConfig[] = brigadeFilters.map((b) => ({
      id: `brigade_${b.id}`,
      texture: `${b.id}_med`,
      frame: 0,
    }));

    const spacingX = 42 * scale;
    const unifiedScale = 0.72 * scale;
    const brigadeTotalWidth = (brigadeItems.length - 1) * spacingX;
    const brigadeStartX = padX + searchAreaWidth / 2 - brigadeTotalWidth / 2;

    this.brigadeToggleGroup = new IconToggleGroup(
      this.scene,
      brigadeStartX,
      row1Y + 22 * scale,
      brigadeItems,
      {
        id: "header-brigade-group",
        scale: unifiedScale,
        spacingX: spacingX,
        spacingY: 0,
        columns: brigadeItems.length,
        multiSelect: true,
        initialSelectedIds: ["brigade_AndFilter"], // AndFilter active by default matching DeckEditor
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
      }
    );
    this.brigadeToggleGroup.setDepth(15);

    // 3. Top-Left Bar Row 2: 4 Tier Filters (Exact pixel right-alignment with last Brigade icon!)
    const tierItems: ToggleItemConfig[] = TIER_CONFIG.map((tier) => ({
      id: tier.id,
      texture: `${tier.id}_med`,
      frame: 0,
    }));

    const lastBrigadeX = brigadeStartX + (brigadeItems.length - 1) * spacingX;
    const tierStartX = lastBrigadeX - (tierItems.length - 1) * spacingX;

    this.tierToggleGroup = new IconToggleGroup(
      this.scene,
      tierStartX,
      row1Y + 62 * scale,
      tierItems,
      {
        id: "header-tier-group",
        scale: unifiedScale,
        spacingX: spacingX,
        spacingY: 0,
        columns: tierItems.length,
        multiSelect: true,
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
      }
    );
    this.tierToggleGroup.setDepth(15);

    this.scene.events.on("ui:toggle-changed", (evt: any) => {
      if (evt && (evt.groupId === "header-brigade-group" || evt.groupId === "header-tier-group")) {
        this.activeTiersSet.clear();
        if (this.tierToggleGroup) {
          (this.tierToggleGroup.getSelectedIds() || []).forEach((id: string) => {
            this.activeTiersSet.add(id);
          });
        }
        this.emitChange();
      }
    });

    // 4. Bottom-Left Bar: Counter + Search Input + Checkboxes (EXACT 1:1 TextFilterView alignment)
    const fontKey = this.scene.cache.bitmapFont.exists("fairyDust") ? "fairyDust" : "fairydust";
    const centerRow2Y = row2Y + statusBarHeight / 2;

    // Counter Label: vertically centered at centerRow2Y - 4 * scale with setOrigin(0, 0.5)
    const cardsSelectedFontSize = Math.max(16, Math.min(48, Math.round(26 * scale)));
    this.countLabel = this.scene.add
      .bitmapText(
        padX + 25 * scale,
        centerRow2Y - 4 * scale,
        fontKey,
        `Local Decks: ${totalDecksCount}/${totalDecksCount}`,
        cardsSelectedFontSize
      )
      .setOrigin(0, 0.5)
      .setDropShadow(3, 4, 0x000000)
      .setDepth(21);

    // Dynamic Search Input Field (Height 32px 1:1 TextFilterView)
    const inputX = this.countLabel.x + this.countLabel.width + 15 * scale;
    const inputWidth = 220 * scale;
    const inputHeight = 32;

    const style: any = {
      height: "32px",
      position: "absolute",
      "caret-color": "#e9cd45",
      color: "transparent",
      "font-size": `${Math.max(12, Math.min(24, Math.round(19 * scale)))}px`,
      "font-family": "Arial, Helvetica, sans-serif",
      padding: "0 0 0 6px",
      outline: "none",
      border: "none",
      background: "transparent",
      "box-sizing": "border-box",
    };

    this.textFilterElem = this.scene.add.dom(inputX, centerRow2Y, "input", style).setOrigin(0, 0.5).setDepth(20);
    (this.textFilterElem.node as HTMLElement).style.width = `${inputWidth}px`;

    this.textFilterInput = this.scene.add.graphics().setDepth(20);
    this.textFilterInput.fillStyle(0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, centerRow2Y - 16, inputWidth, inputHeight, 6);
    this.textFilterInput.lineStyle(1, 0xe4ae4a, 0.4);
    this.textFilterInput.strokeRoundedRect(inputX, centerRow2Y - 16, inputWidth, inputHeight, 6);

    const wazooFont = this.scene.cache.bitmapFont.exists("wazoo") ? "wazoo" : fontKey;
    const statsFontSize = Math.max(18, Math.min(36, Math.round(27 * scale)));
    this.textFilterInputTxt = this.scene.add
      .bitmapText(inputX + 5, centerRow2Y, wazooFont, "", statsFontSize)
      .setOrigin(0, 0.5)
      .setDepth(21);

    const textMaskGfx = this.scene.make.graphics({});
    textMaskGfx.fillStyle(0xffffff);
    textMaskGfx.beginPath();
    textMaskGfx.fillRoundedRect(inputX + 4, centerRow2Y - 14, inputWidth - 8, 28, 4);
    const textMask = textMaskGfx.createGeometryMask();
    this.textFilterInputTxt.setMask(textMask);

    this.textFilterElem.addListener("input");
    this.textFilterElem.on("input", () => {
      const query = (this.textFilterElem.node as HTMLInputElement).value;
      this.textFilterInputTxt.setText(query);
      this.emitChange();
    });

    // Checkboxes (Labels at centerRow2Y - 10, Checkboxes centered at centerRow2Y + 10)
    const labelStartX = inputX + inputWidth + 10 * scale;
    const textFilterFontSize = Math.max(14, Math.min(28, Math.round(27 * 0.9 * scale)));

    const cb1X = labelStartX + 20 * scale;
    const cb2X = labelStartX + 85 * scale;

    // Label: Name:
    this.scene.add
      .bitmapText(cb1X, centerRow2Y - 10, wazooFont, "Name:", textFilterFontSize)
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    // Label: Card:
    this.scene.add
      .bitmapText(cb2X, centerRow2Y - 10, wazooFont, "Card:", textFilterFontSize)
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    const checkboxItems: ToggleItemConfig[] = [
      {
        id: "cb_name",
        texture: "checkBoxUnChecked",
        frame: 0,
        altTexture: "checkBoxChecked",
        altFrame: 0,
      },
      {
        id: "cb_card",
        texture: "checkBoxUnChecked",
        frame: 0,
        altTexture: "checkBoxChecked",
        altFrame: 0,
      },
    ];

    const toggleScale = 0.15 * scale;
    const toggleSpacingX = 65 * scale;
    this.checkboxToggleGroup = new IconToggleGroup(
      this.scene,
      cb1X,
      centerRow2Y + 10,
      checkboxItems,
      {
        id: "header-checkbox-group",
        scale: toggleScale,
        spacingX: toggleSpacingX,
        spacingY: 0,
        columns: 2,
        multiSelect: true,
        initialSelectedIds: ["cb_name"],
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
      }
    );
    this.checkboxToggleGroup.setDepth(21);

    this.scene.events.on("ui:toggle-changed", (evt: any) => {
      if (evt && evt.groupId === "header-checkbox-group") {
        this.emitChange();
      }
    });

    // 5. Top-Right Bar Row 1: Sort Controls (A-Z, Z-A, Tier, Format, Brigades)
    this.createRightSortControls(deckAreaLeft + 12 * scale, row1Y + 22 * scale, deckAreaWidth - 24 * scale, scale);

    // 6. Top-Right Bar Row 2: Action Buttons (Sync & Reset icons 1:1 like Deck Editor)
    const rightIconsY = centerRow2Y;
    const iconSize = 32 * scale;
    const resetX = deckAreaLeft + deckAreaWidth - 26 * scale;
    const syncX = resetX - 42 * scale;

    if (this.scene.textures.exists("button_reset")) {
      this.resetBtn = this.scene.add.image(resetX, rightIconsY, "button_reset")
        .setOrigin(0.5, 0.5)
        .setDepth(15)
        .setInteractive({ useHandCursor: true });

      const baseResetScale = iconSize / Math.max(this.resetBtn.width, this.resetBtn.height);
      this.resetBtn.setScale(baseResetScale);

      this.resetBtn.on("pointerover", () => {
        this.scene.game.events.emit("playSound", "DECK_CHECK_HOVER");
        this.scene.tweens.add({
          targets: this.resetBtn,
          scaleX: baseResetScale * 1.12,
          scaleY: baseResetScale * 1.12,
          duration: 150,
          ease: "Sine.easeOut"
        });
      });

      this.resetBtn.on("pointerout", () => {
        this.scene.tweens.add({
          targets: this.resetBtn,
          scaleX: baseResetScale,
          scaleY: baseResetScale,
          duration: 150,
          ease: "Sine.easeOut"
        });
      });

      this.resetBtn.on("pointerdown", () => {
        this.scene.game.events.emit("playSound", "DECK_CHECK_SELECT");
        if (this.callbacks?.onReset) this.callbacks.onReset();
      });
    }

    if (this.scene.textures.exists("button_sync")) {
      this.syncBtn = this.scene.add.image(syncX, rightIconsY, "button_sync")
        .setOrigin(0.5, 0.5)
        .setDepth(15)
        .setInteractive({ useHandCursor: true });

      const baseSyncScale = iconSize / Math.max(this.syncBtn.width, this.syncBtn.height);
      this.syncBtn.setScale(baseSyncScale);

      this.syncBtn.on("pointerover", () => {
        this.scene.game.events.emit("playSound", "DECK_CHECK_HOVER");
        this.scene.tweens.add({
          targets: this.syncBtn,
          scaleX: baseSyncScale * 1.12,
          scaleY: baseSyncScale * 1.12,
          duration: 150,
          ease: "Sine.easeOut"
        });
      });

      this.syncBtn.on("pointerout", () => {
        this.scene.tweens.add({
          targets: this.syncBtn,
          scaleX: baseSyncScale,
          scaleY: baseSyncScale,
          duration: 150,
          ease: "Sine.easeOut"
        });
      });

      this.syncBtn.on("pointerdown", () => {
        this.scene.game.events.emit("playSound", "DECK_CHECK_SELECT");
        if (this.callbacks?.onSync) this.callbacks.onSync();
      });
    }
  }

  private createRightSortControls(startX: number, centerY: number, maxWidth: number, scale: number): void {
    const sortButtons = [
      { label: "A-Z", mode: "name_asc" as const },
      { label: "Z-A", mode: "name_desc" as const },
      { label: "Tier", mode: "tier_desc" as const },
      { label: "Format", mode: "format" as const },
      { label: "Brigades", mode: "brigade" as const },
    ];

    const btnWidth = 62 * scale;
    const btnHeight = 32 * scale;
    const spacingX = 66 * scale;

    sortButtons.forEach((btn, idx) => {
      const bx = startX + idx * spacingX;
      const bg = this.scene.add.graphics().setDepth(14);
      const isSelected = this.sortMode === btn.mode;

      const renderBtnBg = (selected: boolean, isHovered: boolean = false) => {
        bg.clear();
        if (isHovered) {
          bg.fillStyle(selected ? 0x554422 : 0x222d42, 0.95);
          bg.fillRoundedRect(bx, centerY - btnHeight / 2, btnWidth, btnHeight, 6 * scale);
          bg.lineStyle(2, 0xe9cd45, 0.95);
          bg.strokeRoundedRect(bx - 1, centerY - btnHeight / 2 - 1, btnWidth + 2, btnHeight + 2, 6 * scale);
        } else {
          bg.fillStyle(selected ? 0x443311 : 0x111c2e, 0.9);
          bg.fillRoundedRect(bx, centerY - btnHeight / 2, btnWidth, btnHeight, 6 * scale);
          bg.lineStyle(1.5, selected ? 0xffd700 : 0x444466, 0.8);
          bg.strokeRoundedRect(bx, centerY - btnHeight / 2, btnWidth, btnHeight, 6 * scale);
        }
      };

      renderBtnBg(isSelected, false);

      const fontKey = this.scene.cache.bitmapFont.exists("wazoo") ? "wazoo" : "fairydust";
      const fontSize = btn.label === "Brigades" ? 15 * scale : 18 * scale;
      const txt = this.scene.add.bitmapText(bx + btnWidth / 2, centerY, fontKey, btn.label, fontSize)
        .setOrigin(0.5, 0.5)
        .setTint(isSelected ? 0xffd700 : 0xcccccc)
        .setDepth(15)
        .setInteractive({ useHandCursor: true });

      this.sortButtonsMap.set(btn.mode, { bg, txt });

      txt.on("pointerover", () => {
        this.scene.game.events.emit("playSound", "DECK_CHECK_HOVER");
        renderBtnBg(this.sortMode === btn.mode, true);
        txt.setTint(0xffd700);
      });

      txt.on("pointerout", () => {
        const active = this.sortMode === btn.mode;
        renderBtnBg(active, false);
        txt.setTint(active ? 0xffd700 : 0xcccccc);
      });

      txt.on("pointerdown", () => {
        this.sortMode = btn.mode;
        this.scene.game.events.emit("playSound", "DECK_CHECK_SELECT");
        this.sortButtonsMap.forEach((val, key) => {
          const active = key === btn.mode;
          val.txt.setTint(active ? 0xffd700 : 0xcccccc);
          val.bg.clear();
          const targetIdx = sortButtons.findIndex(s => s.mode === key);
          const targetBx = startX + targetIdx * spacingX;
          val.bg.fillStyle(active ? 0x443311 : 0x111c2e, 0.9);
          val.bg.fillRoundedRect(targetBx, centerY - btnHeight / 2, btnWidth, btnHeight, 6 * scale);
          val.bg.lineStyle(1.5, active ? 0xffd700 : 0x444466, 0.8);
          val.bg.strokeRoundedRect(targetBx, centerY - btnHeight / 2, btnWidth, btnHeight, 6 * scale);
        });
        this.emitChange();
      });
    });
  }

  public updateCountText(filteredCount: number, totalCount: number): void {
    if (this.countLabel) {
      this.countLabel.setText(`Local Decks: ${filteredCount}/${totalCount}`);
    }
  }

  private emitChange(): void {
    const val = (this.textFilterElem?.node as HTMLInputElement)?.value || "";
    
    // Read active brigade & tier filters
    const brigadeIds = this.brigadeToggleGroup ? this.brigadeToggleGroup.getSelectedIds() : [];
    const isAndMode = brigadeIds.includes("brigade_AndFilter");

    const activeBrigades = brigadeIds
      .filter(id => id.startsWith("brigade_"))
      .map(id => id.replace("brigade_", ""))
      .filter(id => id !== "AndFilter")
      .map(rawId => {
        const match = filterConfigData.filters.find((f: any) => f.id === rawId);
        return match ? match.label.replace(" Brigade", "").trim() : rawId;
      });

    // Read active checkboxes
    const cbIds = this.checkboxToggleGroup ? this.checkboxToggleGroup.getSelectedIds() : [];
    const searchInName = cbIds.includes("cb_name");
    const searchInCard = cbIds.includes("cb_card");

    this.onFilterChange({
      searchQuery: val.trim().toLowerCase(),
      searchInName,
      searchInCard,
      activeBrigades,
      activeTiers: Array.from(this.activeTiersSet),
      activeFormat: this.activeFormat,
      sortMode: this.sortMode,
      isAndMode,
    });
  }

  public destroy(): void {
    if (this.topLeftBg) this.topLeftBg.destroy();
    if (this.bottomLeftBg) this.bottomLeftBg.destroy();
    if (this.topRightBg) this.topRightBg.destroy();
    if (this.bottomRightBg) this.bottomRightBg.destroy();
    if (this.textFilterElem) this.textFilterElem.destroy();
    if (this.textFilterInput) this.textFilterInput.destroy();
    if (this.textFilterInputTxt) this.textFilterInputTxt.destroy();
    if (this.countLabel) this.countLabel.destroy();
    if (this.brigadeToggleGroup) this.brigadeToggleGroup.destroy();
    if (this.tierToggleGroup) this.tierToggleGroup.destroy();
    if (this.checkboxToggleGroup) this.checkboxToggleGroup.destroy();
    if (this.syncBtn) this.syncBtn.destroy();
    if (this.resetBtn) this.resetBtn.destroy();
    if (this.sortButtonsMap) {
      this.sortButtonsMap.forEach((val) => {
        val.bg.destroy();
        val.txt.destroy();
      });
    }
  }
}
