import Phaser from "phaser";
import { TooltipManager } from "../managers/TooltipManager";

export class SidebarButton {
  public image: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private isRightSide: boolean;
  private textureKey: string;

  constructor(
    scene: Phaser.Scene,
    texture: string,
    y: number,
    isRightSide: boolean,
    onClick: () => void
  ) {
    this.scene = scene;
    this.isRightSide = isRightSide;
    this.textureKey = texture;

    const width = scene.scale.width;
    const startX = this.getHiddenX(width);

    this.image = scene.add.image(startX, y, texture)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6)
      .setDepth(9999);

    this.image.on("pointerover", () => {
      const visibleX = this.getVisibleX(scene.scale.width);
      scene.tweens.add({
        targets: this.image,
        x: visibleX,
        duration: 200,
        ease: "Sine.easeOut",
      });
      const bounds = this.image.getBounds();
      TooltipManager.show(visibleX, bounds.top, this.textureKey);
    });

    this.image.on("pointerout", () => {
      scene.tweens.add({
        targets: this.image,
        x: this.getHiddenX(scene.scale.width),
        duration: 200,
        ease: "Sine.easeOut",
      });
      TooltipManager.hide();
    });

    this.image.on("pointerdown", () => {
      TooltipManager.hide();
      onClick();
    });
  }

  private getHiddenX(width: number): number {
    return this.isRightSide ? width + 12 : -12;
  }

  private getVisibleX(width: number): number {
    return this.isRightSide ? width - 24 : 24;
  }

  public resize(width: number, y: number) {
    this.scene.tweens.killTweensOf(this.image);
    this.image.setPosition(this.getHiddenX(width), y);
  }

  public destroy() {
    TooltipManager.hide();
    this.image.destroy();
  }
}
