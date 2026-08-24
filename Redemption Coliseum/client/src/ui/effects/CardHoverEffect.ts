import Phaser from "phaser";
import { CardUI } from "../CardUI";
import { SettingsManager } from "../../managers/SettingsManager";

export class CardHoverEffect {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
  }

  public stopHandHoverAnimation(card: CardUI) {
    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
      card.setData("hoverTween", null);
    }

    const originalScaleX = card.getData("originalScaleX");
    if (originalScaleX !== undefined) {
      card.scaleX = originalScaleX;
      card.scaleY = card.getData("originalScaleY");
    }
  }

  public playHandHoverAnimation(card: CardUI) {
    if (!this.settingsManager.areAnimationsEnabled()) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    if (card.getData("originalScaleX") === undefined) {
      card.setData("originalScaleX", card.scaleX);
      card.setData("originalScaleY", card.scaleY);
    }

    const hoverTween = this.scene.tweens.add({
      targets: card,
      y: card.targetY - 80,
      angle: 0,
      scale: card.getData("originalScaleX") * 1.35,
      duration: 350,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", hoverTween);
  }

  public playHandHoverOutAnimation(card: CardUI) {
    if (!card.scene) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    if (!this.settingsManager.areAnimationsEnabled()) {
      if (card.getData("originalScaleX") !== undefined) {
        card.scale = card.getData("originalScaleX");
        card.x = card.targetX;
        card.y = card.targetY;
        card.angle = card.targetAngle;
      }
      return;
    }

    const returnTween = this.scene.tweens.add({
      targets: card,
      x: card.targetX,
      y: card.targetY,
      angle: card.targetAngle,
      scale: card.getData("originalScaleX") ?? card.scaleX,
      duration: 300,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", returnTween);
  }

  public playTerritoryHoverAnimation(card: CardUI) {
    if (!this.settingsManager.areAnimationsEnabled()) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    if (card.getData("originalScaleX") === undefined) {
      card.setData("originalScaleX", card.scaleX);
      card.setData("originalScaleY", card.scaleY);
    }

    this.scene.children.bringToTop(card);

    const hoverTween = this.scene.tweens.add({
      targets: card,
      scale: card.getData("originalScaleX") * 1.1,
      duration: 200,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", hoverTween);
  }

  public playTerritoryHoverOutAnimation(card: CardUI) {
    if (!card.scene) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    if (!this.settingsManager.areAnimationsEnabled()) {
      if (card.getData("originalScaleX") !== undefined) {
        card.scale = card.getData("originalScaleX");
      }
      return;
    }

    const returnTween = this.scene.tweens.add({
      targets: card,
      scale: card.getData("originalScaleX") ?? card.scaleX,
      duration: 200,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", returnTween);
  }

  public startPulseAnimation(
    scene: Phaser.Scene,
    targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
    pulseAmplitude: number = 0.1,
    pulsePerSecond: number = 0.6,
  ): { stop: () => void } {
    const updatePulse = (time: number, delta: number) => {
      const pulse = 1 + pulseAmplitude * Math.sin((time * pulsePerSecond * 2 * Math.PI) / 1000);
      const targetArray = Array.isArray(targets) ? targets : [targets];
      targetArray.forEach((target) => {
        if (target && target.active && "setScale" in target) {
          const baseScale = target.getData("baseScale") || 1;
          (target as any).setScale(baseScale * pulse);
        }
      });
    };

    scene.events.on("update", updatePulse);

    return {
      stop: () => {
        scene.events.off("update", updatePulse);
        const targetArray = Array.isArray(targets) ? targets : [targets];
        targetArray.forEach((target) => {
          if (target && target.active && "setScale" in target) {
            const baseScale = target.getData("baseScale") || 1;
            (target as any).setScale(baseScale);
          }
        });
      },
    };
  }
}
