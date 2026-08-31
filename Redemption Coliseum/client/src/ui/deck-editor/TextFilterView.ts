import Phaser from "phaser";
import { IconToggleGroup } from "../components/IconToggleGroup";
import { FilterManager } from "../components/filters/FilterManager";

const EDITOR_LAYOUT = {
  statsFontSize: 27,
  searchAreaLineTrans: 0.4,
  textFilterFontSize: 21,
};

export class TextFilterView {
  private scene: Phaser.Scene;
  private cardsSelectedText: Phaser.GameObjects.BitmapText;
  private scale: number = 1.0;

  public textFilterElem!: Phaser.GameObjects.DOMElement;
  public textFilterInput!: Phaser.GameObjects.Graphics;
  public toggleGroup!: IconToggleGroup;

  constructor(
    scene: Phaser.Scene,
    cardsSelectedText: Phaser.GameObjects.BitmapText,
  ) {
    this.scene = scene;
    this.cardsSelectedText = cardsSelectedText;
  }

  /**
   * Generates text search bar inputs and checkbox categories in status bar.
   */
  public createTextFilterUI(
    layout: any,
    scale: number,
    filterManager: FilterManager,
  ): {
    textFilterElem: Phaser.GameObjects.DOMElement;
    textFilterInput: Phaser.GameObjects.Graphics;
  } {
    this.scale = scale;
    const inputWidth = 220 * scale;
    const fontSize = Math.max(12, Math.min(24, Math.round(19 * scale)));

    const style: any = {
      height: "32px",
      position: "absolute",
      "caret-color": "#e9cd45",
      color: "#e9cd45",
      "font-size": `${fontSize}px`,
      "font-family": "Wazoo, Arial, sans-serif",
      padding: "0 8px",
      outline: "none",
      border: "none",
      background: "transparent",
      cursor: "text",
      "box-sizing": "border-box",
    };

    const barCenterY = layout.statusBarTop + layout.statusBarHeight / 2;
    const textY = barCenterY;

    // Shift text search field to be relative to selections counter text
    const inputX =
      this.cardsSelectedText.x + this.cardsSelectedText.width + 15 * scale;

    // 1. Instantiate HTML DOM text input element dynamically
    this.textFilterElem = this.scene.add.dom(inputX, textY, "input", style);
    this.textFilterElem.setOrigin(0, 0.5);
    (this.textFilterElem.node as HTMLElement).style.width = inputWidth + "px";
    this.textFilterElem.setDepth(20);

    // 2. Draw border graphics matching search area style
    this.textFilterInput = this.scene.add.graphics().setDepth(20);
    this.textFilterInput.fillStyle(0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, textY - 16, inputWidth, 32, 6);
    this.textFilterInput.lineStyle(
      1,
      0xe4ae4a,
      EDITOR_LAYOUT.searchAreaLineTrans,
    );
    this.textFilterInput.strokeRoundedRect(
      inputX,
      textY - 16,
      inputWidth,
      32,
      6,
    );

    const textFilters = filterManager.getFiltersByCategory("text");

    // 3. Draw labels for search targets (e.g. Name, special ability, etc.)
    const labelStartX = inputX + inputWidth + 10 * scale;
    const labelDistances = [20, 75, 140, 215, 280].map((val) => val * scale);
    const textFilterFontSize = Math.max(
      14,
      Math.min(28, Math.round(EDITOR_LAYOUT.textFilterFontSize * 0.9 * scale)),
    );

    textFilters.forEach((filter, i) => {
      const xPos = labelStartX + (labelDistances[i] ?? i * 65 * scale);
      this.scene.add
        .bitmapText(xPos, textY - 10, "wazoo", `${filter.label}:`, textFilterFontSize)
        .setOrigin(0.5, 0.5)
        .setDepth(21);
    });

    // 4. Generate IconToggleGroup for search field categories (acting as checkboxes)
    const toggleItems = textFilters.map((filter) => ({
      id: filter.id,
      label: `Filter by ${filter.label}`,
      texture: "checkBoxUnChecked",
      frame: 0,
      altTexture: "checkBoxChecked",
      altFrame: 0,
    }));

    const initialSelected = textFilters
      .filter((f) => filterManager.isFilterActive(f.id))
      .map((f) => f.id);

    // Configure the toggle group specifically as checkboxes
    const toggleScale = 0.15 * scale;
    const toggleSpacingX = 63 * scale;
    this.toggleGroup = new IconToggleGroup(
      this.scene,
      labelStartX,
      textY + 10,
      toggleItems,
      {
        scale: toggleScale,
        spacingX: toggleSpacingX,
        spacingY: 0,
        columns: textFilters.length,
        multiSelect: true,
        initialSelectedIds: initialSelected,
        sfxHover: "DECK_CHECK_HOVER",
        sfxChecked: "DECK_CHECK_SELECT",
        sfxUnchecked: "DECK_CHECK_DESELECT",
        tooltipDir: "top",
      },
    );
    this.toggleGroup.setDepth(35);

    // Map position differences from textFilterXDistance
    let spriteIndex = 0;
    this.toggleGroup.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Sprite) {
        const xOffsets = [20, 75, 140, 215, 280].map((val) => val * scale);
        child.x = xOffsets[spriteIndex] ?? spriteIndex * 65 * scale;
        child.y = 0;
        spriteIndex++;
      }
    });

    return {
      textFilterElem: this.textFilterElem,
      textFilterInput: this.textFilterInput,
    };
  }

  /**
   * Refreshes search box background color depending on focus status.
   */
  public resetTextFilterInput(active: boolean) {
    const inputX = this.textFilterElem.x;
    const textY = this.textFilterElem.y;
    const inputWidth = 220 * this.scale;
    this.textFilterInput.clear();
    this.textFilterInput.fillStyle(active ? 0x000000 : 0x778899, 0.3);
    this.textFilterInput.fillRoundedRect(inputX, textY - 16, inputWidth, 32, 6);
    this.textFilterInput.lineStyle(
      1,
      0xe4ae4a,
      EDITOR_LAYOUT.searchAreaLineTrans,
    );
    this.textFilterInput.strokeRoundedRect(
      inputX,
      textY - 16,
      inputWidth,
      32,
      6,
    );
  }

  public destroy() {
    this.textFilterElem.destroy();
    this.textFilterInput.destroy();
    this.toggleGroup.destroy();
  }
}

