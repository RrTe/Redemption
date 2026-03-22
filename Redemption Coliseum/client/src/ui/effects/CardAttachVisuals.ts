import Phaser from "phaser";
import { type CardUI } from "../CardUI";

// ✨ Konstanten hierher verschoben
const ATTACH_BORDER_COLOR = 0xa4d4ff; // Frostiges Silberblau
const ATTACH_ICON_SCALE_FEEDBACK = 0.5;
const ATTACH_ICON_SCALE_ANIMATION = 0.6;
const ATTACH_MOVING_ICON_RATIO = 0.6;

export class CardAttachVisuals {
  private scene: Phaser.Scene;
  private cardUI: CardUI;
  private targetGlowGraphics: Phaser.GameObjects.Graphics | null = null;
  private attachIcons: (
    | Phaser.GameObjects.Image
    | Phaser.GameObjects.Graphics
  )[] = [];
  private attachTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, cardUI: CardUI) {
    this.scene = scene;
    this.cardUI = cardUI;
  }

  public showTargetGlow(show: boolean) {
    if (show) {
      if (!this.targetGlowGraphics) {
        this.targetGlowGraphics = this.scene.add.graphics();
        this.cardUI.add(this.targetGlowGraphics);
        this.cardUI.sendToBack(this.targetGlowGraphics);
        // Hinweis: Wir können hier nicht auf 'shadow' zugreifen, um es noch weiter nach hinten zu schieben.
        // Das muss CardUI bei Bedarf regeln oder wir akzeptieren, dass der Glow vor dem Schatten ist (was okay ist).
      }

      this.targetGlowGraphics.clear();
      this.targetGlowGraphics.lineStyle(4, ATTACH_BORDER_COLOR, 1);
      const w = this.cardUI.width + 10;
      const h = this.cardUI.height + 10;
      this.targetGlowGraphics.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

      this.scene.tweens.add({
        targets: this.targetGlowGraphics,
        alpha: { from: 0.5, to: 1 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });

      this.showAttachFeedback(true);
    } else {
      if (this.targetGlowGraphics) {
        this.scene.tweens.killTweensOf(this.targetGlowGraphics);
        this.targetGlowGraphics.destroy();
        this.targetGlowGraphics = null;
      }
      this.showAttachFeedback(false);
    }
  }

  private showAttachFeedback(show: boolean) {
    if (show) {
      if (this.attachIcons.length > 0) return;

      const iconSize = this.cardUI.width * ATTACH_ICON_SCALE_FEEDBACK;

      const backdrop = this.scene.add.graphics();
      backdrop.fillStyle(0x000000, 0.7);
      const radius = (iconSize / 2) * 1.25;
      backdrop.fillCircle(0, 0, radius);
      backdrop.setPosition(this.cardUI.x, this.cardUI.y);
      backdrop.setDepth(2999);
      this.attachIcons.push(backdrop);

      const icon1 = this.scene.add.image(this.cardUI.x, this.cardUI.y, "icon_attach_target");
      icon1.displayWidth = iconSize;
      icon1.scaleY = icon1.scaleX;
      icon1.setAlpha(0.8);
      icon1.setDepth(3000);
      this.attachIcons.push(icon1);

      const startX = this.cardUI.width * 0.25;
      const startY = -this.cardUI.height * 0.25;

      const icon2 = this.scene.add.image(
        this.cardUI.x + startX,
        this.cardUI.y + startY,
        "icon_attach",
      );
      icon2.displayWidth = iconSize * ATTACH_MOVING_ICON_RATIO;
      icon2.scaleY = icon2.scaleX;
      icon2.setAlpha(0);
      icon2.setDepth(3000);
      this.attachIcons.push(icon2);

      this.attachTween = this.scene.tweens.add({
        targets: icon2,
        x: this.cardUI.x,
        y: this.cardUI.y,
        alpha: { from: 0, to: 1, yoyo: true, hold: 200 },
        duration: 1000,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.attachIcons.forEach((icon) => icon.destroy());
      this.attachIcons = [];
      if (this.attachTween) {
        this.attachTween.stop();
        this.attachTween = null;
      }
    }
  }

  public playAttachAnimation() {
    const targetSize = this.cardUI.width * ATTACH_ICON_SCALE_ANIMATION;
    const icon = this.scene.add.image(this.cardUI.x, this.cardUI.y, "icon_attach_success");
    icon.setDepth(3000);
    icon.displayWidth = targetSize;
    icon.scaleY = icon.scaleX;
    const targetScale = icon.scaleX;

    icon.setScale(0);
    icon.setAlpha(0);

    this.scene.tweens.add({
      targets: icon,
      scale: targetScale * 1.5,
      alpha: 1,
      duration: 300,
      ease: "Back.out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: icon,
          scale: targetScale * 2,
          alpha: 0,
          duration: 200,
          onComplete: () => icon.destroy(),
        });
      },
    });
  }

  public destroy() {
    if (this.targetGlowGraphics) this.targetGlowGraphics.destroy();
    this.showAttachFeedback(false);
  }
}