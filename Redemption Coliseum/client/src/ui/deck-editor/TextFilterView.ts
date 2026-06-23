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
  public textFilterInputTxt!: Phaser.GameObjects.BitmapText;
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

    const style: any = {
      height: "32px",
      position: "absolute",
      "caret-color": "#e9cd45",
      color: "transparent",
      "font-size": Math.max(12, Math.min(24, Math.round(19 * scale))) + "px",
      "font-family": "Arial, Helvetica, sans-serif",
      padding: "0 0 0 6px",
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

    // 3. Render bitmap text overlaying the transparent input element
    const statsFontSize = Math.max(
      18,
      Math.min(36, Math.round(EDITOR_LAYOUT.statsFontSize * scale)),
    );
    this.textFilterInputTxt = this.scene.add
      .bitmapText(inputX + 5, textY, "wazoo", "", statsFontSize)
      .setOrigin(0, 0.5)
      .setDepth(21);

    // Geometry mask to clip text overflowing search box boundaries
    const textMaskGfx = this.scene.make.graphics({});
    textMaskGfx.fillStyle(0xffffff);
    textMaskGfx.beginPath();
    textMaskGfx.fillRoundedRect(inputX + 4, textY - 14, inputWidth - 8, 28, 4);
    const textMask = textMaskGfx.createGeometryMask();
    this.textFilterInputTxt.setMask(textMask);

    const textFilters = filterManager.getFiltersByCategory("text");

    // 4. Draw labels for search targets (e.g. Name, special ability, etc.)
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

    // 5. Generate IconToggleGroup for search field categories (acting as checkboxes)
    const toggleItems = textFilters.map((filter) => ({
      id: filter.id,
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
      },
    );
    this.toggleGroup.setDepth(35);

    // Map position differences from textFilterXDistance
    let spriteIndex = 0;
    this.toggleGroup.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Sprite) {
        const xOffsets = [20, 75, 140, 215, 280].map((val) => val * scale);
        child.x = xOffsets[spriteIndex] ?? spriteIndex * 65 * scale; // offset relative to parent container
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

  /**
   * Updates text visual overlay and handles leftwards scroll when text overflows.
   */
  public updateInputTextAndScroll(value: string) {
    this.textFilterInputTxt.setText(value);

    const inputX = this.textFilterElem.x;
    const inputWidth = 220 * this.scale;
    const paddingLeft = 5;
    const paddingRight = 10;
    const maxVisibleWidth = inputWidth - paddingLeft - paddingRight;

    const textWidth = this.textFilterInputTxt.displayWidth;

    if (textWidth > maxVisibleWidth) {
      this.textFilterInputTxt.x =
        inputX + paddingLeft - (textWidth - maxVisibleWidth);
    } else {
      this.textFilterInputTxt.x = inputX + paddingLeft;
    }
  }

  public destroy() {
    this.textFilterElem.destroy();
    this.textFilterInput.destroy();
    this.textFilterInputTxt.destroy();
    this.toggleGroup.destroy();
  }
}
