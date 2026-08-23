import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import type { IPlayEffect } from "./IPlayEffect.js";

/**
 * Führt die Standard-Ausspielanimation aus (Bogenflug).
 * Diese Klasse ist für den generischen "cardPlay"-Sound verantwortlich.
 */
export class StandardPlayEffect implements IPlayEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public playAudio(card: CardUI) {
    // Spielt den generischen Sound für das Ausspielen ab.
    this.scene.game.events.emit("playSound", "CARD_PLAY"); // ✨ FIX: Globaler Bus
  }

  public play(
    cardToAnimate: CardUI,
    startPos: {
      x: number;
      y: number;
      angle: number;
      width: number;
      height: number;
    },
    endPos: {
      x: number;
      y: number;
      angle: number;
      width: number;
      height: number;
    },
    onComplete: () => void,
    onCancel?: (cancelFn: () => void) => void,
  ): Phaser.Tweens.Tween | null {
    this.playAudio(cardToAnimate);

    // Klon erstellen
    const animCard = new CardUI(
      this.scene,
      startPos.x,
      startPos.y,
      cardToAnimate.cardData,
      startPos.width,
      startPos.height,
      false,
    );
    animCard.setAngle(startPos.angle);
    animCard.setDepth(1000);
    animCard.disableInteractive();

    // Original verstecken
    cardToAnimate.setLockedVisibility(true);

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      cardToAnimate.setLockedVisibility(false);
      if (animCard && animCard.active) {
        animCard.destroy();
      }
    };

    if (onCancel) {
      onCancel(() => {
        cleanup();
      });
    }

    const controlY = Math.min(startPos.y, endPos.y) - 150;
    const targetScaleX = endPos.width / startPos.width;
    const targetScaleY = endPos.height / startPos.height;

    return this.scene.tweens.add({
      targets: animCard,
      x: endPos.x,
      angle: endPos.angle,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      duration: 500,
      ease: "Quad.Out",
      onUpdate: (tween) => {
        if (!animCard.active) return;
        animCard.y = Phaser.Math.Interpolation.Bezier(
          [startPos.y, controlY, endPos.y],
          tween.progress,
        );
      },
      onComplete: () => {
        cleanup();
        onComplete();
      },
    });
  }
}
