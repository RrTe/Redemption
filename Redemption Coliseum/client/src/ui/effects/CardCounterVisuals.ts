import Phaser from "phaser";
import type { CardUI } from "../CardUI";
import type { CardVisuals } from "./CardVisuals";

/**
 * Manages visual counter badges and modified stat indicators on a card.
 * Adheres to biblical-historical aesthetic standards without sci-fi/neon effects.
 */
export class CardCounterVisuals {
  private scene: Phaser.Scene;
  private cardUI: CardUI;
  private visuals: CardVisuals;
  private paralyzeText: Phaser.GameObjects.Text;
  private setasideText: Phaser.GameObjects.Text;
  private statBadgeContainer: Phaser.GameObjects.Container;
  private statBadgeBg: Phaser.GameObjects.Graphics;
  private statBadgeText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, cardUI: CardUI, visuals: CardVisuals) {
    this.scene = scene;
    this.cardUI = cardUI;
    this.visuals = visuals;

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      color: "#ffff00",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 4,
    };

    this.paralyzeText = scene.add
      .text(0, 0, "", textStyle)
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.setasideText = scene.add
      .text(0, 0, "", textStyle)
      .setOrigin(0.5, 1)
      .setVisible(false);

    // Stat modification badge (e.g. "(7/9)")
    this.statBadgeContainer = scene.add.container(0, 0).setVisible(false);
    this.statBadgeBg = scene.add.graphics();
    this.statBadgeText = scene.add.text(0, 0, "", {
      fontFamily: "Georgia, serif",
      fontSize: "13px",
      color: "#f5edd6",
      fontStyle: "bold",
      stroke: "#1a120b",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.statBadgeContainer.add([this.statBadgeBg, this.statBadgeText]);

    // Attach to CardUI container
    this.cardUI.add([this.paralyzeText, this.setasideText, this.statBadgeContainer]);
  }

  public onUpdateSize() {
    const width = this.cardUI.width;
    const height = this.cardUI.height;
    const fontSize = `${Math.round(height * 0.15)}px`;

    this.paralyzeText.setFontSize(fontSize).setY(-height / 2 + 5);
    this.setasideText.setFontSize(fontSize).setY(height / 2 - 5);

    // Position stat badge in upper right corner of card
    const badgeX = width / 2 - 24;
    const badgeY = -height / 2 + 16;
    this.statBadgeContainer.setPosition(badgeX, badgeY);

    if (this.paralyzeText.visible) this.cardUI.bringToTop(this.paralyzeText);
    if (this.setasideText.visible) this.cardUI.bringToTop(this.setasideText);
    if (this.statBadgeContainer.visible) this.cardUI.bringToTop(this.statBadgeContainer);
  }

  public update() {
    if (!this.cardUI.cardData) return;

    const paralyzeValue = this.getCounter("paralyze");
    if (paralyzeValue > 0) {
      this.paralyzeText.setText(`P: ${paralyzeValue}`).setVisible(true);
      this.cardUI.bringToTop(this.paralyzeText);
    } else {
      this.paralyzeText.setVisible(false);
    }

    const setasideValue = this.getCounter("setaside");
    if (setasideValue > 0) {
      this.setasideText.setText(`SA: ${setasideValue}`).setVisible(true);
      this.cardUI.bringToTop(this.setasideText);
    } else {
      this.setasideText.setVisible(false);
    }

    this.visuals.updateParalyzeEffect(paralyzeValue > 0);
    this.visuals.updateSetAsideEffect(setasideValue > 0);

    this._updateStatBadge();
  }

  /**
   * Updates the modified stats badge (X/Y) if dynamic counter modifiers are present.
   * @private
   */
  private _updateStatBadge() {
    const card = this.cardUI.cardData;
    if (!card) {
      this.statBadgeContainer.setVisible(false);
      return;
    }

    const strMod = this.getCounter("strength_mod") + this.getCounter("strength");
    const toughMod = this.getCounter("toughness_mod") + this.getCounter("toughness");

    // Only display badge when stats are actively modified from base
    if (strMod === 0 && toughMod === 0) {
      this.statBadgeContainer.setVisible(false);
      return;
    }

    const parseBase = (val: any): number => {
      if (typeof val === "number") return Math.round(val);
      if (!val || typeof val !== "string") return 0;
      const parsed = parseInt(val.trim(), 10);
      return isNaN(parsed) ? 0 : parsed;
    };

    const baseStr = parseBase(card.Strength);
    const baseTough = parseBase(card.Toughness);
    const effStr = baseStr + strMod;
    const effTough = baseTough + toughMod;

    const badgeString = `(${effStr}/${effTough})`;
    this.statBadgeText.setText(badgeString);

    // Tint text: warm green if overall boosted, warm terracotta if reduced, ivory if mixed
    if (strMod >= 0 && toughMod >= 0) {
      this.statBadgeText.setColor("#a6e3a1");
    } else if (strMod <= 0 && toughMod <= 0) {
      this.statBadgeText.setColor("#f38ba8");
    } else {
      this.statBadgeText.setColor("#f9e2af");
    }

    // Redraw subtle background pill
    const textBounds = this.statBadgeText.getBounds();
    const padX = 6;
    const padY = 3;
    const bw = Math.max(36, textBounds.width + padX * 2);
    const bh = textBounds.height + padY * 2;

    this.statBadgeBg.clear();
    // Dark leather / wax background pill with subtle gold-brass border
    this.statBadgeBg.fillStyle(0x181412, 0.88);
    this.statBadgeBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);
    this.statBadgeBg.lineStyle(1.5, 0xc29b38, 0.95);
    this.statBadgeBg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);

    this.statBadgeContainer.setVisible(true);
    this.cardUI.bringToTop(this.statBadgeContainer);
  }

  public getCounter(key: string): number {
    const counters: any = this.cardUI.cardData?.counters;
    if (!counters) return 0;
    return (typeof counters.get === "function" ? counters.get(key) : counters[key]) || 0;
  }
}