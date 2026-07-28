import Phaser from "phaser";

export class SidebarButton {
  public image: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private isRightSide: boolean;

  constructor(
    scene: Phaser.Scene,
    texture: string,
    y: number,
    isRightSide: boolean,
    onClick: () => void
  ) {
    this.scene = scene;
    this.isRightSide = isRightSide;

    const width = scene.scale.width;
    const startX = this.getHiddenX(width);

    this.image = scene.add.image(startX, y, texture)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6)
      .setDepth(9999);

    this.image.on("pointerover", () => {
      scene.tweens.add({
        targets: this.image,
        x: this.getVisibleX(scene.scale.width),
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    this.image.on("pointerout", () => {
      scene.tweens.add({
        targets: this.image,
        x: this.getHiddenX(scene.scale.width),
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    this.image.on("pointerdown", onClick);
  }

  private getHiddenX(width: number): number {
    return this.isRightSide ? width + 12 : -12;
  }

  private getVisibleX(width: number): number {
    return this.isRightSide ? width - 24 : 24;
  }

  public resize(width: number, y: number) {
    // Only kill tweens related to x if we want to ensure we don't mess up hover state,
    // but a simple killTweensOf and resetting to hidden is safest during resize.
    this.scene.tweens.killTweensOf(this.image);
    this.image.setPosition(this.getHiddenX(width), y);
  }

  public destroy() {
    this.image.destroy();
  }
}
