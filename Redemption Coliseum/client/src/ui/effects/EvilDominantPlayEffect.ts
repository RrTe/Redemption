import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import type { IPlayEffect } from "./IPlayEffect.js";

/**
 * Implementiert den visuellen Effekt für das Ausspielen einer "Evil Dominant" Karte.
 * Basiert auf dem PoC mit Rauch-Explosionen und Pop-Effekt.
 */
export class EvilDominantPlayEffect implements IPlayEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public playAudio(card: CardUI) {
    this.scene.game.events.emit("playSound", "EVIL_DOMINANT"); // ✨ FIX: Globaler Bus
  }

  public play(
    cardToAnimate: CardUI,
    startPos: any, // Wird ignoriert
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
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;

    // Sound abspielen
    this.playAudio(cardToAnimate);

    // Größe berechnen (60% der Bildschirmhöhe, wie bei Good Dominants)
    const largeHeight = this.scene.scale.height * 0.6;

    // Textur ermitteln
    let textureKey = "card-back";
    if (cardToAnimate.cardData.ImageFile) {
      const key = "card-" + cardToAnimate.cardData.ImageFile;
      if (this.scene.textures.exists(key)) textureKey = key;
    }

    // Visuellen Klon erstellen
    const animCard = this.scene.add.image(cx, cy, textureKey);
    animCard.displayHeight = largeHeight;
    animCard.scaleX = animCard.scaleY;
    animCard.setAlpha(0);
    animCard.setDepth(2000);

    // Original verstecken
    cardToAnimate.setLockedVisibility(true);

    // Basis-Skalierung für den Pop-Effekt speichern
    const baseScale = animCard.scaleX;
    const emitRadius = Math.max(56, Math.floor(animCard.displayWidth * 0.45));

    // Hilfsfunktion für Emitter (aus PoC)
    const makeEmitter = (
      key: string,
      lifeMin: number,
      lifeMax: number,
      speedMin: number,
      speedMax: number,
    ) => {
      const emitter = this.scene.add.particles(0, 0, key, {
        lifespan: { min: lifeMin, max: lifeMax },
        speed: { min: speedMin, max: speedMax },
        angle: { min: -170, max: -20 },
        gravityY: -18,
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.5, end: 0 },
        rotate: { min: -160, max: 160 },
        blendMode: Phaser.BlendModes.NORMAL,
        emitting: false,
        emitZone: {
          type: "random" as const,
          source: new Phaser.Geom.Circle(0, 0, emitRadius) as any,
        },
      });
      // Rauch leicht über der Karte oder auf gleicher Ebene
      emitter.setDepth(2001);
      return emitter;
    };

    const e1 = makeEmitter("smoke1", 700, 1500, 120, 360);
    const e2 = makeEmitter("smoke2", 700, 1600, 140, 420);
    const e3 = makeEmitter("smoke3", 900, 1900, 160, 480);

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (e1.active) e1.destroy();
      if (e2.active) e2.destroy();
      if (e3.active) e3.destroy();
      if (animCard.active) animCard.destroy();
      cardToAnimate.setLockedVisibility(false);
      cardToAnimate.setAlpha(1);
    };

    if (onCancel) {
      onCancel(() => {
        cleanup();
      });
    }

    // Animationen abspielen (Sequenz aus PoC)

    // Explosionen gestaffelt
    e1.explode(36, cx, cy);
    this.scene.time.delayedCall(35, () => {
      if (e2.active) e2.explode(32, cx, cy);
    });
    this.scene.time.delayedCall(70, () => {
      if (e3.active) e3.explode(28, cx, cy);
    });

    // Karte einblenden
    this.scene.tweens.add({
      targets: animCard,
      alpha: { from: 0, to: 1 },
      duration: 300,
      delay: 300,
      ease: "Cubic.easeOut",
    });

    // Karte "ploppt" (skaliert + zurück)
    this.scene.tweens.add({
      targets: animCard,
      scale: { from: baseScale, to: baseScale * 1.1 },
      yoyo: true,
      duration: 400,
      delay: 400,
      ease: "Sine.easeInOut",
    });

    // Gesamtdauer abwarten (PoC: managerVisibleMs = 2200)
    return this.scene.tweens.add({
      targets: { value: 0 },
      value: 1,
      duration: 2200,
      onComplete: () => {
        if (e1.active) e1.destroy();
        if (e2.active) e2.destroy();
        if (e3.active) e3.destroy();

        // Finale Bewegung zur Zielposition
        this.scene.tweens.add({
          targets: animCard,
          x: endPos.x,
          y: endPos.y,
          angle: endPos.angle,
          displayWidth: endPos.width,
          displayHeight: endPos.height,
          duration: 800,
          ease: "Linear",
          onComplete: () => {
            cleanup();
            onComplete();
          },
        });
      },
    });
  }
}
