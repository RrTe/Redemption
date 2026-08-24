import Phaser from "phaser";
import { TooltipManager } from "../managers/TooltipManager";
import { ViewportManager } from "../managers/ViewportManager";

export class SidebarButton {
  public image: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private isRightSide: boolean;
  private textureKey: string;
  private tooltipKey: string;
  private onResumeHandler: () => void;

  constructor(
    scene: Phaser.Scene,
    texture: string,
    y: number,
    isRightSide: boolean,
    onClick: () => void,
    tooltipKey?: string
  ) {
    this.scene = scene;
    this.isRightSide = isRightSide;
    this.textureKey = texture;
    this.tooltipKey = tooltipKey || texture;

    const width = scene.scale.width;
    const startX = this.getHiddenX(width);

    this.image = scene.add.image(startX, y, texture)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.8)
      .setDepth(9999);

    this.image.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      if (ViewportManager.isTouchPrimary() || pointer?.wasTouch) return;
      this.scene.tweens.killTweensOf(this.image);
      const visibleX = this.getVisibleX(this.scene.scale.width);
      this.scene.tweens.add({
        targets: this.image,
        x: visibleX,
        duration: 200,
        ease: "Sine.easeOut",
      });
      const bounds = this.image.getBounds();
      TooltipManager.show(visibleX, bounds.top, this.tooltipKey);
    });

    this.image.on("pointerout", () => {
      this.retract(false);
    });

    this.image.on("pointerdown", () => {
      this.retract(true);
      onClick();
    });

    this.image.on("pointerup", () => {
      this.retract(true);
    });

    this.onResumeHandler = () => {
      this.retract(true);
    };
    this.scene.events.on("resume", this.onResumeHandler);
  }

  private getHiddenX(width: number): number {
    return this.isRightSide ? width + 12 : -12;
  }

  private getVisibleX(width: number): number {
    return this.isRightSide ? width - 24 : 24;
  }

  /**
   * Retracts the button into the edge and hides any associated tooltip.
   *
   * @param immediate Whether to immediately position the button without animation.
   */
  public retract(immediate = false): void {
    this.scene.tweens.killTweensOf(this.image);
    TooltipManager.hide();
    const hiddenX = this.getHiddenX(this.scene.scale.width);
    if (immediate) {
      this.image.setX(hiddenX);
    } else {
      this.scene.tweens.add({
        targets: this.image,
        x: hiddenX,
        duration: 200,
        ease: "Sine.easeOut",
      });
    }
  }

  public resize(width: number, y: number): void {
    this.retract(true);
    this.image.setY(y);
  }

  public destroy(): void {
    this.scene.events.off("resume", this.onResumeHandler);
    this.scene.tweens.killTweensOf(this.image);
    TooltipManager.hide();
    this.image.destroy();
  }
}
