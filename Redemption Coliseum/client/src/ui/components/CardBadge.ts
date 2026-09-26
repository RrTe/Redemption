import Phaser from "phaser";
import type { CardUI } from "../CardUI";
import { CardDetailOverlay } from "../overlays/CardDetailOverlay";

export type CardBadgePosition = "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";

export interface CardBadgeConfig {
  position?: CardBadgePosition;
  radius?: number;
  bgColor?: number;
  bgAlpha?: number;
  borderColor?: number;
  borderWidth?: number;
  textColor?: string;
}

const DEFAULT_CONFIG: Required<CardBadgeConfig> = {
  position: "top-left",
  radius: 20,
  bgColor: 0x000000,
  bgAlpha: 0.75,
  borderColor: 0xffffff,
  borderWidth: 2.5,
  textColor: "#ffffff",
};

/**
 * Generic, reusable badge component for rendering numeric order medallions,
 * counters, or status indicators on any CardUI (styled like PileUI badges).
 */
export class CardBadge {
  private cardUI: CardUI;
  private config: Required<CardBadgeConfig>;
  private container: Phaser.GameObjects.Container;
  private bgGraphics: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private currentText: string = "";

  constructor(cardUI: CardUI, config?: CardBadgeConfig) {
    this.cardUI = cardUI;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const scene = cardUI.scene;
    this.container = scene.add.container(0, 0).setDepth(105).setVisible(false);
    this.bgGraphics = scene.add.graphics();
    this.labelText = scene.add.text(0, 0, "", {
      fontSize: "20px",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
      color: this.config.textColor,
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.container.add([this.bgGraphics, this.labelText]);
    this.cardUI.add(this.container);
  }

  public getText(): string {
    return this.currentText;
  }

  public isVisible(): boolean {
    return this.container.visible && !!this.currentText;
  }

  public show(text: string, position?: CardBadgePosition, _starIcon?: Phaser.GameObjects.Image | null) {
    if (position) this.config.position = position;
    this.setText(text);
    this.updatePosition();
    this.container.setVisible(true);
    this.cardUI.bringToTop(this.container);

    const cardId = this.cardUI.cardData?.id || (this.cardUI.cardData as any)?.cardId;
    if (CardDetailOverlay.isShowingCard(cardId)) {
      CardDetailOverlay.updateBadge(text);
    }
  }

  public setText(text: string) {
    this.currentText = text;
    this.labelText.setText(text);
    this.drawMedallion();

    const cardId = this.cardUI.cardData?.id || (this.cardUI.cardData as any)?.cardId;
    if (CardDetailOverlay.isShowingCard(cardId)) {
      CardDetailOverlay.updateBadge(text);
    }
  }

  public setPosition(pos: CardBadgePosition) {
    this.config.position = pos;
    this.updatePosition();
  }

  public hide() {
    this.container.setVisible(false);
    this.currentText = "";

    const cardId = this.cardUI.cardData?.id || (this.cardUI.cardData as any)?.cardId;
    if (CardDetailOverlay.isShowingCard(cardId)) {
      CardDetailOverlay.updateBadge("");
    }
  }

  public onResize() {
    this.updatePosition();
    this.drawMedallion();
  }

  private drawMedallion() {
    const scale = Math.max(0.85, Math.min(1.4, this.cardUI.width / 130));
    const r = Math.max(18, Math.min(26, this.config.radius * scale));
    const fontSize = Math.max(18, Math.min(26, Math.round(20 * scale)));

    this.bgGraphics.clear();
    this.bgGraphics.fillStyle(this.config.bgColor, this.config.bgAlpha);
    this.bgGraphics.fillCircle(0, 0, r);
    this.bgGraphics.lineStyle(this.config.borderWidth, this.config.borderColor, 0.9);
    this.bgGraphics.strokeCircle(0, 0, r);

    this.labelText.setFontSize(`${fontSize}px`);
    this.labelText.setStroke("#000000", 5);
  }

  private updatePosition() {
    const halfW = this.cardUI.width / 2;
    const halfH = this.cardUI.height / 2;
    const scale = Math.max(0.85, Math.min(1.4, this.cardUI.width / 130));
    const r = Math.max(18, Math.min(26, this.config.radius * scale));
    const margin = r + 4;

    switch (this.config.position) {
      case "top-left":
        this.container.setPosition(-halfW + margin, -halfH + margin);
        break;
      case "top-right":
        this.container.setPosition(halfW - margin, -halfH + margin);
        break;
      case "center":
        this.container.setPosition(0, 0);
        break;
      case "bottom-left":
        this.container.setPosition(-halfW + margin, halfH - margin);
        break;
      case "bottom-right":
        this.container.setPosition(halfW - margin, halfH - margin);
        break;
    }
  }

  public destroy() {
    this.container.destroy();
  }
}
