import Phaser from "phaser";
import type { CardUI } from "../CardUI";
import type { CardVisuals } from "./CardVisuals";

export class CardCounterVisuals {
  private scene: Phaser.Scene;
  private cardUI: CardUI;
  private visuals: CardVisuals;
  private paralyzeText: Phaser.GameObjects.Text;
  private setasideText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, cardUI: CardUI, visuals: CardVisuals) {
    this.scene = scene;
    this.cardUI = cardUI;
    this.visuals = visuals;

    const textStyle = {
      fontSize: "14px",
      color: "#ffff00",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 5,
    };

    this.paralyzeText = scene.add
      .text(0, 0, "", textStyle)
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.setasideText = scene.add
      .text(0, 0, "", textStyle)
      .setOrigin(0.5, 1)
      .setVisible(false);

    // Füge Texte dem Container hinzu
    this.cardUI.add([this.paralyzeText, this.setasideText]);
  }

  public onUpdateSize() {
    const height = this.cardUI.height;
    const fontSize = `${Math.round(height * 0.15)}px`;

    this.paralyzeText.setFontSize(fontSize).setY(-height / 2 + 5);
    this.setasideText.setFontSize(fontSize).setY(height / 2 - 5);

    if (this.paralyzeText.visible) this.cardUI.bringToTop(this.paralyzeText);
    if (this.setasideText.visible) this.cardUI.bringToTop(this.setasideText);
  }

  public update() {
    if (!this.cardUI.cardData || !this.cardUI.cardData.counters) return;

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
  }

  public getCounter(key: string): number {
    const counters: any = this.cardUI.cardData.counters;
    if (!counters) return 0;
    return (typeof counters.get === "function" ? counters.get(key) : counters[key]) || 0;
  }
}