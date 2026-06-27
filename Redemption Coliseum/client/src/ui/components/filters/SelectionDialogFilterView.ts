import Phaser from "phaser";
import { FilterManager } from "./FilterManager";
import { IconToggleGroup } from "../IconToggleGroup";
import type { CardState } from "../../../../../shared/types";

export class SelectionDialogFilterView {
  private scene: Phaser.Scene;
  private onFilterChanged: () => void;
  public filterManager!: FilterManager;

  private symbolGroup!: IconToggleGroup;
  private brigadeGroup!: IconToggleGroup;
  private toggleGroup!: IconToggleGroup; // Checkboxes

  public cardsSelectedText!: Phaser.GameObjects.BitmapText;
  public textFilterElem!: Phaser.GameObjects.DOMElement;
  public textFilterInput!: Phaser.GameObjects.Graphics;
  public textFilterInputTxt!: Phaser.GameObjects.BitmapText;

  constructor(scene: Phaser.Scene, onFilterChanged: () => void) {
    this.scene = scene;
    this.onFilterChanged = onFilterChanged;

    const configData = scene.cache.json.get("filterConfig");
    this.filterManager = new FilterManager(configData);
  }

  public createFiltersUI(x: number, y: number, width: number) {
    const scale = this.scene.scale.width / 1920;

    // Spacing and scaling for medium symbols and brigades
    const spacingX = 46 * scale;
    const unifiedScale = 0.72 * scale;

    // 1. Symbol Filters
    const symbolFilters = this.filterManager.getFiltersByCategory("symbol");
    const symbolToggleItems = symbolFilters.map((s) => ({
      id: s.id,
      texture: `${s.id}_med`,
      frame: 0,
      attribute: s.rules[0]?.field,
      values: s.rules[0]?.values || null,
      alignments: s.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    const symbolTotalWidth = (symbolFilters.length - 1) * spacingX;
    const symbolStartX = x - symbolTotalWidth / 2;

    this.symbolGroup = new IconToggleGroup(
      this.scene,
      symbolStartX,
      y,
      symbolToggleItems,
      {
        scale: unifiedScale,
        spacingX: spacingX,
        spacingY: 0,
        columns: symbolFilters.length,
        multiSelect: true,
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: symbolFilters.filter((s) => this.filterManager.isFilterActive(s.id)).map((s) => s.id),
      }
    );
    this.symbolGroup.setDepth(15);

    // 2. Brigade Filters
    const brigadeFilters = this.filterManager.getFiltersByCategory("brigade");
    const brigadeToggleItems = brigadeFilters.map((b) => ({
      id: b.id,
      texture: `${b.id}_med`,
      frame: 0,
      attribute: b.rules[0]?.field,
      values: b.rules[0]?.values || null,
      alignments: b.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    const brigadeTotalWidth = (brigadeFilters.length - 1) * spacingX;
    const brigadeStartX = x - brigadeTotalWidth / 2;

    this.brigadeGroup = new IconToggleGroup(
      this.scene,
      brigadeStartX,
      y + 36 * scale,
      brigadeToggleItems,
      {
        scale: unifiedScale,
        spacingX: spacingX,
        spacingY: 0,
        columns: brigadeFilters.length,
        multiSelect: true,
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: brigadeFilters.filter((b) => this.filterManager.isFilterActive(b.id)).map((b) => b.id),
      }
    );
    this.brigadeGroup.setDepth(15);

    // 3. Text Search & Checkboxes Row
    const row3Y = y + 78 * scale;

    // Cards Selected label (prominent font size 32px)
    this.cardsSelectedText = this.scene.add
      .bitmapText(x - 420 * scale, row3Y, "wazoo", "Cards selected: 0/0", 32 * scale)
      .setOrigin(0, 0.5)
      .setDepth(21);

    // Text Input DOM element
    const inputWidth = 220 * scale;
    const inputX = x - 170 * scale;

    const style: any = {
      height: "32px",
      position: "absolute",
      "caret-color": "#e9cd45",
      color: "transparent",
      "font-size": Math.max(12, Math.min(24, Math.round(20 * scale))) + "px",
      "font-family": "Arial, Helvetica, sans-serif",
      padding: "0 0 0 8px",
      outline: "none",
      border: "none",
      background: "transparent",
      "-moz-user-select": "none",
      "-webkit-user-select": "none",
      "-ms-user-select": "none",
      "user-select": "none",
      cursor: "text",
      "box-sizing": "border-box",
    };

    this.textFilterElem = this.scene.add.dom(inputX, row3Y, "input", style);
    this.textFilterElem.setOrigin(0, 0.5);
    (this.textFilterElem.node as HTMLElement).style.width = inputWidth + "px";
    this.textFilterElem.setDepth(20);

    // Border graphics for search field
    this.textFilterInput = this.scene.add.graphics().setDepth(20);
    this.textFilterInput.fillStyle(0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, row3Y - 16, inputWidth, 32, 6);
    this.textFilterInput.lineStyle(1, 0xe4ae4a, 0.4);
    this.textFilterInput.strokeRoundedRect(inputX, row3Y - 16, inputWidth, 32, 6);

    // Search overlay text
    this.textFilterInputTxt = this.scene.add
      .bitmapText(inputX + 6, row3Y, "wazoo", "", 26 * scale)
      .setOrigin(0, 0.5)
      .setDepth(21);

    // Text clipping mask
    const textMaskGfx = this.scene.make.graphics({});
    textMaskGfx.fillStyle(0xffffff);
    textMaskGfx.beginPath();
    textMaskGfx.fillRoundedRect(inputX + 4, row3Y - 14, inputWidth - 8, 28, 4);
    const textMask = textMaskGfx.createGeometryMask();
    this.textFilterInputTxt.setMask(textMask);

    const textFilters = this.filterManager.getFiltersByCategory("text");

    // Checkbox Labels & Toggles
    const labelStartX = inputX + inputWidth + 20 * scale;
    const labelDistances = [20, 90, 170, 260, 340].map((val) => val * scale);
    const textFilterFontSize = 24 * scale;

    textFilters.forEach((filter, i) => {
      const xPos = labelStartX + (labelDistances[i] ?? i * 80 * scale);
      this.scene.add
        .bitmapText(xPos, row3Y - 21 * scale, "wazoo", `${filter.label}:`, textFilterFontSize)
        .setOrigin(0.5, 0)
        .setDepth(21);
    });

    const toggleItems = textFilters.map((filter) => ({
      id: filter.id,
      texture: "checkBoxUnChecked",
      frame: 0,
      altTexture: "checkBoxChecked",
      altFrame: 0,
    }));

    const toggleScale = 0.22 * scale;
    this.toggleGroup = new IconToggleGroup(
      this.scene,
      labelStartX,
      row3Y + 10 * scale,
      toggleItems,
      {
        scale: toggleScale,
        spacingX: 80 * scale,
        spacingY: 0,
        columns: textFilters.length,
        multiSelect: true,
        initialSelectedIds: textFilters.filter((f) => this.filterManager.isFilterActive(f.id)).map((f) => f.id),
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
      }
    );
    this.toggleGroup.setDepth(35);

    let spriteIndex = 0;
    this.toggleGroup.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Sprite) {
        const xOffsets = [20, 90, 170, 260, 340].map((val) => val * scale);
        child.x = xOffsets[spriteIndex] ?? spriteIndex * 80 * scale;
        child.y = 0;
        spriteIndex++;
      }
    });

    // Listen to input events
    const textInputNode = this.textFilterElem.node as HTMLInputElement;
    textInputNode.addEventListener("focus", () => {
      this.resetTextFilterInput(true);
      if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = false;
    });
    textInputNode.addEventListener("blur", () => {
      this.resetTextFilterInput(false);
      if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = true;
    });

    this.textFilterElem.addListener("input");
    this.textFilterElem.on("input", () => {
      const query = textInputNode.value;
      this.updateInputTextAndScroll(query);
      this.filterManager.setFilterText(query);
      this.onFilterChanged();
    });

    this.textFilterElem.addListener("keydown");
    this.textFilterElem.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        textInputNode.blur();
      }
    });

    // Listen for toggle changes on the scene
    this.scene.events.on("ui:toggle-changed", this.handleToggleChanged, this);
  }

  private handleToggleChanged(data: any) {
    if (this.filterManager) {
      this.filterManager.setFilterActive(data.changedId, data.selected);
      this.onFilterChanged();
    }
  }

  public resetTextFilterInput(active: boolean) {
    const scale = this.scene.scale.width / 1920;
    const inputX = this.textFilterElem.x;
    const row3Y = this.textFilterElem.y;
    const inputWidth = 220 * scale;

    this.textFilterInput.clear();
    this.textFilterInput.fillStyle(active ? 0x000000 : 0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, row3Y - 16, inputWidth, 32, 6);
    this.textFilterInput.lineStyle(1, 0xe4ae4a, 0.4);
    this.textFilterInput.strokeRoundedRect(inputX, row3Y - 16, inputWidth, 32, 6);
  }

  public updateInputTextAndScroll(value: string) {
    this.textFilterInputTxt.setText(value);

    const scale = this.scene.scale.width / 1920;
    const inputX = this.textFilterElem.x;
    const inputWidth = 220 * scale;
    const paddingLeft = 6;
    const paddingRight = 10;
    const maxVisibleWidth = inputWidth - paddingLeft - paddingRight;

    const textWidth = this.textFilterInputTxt.displayWidth;

    if (textWidth > maxVisibleWidth) {
      this.textFilterInputTxt.x = inputX + paddingLeft - (textWidth - maxVisibleWidth);
    } else {
      this.textFilterInputTxt.x = inputX + paddingLeft;
    }
  }

  public updateSelectedText(matchingCount: number, totalCount: number) {
    if (this.cardsSelectedText) {
      this.cardsSelectedText.setText(`Cards selected: ${matchingCount}/${totalCount}`);
    }
  }

  public destroy() {
    this.scene.events.off("ui:toggle-changed", this.handleToggleChanged, this);
    if (this.symbolGroup) this.symbolGroup.destroy();
    if (this.brigadeGroup) this.brigadeGroup.destroy();
    if (this.toggleGroup) this.toggleGroup.destroy();
    if (this.cardsSelectedText) this.cardsSelectedText.destroy();
    if (this.textFilterElem) this.textFilterElem.destroy();
    if (this.textFilterInput) this.textFilterInput.destroy();
    if (this.textFilterInputTxt) this.textFilterInputTxt.destroy();
  }
}
