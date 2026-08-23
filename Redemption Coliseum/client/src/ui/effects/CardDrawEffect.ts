import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import { SettingsManager } from "../../managers/SettingsManager.js";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) =>
  DEBUG && console.log("[CLIENT DEBUG][CardDrawEffect]", ...a);

export class CardDrawEffect {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
  }

  public play(
    cardToAnimate: CardUI,
    startRect: Phaser.Geom.Rectangle,
    endPos: { x: number; y: number; angle: number },
    delay: number,
    onComplete: () => void,
    onCancel?: (cancelFn: () => void) => void,
  ): Phaser.Tweens.Tween | null {
    // Check: Sind Animationen aktiviert?
    if (!this.settingsManager.areAnimationsEnabled()) {
      cardToAnimate.x = endPos.x;
      cardToAnimate.y = endPos.y;
      cardToAnimate.setAngle(endPos.angle);
      // Kein Tween zurückgeben, da sofort erledigt.
      return null;
    }

    // Klon erstellen
    const animCard = new CardUI(
      this.scene,
      startRect.centerX,
      startRect.centerY,
      cardToAnimate.cardData,
      cardToAnimate.width,
      cardToAnimate.height,
      true, // Starte immer als Rückseite
    );
    animCard.setDepth(200);
    animCard.disableInteractive();

    // Wenn Delay, dann erst unsichtbar (Locking)
    if (delay > 0) {
      animCard.setLockedVisibility(true);
    }

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

    const controlY = startRect.centerY - Phaser.Math.Between(140, 190);
    const baseScaleX = animCard.scaleX;
    const baseScaleY = animCard.scaleY;

    const drawTween = this.scene.tweens.add({
      targets: animCard,
      x: endPos.x,
      delay: delay,
      angle: endPos.angle,
      duration: 650,
      ease: "Cubic.Out",
      onStart: () => {
        if (delay > 0) animCard.setLockedVisibility(false);
      },
      onUpdate: (tween) => {
        if (!animCard.active) return;
        const progress = tween.progress;

        // ✨ DYNAMISCHE ZIELPOSITION: Nutze die aktuellen targetX/targetY der CardUI,
        // falls sich das Layout während der Animation geändert hat (z.B. neue Karte gezogen).
        const currentTargetY = cardToAnimate.targetY || endPos.y;

        // Y-Position (Bezier)
        animCard.y = Phaser.Math.Interpolation.Bezier(
          [startRect.centerY, controlY, currentTargetY],
          progress,
        );

        // Flip-Effekt
        if (progress < 0.5) {
          animCard.scaleX = Phaser.Math.Linear(
            baseScaleX,
            baseScaleX * 0.05,
            progress * 2,
          );
        } else {
          if (animCard.isCurrentlyFaceDown()) {
            animCard.updateFaceDownStatus(false);
          }
          animCard.scaleX = Phaser.Math.Linear(
            baseScaleX * 0.05,
            baseScaleX,
            (progress - 0.5) * 2,
          );
        }

        // Atmender Effekt
        animCard.scaleY = baseScaleY + Math.sin(progress * Math.PI) * 0.1;
      },
      onComplete: () => {
        // ✨ ZENTRALE LÖSUNG (ISSUE 2): Setze die Originalkarte HART auf die Zielposition,
        // BEVOR wir sie sichtbar machen. Das verhindert das "Stapeln" am falschen Ort,
        // falls der Renderer noch nicht gelaufen ist.
        cardToAnimate.x = cardToAnimate.targetX || endPos.x;
        cardToAnimate.y = cardToAnimate.targetY || endPos.y;
        cardToAnimate.setAngle(cardToAnimate.targetAngle || endPos.angle);

        cleanup();

        // Bump-Effekt auf dem Original
        this.scene.tweens.add({
          targets: cardToAnimate,
          y: "-=8",
          duration: 130,
          ease: "Back.Out",
          yoyo: true,
        });

        onComplete();
      },
    });

    return drawTween;
  }
}
