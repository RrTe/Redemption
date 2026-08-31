import Phaser from "phaser";
import { FilterManager } from "./FilterManager";
import { SelectionFilterGroups } from "./SelectionFilterGroups";
import type { CardState } from "../../../../../shared/types";
import { filterConfigData } from "../../config/filter_config";

export class SelectionDialogFilterView {
  private scene: Phaser.Scene;
  private onFilterChanged: () => void;
  public filterManager!: FilterManager;
  private filterGroups: SelectionFilterGroups;

  private bgGfx!: Phaser.GameObjects.Graphics;
  public cardsSelectedText!: Phaser.GameObjects.BitmapText;
  public textFilterElem!: Phaser.GameObjects.DOMElement;
  public textFilterInput!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, onFilterChanged: () => void) {
    this.scene = scene;
    this.onFilterChanged = onFilterChanged;

    const configData = scene.cache.json.get("filterConfig") || filterConfigData;
    this.filterManager = new FilterManager(configData);
    this.filterGroups = new SelectionFilterGroups(scene, this.filterManager);
  }

  public createFiltersUI(x: number, y: number, _width: number, cards?: CardState[]) {
    const rawScale = this.scene.scale.width / 1920;
    const scale = this.scene.scale.height < 600 ? rawScale * 1.4 : rawScale;
    y += 2 * scale;

    const bgWidth = 880 * scale;
    const bgHeight = 115 * scale;
    const bgX = x - bgWidth / 2;
    const bgY = y - 22 * scale;
    const borderRadius = 12 * scale;

    this.bgGfx = this.scene.add.graphics();
    this.bgGfx.fillStyle(0x1a1a2e, 0.9);
    this.bgGfx.fillRoundedRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
    this.bgGfx.lineStyle(2, 0x444466, 0.8);
    this.bgGfx.strokeRoundedRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
    this.bgGfx.setDepth(8);

    const spacingX = 46 * scale;
    const unifiedScale = 0.72 * scale;

    // 1. Symbol & 2. Brigade Filters
    this.filterGroups.createSymbolGroup(x, y, spacingX, unifiedScale);
    this.filterGroups.createBrigadeGroup(x, y + 36 * scale, spacingX, unifiedScale);

    // 3. Text Search & Checkboxes Row
    const row3Y = y + 70 * scale;
    const fontKey = this.scene.cache.bitmapFont.exists("wazoo") ? "wazoo" : "fairydust";

    this.cardsSelectedText = this.scene.add
      .bitmapText(x - 420 * scale, row3Y, fontKey, "Cards selected: 0/0", 32 * scale)
      .setOrigin(0, 0.5)
      .setDepth(21);

    const inputWidth = 220 * scale;
    const inputX = x - 170 * scale;
    const inputHeight = Math.round(30 * scale);
    const fontSize = Math.max(12, Math.min(24, Math.round(20 * scale)));

    // Search input background border
    this.textFilterInput = this.scene.add.graphics().setDepth(20);
    this.textFilterInput.fillStyle(0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, row3Y - inputHeight / 2, inputWidth, inputHeight, 6 * scale);
    this.textFilterInput.lineStyle(1, 0xe4ae4a, 0.4);
    this.textFilterInput.strokeRoundedRect(inputX, row3Y - inputHeight / 2, inputWidth, inputHeight, 6 * scale);

    const style: any = {
      height: `${inputHeight}px`,
      width: `${inputWidth}px`,
      "caret-color": "#e9cd45",
      color: "#e9cd45",
      background: "transparent",
      border: "none",
      outline: "none",
      "font-family": "Wazoo, Arial, sans-serif",
      "font-size": `${fontSize}px`,
      "padding-left": "8px",
      "padding-right": "8px",
      "box-sizing": "border-box",
      cursor: "text",
      "z-index": "25",
    };

    this.textFilterElem = this.scene.add.dom(inputX, row3Y, "input", style).setOrigin(0, 0.5).setDepth(25);

    const inputElem = this.textFilterElem.node as HTMLInputElement;
    inputElem.type = "text";
    inputElem.id = "selection-dialog-filter-input";
    inputElem.value = this.filterManager.getFilterText();

    inputElem.addEventListener("focus", () => {
      this.resetTextFilterInput(true);
      if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = false;
    });
    inputElem.addEventListener("blur", () => {
      this.resetTextFilterInput(false);
      if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = true;
    });
    inputElem.addEventListener("input", () => {
      this.filterManager.setFilterText(inputElem.value);
      this.onFilterChanged();
    });
    inputElem.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        inputElem.blur();
      }
    });

    const textFilters = this.filterManager.getFiltersByCategory("text");
    const labelStartX = inputX + inputWidth + 20 * scale;
    const labelDistances = [20, 90, 170, 260, 340].map((val) => val * scale);

    textFilters.forEach((filter, i) => {
      const xPos = labelStartX + (labelDistances[i] ?? i * 80 * scale);
      this.scene.add
        .bitmapText(xPos, row3Y - 21 * scale, fontKey, `${filter.label}:`, 24 * scale)
        .setOrigin(0.5, 0)
        .setDepth(21);
    });

    this.filterGroups.createToggleGroup(labelStartX, row3Y, labelDistances, scale);

    this.scene.events.on("ui:toggle-changed", this.handleToggleChanged, this);

    if (cards) {
      this.filterGroups.updateDisabledFilters(cards);
    }
  }

  public updateDisabledFilters(cards: CardState[]) {
    this.filterGroups.updateDisabledFilters(cards);
  }

  private handleToggleChanged(data: any) {
    if (this.filterManager) {
      this.filterManager.setFilterActive(data.changedId, data.selected);
      this.onFilterChanged();
    }
  }

  public resetTextFilterInput(active: boolean) {
    const rawScale = this.scene.scale.width / 1920;
    const scale = this.scene.scale.height < 600 ? rawScale * 1.4 : rawScale;
    const inputX = this.textFilterElem.x;
    const row3Y = this.textFilterElem.y;
    const inputWidth = 220 * scale;
    const inputHeight = Math.round(30 * scale);

    this.textFilterInput.clear();
    this.textFilterInput.fillStyle(active ? 0x000000 : 0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, row3Y - inputHeight / 2, inputWidth, inputHeight, 6 * scale);
    this.textFilterInput.lineStyle(1, 0xe4ae4a, 0.4);
    this.textFilterInput.strokeRoundedRect(inputX, row3Y - inputHeight / 2, inputWidth, inputHeight, 6 * scale);
  }

  public updateSelectedText(matchingCount: number, totalCount: number) {
    if (this.cardsSelectedText) {
      this.cardsSelectedText.setText(`Cards selected: ${matchingCount}/${totalCount}`);
    }
  }

  public destroy() {
    this.scene.events.off("ui:toggle-changed", this.handleToggleChanged, this);
    if (this.bgGfx) this.bgGfx.destroy();
    this.filterGroups.destroy();
    if (this.cardsSelectedText) this.cardsSelectedText.destroy();
    if (this.textFilterElem) this.textFilterElem.destroy();
    if (this.textFilterInput) this.textFilterInput.destroy();
  }
}


