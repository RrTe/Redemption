import Phaser from "phaser";
import { MAX_HAND_SIZE } from "../../../../shared/card-constants";
import { TooltipManager } from "../managers/TooltipManager";

/**
 * Configuration for the Hand Counter pill appearance.
 */
const HAND_COUNTER_CONFIG = {
  BASE_WIDTH: 74,
  BASE_HEIGHT: 24,
  RADIUS: 12,
  NORMAL_TEXT_COLOR: "#ffffff",
  WARNING_TEXT_COLOR: "#ffb700",
  FULL_TEXT_COLOR: "#ff4d4d",
  NORMAL_BORDER_COLOR: 0xffffff,
  WARNING_BORDER_COLOR: 0xffb700,
  FULL_BORDER_COLOR: 0xff4d4d,
};

/**
 * UI Component rendering a dynamic pill-shaped hand card counter badge.
 */
export class HandCounterUI extends Phaser.GameObjects.Container {
  private badgeBg: Phaser.GameObjects.Graphics;
  private countText: Phaser.GameObjects.Text;
  private cardCount: number = 0;
  private isOpponent: boolean;
  private currentScale: number = 1.0;

  /**
   * Constructs the HandCounterUI container.
   *
   * @param {Phaser.Scene} scene - The hosting Phaser scene.
   * @param {number} x - Center X coordinate.
   * @param {number} y - Center Y coordinate.
   * @param {boolean} [isOpponent=false] - Whether this counter tracks the opponent's hand.
   */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    isOpponent: boolean = false,
  ) {
    super(scene, x, y);
    this.isOpponent = isOpponent;
    this.setSize(HAND_COUNTER_CONFIG.BASE_WIDTH, HAND_COUNTER_CONFIG.BASE_HEIGHT);
    this.setDepth(150);

    this.badgeBg = scene.add.graphics();
    this.add(this.badgeBg);

    this.countText = scene.add
      .text(0, 0, `0 / ${MAX_HAND_SIZE}`, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: "13px",
        fontStyle: "900",
        color: HAND_COUNTER_CONFIG.NORMAL_TEXT_COLOR,
        align: "center",
      })
      .setOrigin(0.5)
      .setStroke("#000000", 3);
    this.add(this.countText);

    this.drawBadge(0);
    this.setupInteractivity();
    scene.add.existing(this);
  }

  /**
   * Sets up hover events for displaying tooltip information.
   */
  private setupInteractivity(): void {
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        -HAND_COUNTER_CONFIG.BASE_WIDTH / 2,
        -HAND_COUNTER_CONFIG.BASE_HEIGHT / 2,
        HAND_COUNTER_CONFIG.BASE_WIDTH,
        HAND_COUNTER_CONFIG.BASE_HEIGHT,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    this.on("pointerover", () => {
      const bounds = this.getBounds();
      const prefix = this.isOpponent ? "Opponent Hand" : "Your Hand";
      const tooltipText = `${prefix}: ${this.cardCount}/${MAX_HAND_SIZE} cards`;
      TooltipManager.show(bounds.centerX, bounds.top, tooltipText, this.isOpponent ? "bottom" : "top", bounds.height);
    });

    this.on("pointerout", () => {
      TooltipManager.hide();
    });
  }

  /**
   * Redraws the badge pill graphics according to the card count state.
   *
   * @param {number} count - The current card count.
   */
  private drawBadge(count: number): void {
    this.badgeBg.clear();

    const w = HAND_COUNTER_CONFIG.BASE_WIDTH * this.currentScale;
    const h = HAND_COUNTER_CONFIG.BASE_HEIGHT * this.currentScale;
    const radius = HAND_COUNTER_CONFIG.RADIUS * this.currentScale;
    const halfW = w / 2;
    const halfH = h / 2;

    let borderColor = HAND_COUNTER_CONFIG.NORMAL_BORDER_COLOR;
    let borderAlpha = 0.6;
    let bgAlpha = 0.65;
    let borderThickness = 1.5;

    if (count >= MAX_HAND_SIZE) {
      borderColor = HAND_COUNTER_CONFIG.FULL_BORDER_COLOR;
      borderAlpha = 0.95;
      borderThickness = 2.5;
      bgAlpha = 0.8;
    } else if (count >= MAX_HAND_SIZE - 2) {
      borderColor = HAND_COUNTER_CONFIG.WARNING_BORDER_COLOR;
      borderAlpha = 0.85;
      borderThickness = 2.0;
    }

    // Shadow & Background
    this.badgeBg.fillStyle(0x000000, bgAlpha);
    this.badgeBg.fillRoundedRect(-halfW, -halfH, w, h, radius);

    // Pill border stroke
    this.badgeBg.lineStyle(borderThickness, borderColor, borderAlpha);
    this.badgeBg.strokeRoundedRect(-halfW, -halfH, w, h, radius);
  }

  /**
   * Updates the displayed hand card count and adjusts colors dynamically.
   *
   * @param {number} newCount - The new card count in hand.
   */
  public updateCount(newCount: number): void {
    this.cardCount = Math.max(0, newCount);
    this.countText.setText(`${this.cardCount} / ${MAX_HAND_SIZE}`);

    let textColor = HAND_COUNTER_CONFIG.NORMAL_TEXT_COLOR;
    if (this.cardCount >= MAX_HAND_SIZE) {
      textColor = HAND_COUNTER_CONFIG.FULL_TEXT_COLOR;
    } else if (this.cardCount >= MAX_HAND_SIZE - 2) {
      textColor = HAND_COUNTER_CONFIG.WARNING_TEXT_COLOR;
    }
    this.countText.setColor(textColor);
    this.drawBadge(this.cardCount);
  }

  /**
   * Rescales and updates positions for responsive viewport changes.
   *
   * @param {number} scale - Viewport scale factor.
   */
  public updateScale(scale: number): void {
    this.currentScale = scale;
    const fontSize = Math.max(10, Math.round(13 * scale));
    this.countText.setFontSize(fontSize);
    this.drawBadge(this.cardCount);

    const w = HAND_COUNTER_CONFIG.BASE_WIDTH * scale;
    const h = HAND_COUNTER_CONFIG.BASE_HEIGHT * scale;
    this.setSize(w, h);
    if (this.input && this.input.hitArea) {
      (this.input.hitArea as Phaser.Geom.Rectangle).setTo(-w / 2, -h / 2, w, h);
    }
  }
}
