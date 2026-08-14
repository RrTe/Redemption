import Phaser from "phaser";
import { editorEvents } from "./EditorEventCenter";
import { TooltipManager } from "../managers/TooltipManager";

export class DeckButtonManager {
  private scene: Phaser.Scene;
  private buttons: Map<string, Phaser.GameObjects.Image> = new Map();
  private hoverFrames: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupEvents();
  }

  private setupEvents() {
    // Enable or disable buttons based on whether the deck is empty or has cards
    editorEvents.on("deck-changed", this.onDeckChanged, this);
  }

  private onDeckChanged(deckSize: number, reserveSize: number, isValid?: boolean) {
    const hasCards = deckSize > 0 || reserveSize > 0;
    this.toggleButtonState("saveButton", hasCards);
    this.toggleButtonState("clearButton", hasCards);
    this.toggleButtonState("shareButton", hasCards);
    this.toggleButtonState("saveLackeyButton", hasCards);
    this.toggleButtonState("deckMetricsButton", hasCards);
    this.toggleButtonState("battleButton", !!isValid);
  }

  /**
   * Creates an interactive toolbar button with hover effects and clicks.
   */
  public createButton(
    key: string,
    x: number,
    y: number,
    texture: string,
    hoverScale: number,
    eventName: string,
    sfxKey?: string,
    scale: number = 0.17,
    tooltipKey?: string,
    tooltipDir: "top" | "bottom" | "auto" = "bottom"
  ): Phaser.GameObjects.Image {
    const button = this.scene.add.image(x, y, texture).setScale(scale);
    button.setDepth(970); // searchAreaDepth - 30

    // Construct a hover highlight outline graphics overlay
    const hoverFrame = this.scene.add.graphics();
    hoverFrame.setDepth(1050); // searchAreaDepth + 50
    hoverFrame.setVisible(false);

    button.setInteractive({ useHandCursor: true });

    button.on("pointerover", () => {
      button.setScale(scale * (1 + hoverScale));
      this.drawHoverFrame(hoverFrame, button);
      const bounds = button.getBounds();
      const resolvedTooltipKey = tooltipKey || `button_${key.replace(/Button$/, "").toLowerCase()}`;
      TooltipManager.show(bounds.centerX, bounds.top, resolvedTooltipKey, tooltipDir, bounds.height);
    });

    button.on("pointerout", () => {
      TooltipManager.hide();
      button.setScale(scale);
      hoverFrame.setVisible(false);
    });

    button.on("pointerup", () => {
      TooltipManager.hide();
      if (sfxKey) {
        this.scene.game.events.emit("playSound", sfxKey);
      }
      editorEvents.emit(eventName);
    });

    this.buttons.set(key, button);
    this.hoverFrames.set(key, hoverFrame);

    return button;
  }

  private drawHoverFrame(frame: Phaser.GameObjects.Graphics, target: Phaser.GameObjects.Image) {
    const bounds = target.getBounds();
    const padding = 3;
    const radius = 5;

    frame.clear();
    // 0xe9cd45 is the golden outline color
    frame.lineStyle(2, 0xe9cd45, 0.95);
    frame.strokeRoundedRect(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2,
      radius
    );
    frame.setVisible(true);
  }

  /**
   * Toggles the interactive and opacity state of a button.
   */
  public toggleButtonState(key: string, enabled: boolean) {
    const button = this.buttons.get(key);
    if (!button) return;

    if (enabled) {
      button.setInteractive();
      button.setAlpha(1.0);
    } else {
      TooltipManager.hide();
      button.disableInteractive();
      button.setAlpha(0.5);
      
      const frame = this.hoverFrames.get(key);
      if (frame) {
        frame.setVisible(false);
      }
    }
  }

  public getButton(key: string): Phaser.GameObjects.Image | undefined {
    return this.buttons.get(key);
  }

  public destroy() {
    TooltipManager.hide();
    editorEvents.off("deck-changed", this.onDeckChanged, this);
    this.buttons.forEach((btn) => btn.destroy());
    this.hoverFrames.forEach((frame) => frame.destroy());
    this.buttons.clear();
    this.hoverFrames.clear();
  }
}
