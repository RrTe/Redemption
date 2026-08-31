import Phaser from "phaser";
import { FilterManager } from "./FilterManager";
import { IconToggleGroup } from "../IconToggleGroup";
import type { CardState } from "../../../../../shared/types";

export class SelectionFilterGroups {
  private scene: Phaser.Scene;
  private filterManager: FilterManager;

  public symbolGroup!: IconToggleGroup;
  public brigadeGroup!: IconToggleGroup;
  public toggleGroup!: IconToggleGroup;

  constructor(scene: Phaser.Scene, filterManager: FilterManager) {
    this.scene = scene;
    this.filterManager = filterManager;
  }

  public createSymbolGroup(
    x: number,
    y: number,
    spacingX: number,
    unifiedScale: number
  ): IconToggleGroup {
    const symbolFilters = this.filterManager.getFiltersByCategory("symbol");
    const symbolToggleItems = symbolFilters.map((s) => ({
      id: s.id,
      label: s.label,
      texture: `${s.id}_med`,
      frame: 0,
      attribute: s.rules[0]?.field,
      values: s.rules[0]?.values || null,
      alignments: s.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    this.symbolGroup = new IconToggleGroup(
      this.scene,
      x - ((symbolFilters.length - 1) * spacingX) / 2,
      y,
      symbolToggleItems,
      {
        scale: unifiedScale,
        spacingX,
        spacingY: 0,
        columns: symbolFilters.length,
        multiSelect: true,
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: symbolFilters
          .filter((s) => this.filterManager.isFilterActive(s.id))
          .map((s) => s.id),
        tooltipDir: "bottom",
      }
    );
    this.symbolGroup.setDepth(15);
    return this.symbolGroup;
  }

  public createBrigadeGroup(
    x: number,
    y: number,
    spacingX: number,
    unifiedScale: number
  ): IconToggleGroup {
    const brigadeFilters = this.filterManager.getFiltersByCategory("brigade");
    const brigadeToggleItems = brigadeFilters.map((b) => ({
      id: b.id,
      label: b.label,
      texture: `${b.id}_med`,
      frame: 0,
      attribute: b.rules[0]?.field,
      values: b.rules[0]?.values || null,
      alignments: b.rules.find((r) => r.field === "Alignment")?.values || null,
    }));

    this.brigadeGroup = new IconToggleGroup(
      this.scene,
      x - ((brigadeFilters.length - 1) * spacingX) / 2,
      y,
      brigadeToggleItems,
      {
        scale: unifiedScale,
        spacingX,
        spacingY: 0,
        columns: brigadeFilters.length,
        multiSelect: true,
        selectedOverlayTexture: "filterSelected_med",
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        initialSelectedIds: brigadeFilters
          .filter((b) => this.filterManager.isFilterActive(b.id))
          .map((b) => b.id),
        tooltipDir: "top",
      }
    );
    this.brigadeGroup.setDepth(15);
    return this.brigadeGroup;
  }

  public createToggleGroup(
    labelStartX: number,
    row3Y: number,
    labelDistances: number[],
    scale: number
  ): IconToggleGroup {
    const textFilters = this.filterManager.getFiltersByCategory("text");
    const toggleItems = textFilters.map((filter) => ({
      id: filter.id,
      texture: "checkBoxUnChecked",
      frame: 0,
      altTexture: "checkBoxChecked",
      altFrame: 0,
    }));

    this.toggleGroup = new IconToggleGroup(
      this.scene,
      labelStartX,
      row3Y + 10 * scale,
      toggleItems,
      {
        scale: 0.22 * scale,
        spacingX: 80 * scale,
        spacingY: 0,
        columns: textFilters.length,
        multiSelect: true,
        initialSelectedIds: textFilters
          .filter((f) => this.filterManager.isFilterActive(f.id))
          .map((f) => f.id),
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
      }
    );
    this.toggleGroup.setDepth(35);

    let spriteIndex = 0;
    this.toggleGroup.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Sprite) {
        child.x = labelDistances[spriteIndex] ?? spriteIndex * 80 * scale;
        child.y = 0;
        spriteIndex++;
      }
    });

    return this.toggleGroup;
  }

  public updateDisabledFilters(cards: CardState[]): void {
    if (!cards || cards.length === 0) return;

    const symbolFilters = this.filterManager.getFiltersByCategory("symbol");
    const disabledSymbols = symbolFilters
      .filter((f) => !cards.some((c) => this.filterManager.evaluateFilter(c, f)))
      .map((f) => f.id);
    if (this.symbolGroup) {
      this.symbolGroup.setDisabledIds(disabledSymbols);
    }

    const brigadeFilters = this.filterManager.getFiltersByCategory("brigade");
    const disabledBrigades = brigadeFilters
      .filter((f) => !cards.some((c) => this.filterManager.evaluateFilter(c, f)))
      .map((f) => f.id);
    if (this.brigadeGroup) {
      this.brigadeGroup.setDisabledIds(disabledBrigades);
    }
  }

  public destroy(): void {
    if (this.symbolGroup) this.symbolGroup.destroy();
    if (this.brigadeGroup) this.brigadeGroup.destroy();
    if (this.toggleGroup) this.toggleGroup.destroy();
  }
}
