import Phaser from "phaser";
import type { ActionIconConfig } from "../types";
import { RadialMenu } from "./RadialMenu";

export class ActionIcon extends Phaser.GameObjects.Image {
  private baseScale: number;
  private hoverScale: number;
  private isHovered: boolean = false;
  private menu?: RadialMenu;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: ActionIconConfig,
    baseScale: number = 1,
    delayOffset: number = 0,
    menu?: RadialMenu,
  ) {
    super(scene, x, y, config.iconKey);

    this.baseScale = baseScale;
    this.hoverScale = baseScale * 1.2;
    this.setOrigin(0.5);
    this.menu = menu;
    this.setDepth(4000); // ✨ NEU: Über allem anderen (Preview ist 3000)

    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);

    scene.time.delayedCall(200 + delayOffset, () => {
      scene.tweens.add({
        targets: this,
        scale: { from: baseScale * 1.3, to: baseScale },
        ease: "Back.Out",
        duration: 300,
      });
    });

    this.on("pointerover", () => {
      this.isHovered = true;
      this.setTint(0xffffaa);
      scene.game.events.emit("playSound", "MENU_HOVER"); // ✨ FIX: Globaler Event-Bus
    });

    this.on("pointerout", () => {
      this.isHovered = false;
      this.clearTint();
    });

    this.on("pointerdown", () => {
      scene.game.events.emit("playSound", "MENU_SELECT"); // ✨ FIX: Globaler Event-Bus
      config.callback();
      this.menu?.close();
    });
  }

  public applyPulse(pulseFactor: number) {
    const scale = this.isHovered ? this.hoverScale : this.baseScale;
    this.setScale(scale * pulseFactor);
  }
}
