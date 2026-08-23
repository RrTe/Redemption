import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import type { IPlayEffect } from "./IPlayEffect.js";
import { log } from "../../utils/logger";

/**
 * Implementiert den visuellen Effekt für das Ausspielen einer "Good Dominant" Karte.
 */
export class GoodDominantPlayEffect implements IPlayEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public playAudio(card: CardUI) {
    this.scene.game.events.emit("playSound", "GOOD_DOMINANT");
  }

  public play(
    cardToAnimate: CardUI,
    startPos: any,
    endPos: { x: number; y: number; angle: number; width: number; height: number },
    onComplete: () => void,
    onCancel?: (cancelFn: () => void) => void,
  ): Phaser.Tweens.Tween | null {
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    const durationMs = 2600;

    this.playAudio(cardToAnimate);

    const largeHeight = this.scene.scale.height * 0.6;
    let textureKey = "card-back";
    if (cardToAnimate.cardData.ImageFile) {
      const key = "card-" + cardToAnimate.cardData.ImageFile;
      if (this.scene.textures.exists(key)) textureKey = key;
    }

    const animCard = this.scene.add.image(cx, cy, textureKey);
    animCard.displayHeight = largeHeight;
    animCard.scaleX = animCard.scaleY;
    animCard.setAlpha(0);
    animCard.setDepth(2000);

    cardToAnimate.setLockedVisibility(true);

    const corona = this.scene.add
      .image(cx, cy, "blue_corona")
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.4)
      .setAlpha(0.95)
      .setDepth(2001);

    const pulseTween = this.scene.tweens.add({
      targets: corona,
      scale: { from: 0.35, to: 0.55 },
      ease: "Sine.easeInOut",
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    const mainParticles = this.scene.add.particles(cx, cy, "blue_sparkle", {
      angle: { min: 0, max: 360 },
      speed: { min: 200, max: 550 },
      lifespan: 800,
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 1, end: 0 },
      blendMode: "ADD",
    });
    mainParticles.stop();
    mainParticles.setDepth(2002);

    const burstParticles = this.scene.add.particles(cx, cy, "blue_sparkle", {
      angle: { min: 0, max: 360 },
      speed: { min: 80, max: 320 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: "ADD",
    });
    burstParticles.stop();
    burstParticles.setDepth(2003);

    this.ensureRayTexture();
    const rays: Phaser.GameObjects.Image[] = [];
    const rayCount = 60;
    const W = this.scene.scale.width;

    for (let i = 0; i < rayCount; i++) {
      const ray = this.scene.add
        .image(cx, cy, "rayTexture")
        .setOrigin(0, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2001);
      ray.displayWidth = Phaser.Math.Between(W * 0.25, W * 0.9);
      ray.displayHeight = Phaser.Math.FloatBetween(1, 4) * 10;
      ray.rotation = Phaser.Math.DegToRad((360 / rayCount) * i + Phaser.Math.Between(-6, 6));
      ray.alpha = 0;
      rays.push(ray);
    }

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      pulseTween.stop();
      if (corona.active) corona.destroy();
      if (mainParticles.active) mainParticles.destroy();
      if (burstParticles.active) burstParticles.destroy();
      rays.forEach((ray) => {
        if (ray.active) ray.destroy();
      });
      if (animCard.active) animCard.destroy();
      cardToAnimate.setLockedVisibility(false);
      cardToAnimate.setAlpha(1);
    };

    if (onCancel) {
      onCancel(() => {
        cleanup();
      });
    }

    try {
      mainParticles.explode(120);
    } catch (e) {
      log("GoodDominantPlayEffect", "WARN: Particle explode failed (main)", e);
    }

    rays.forEach((ray, idx) => {
      this.scene.tweens.add({
        targets: ray,
        alpha: { from: 0, to: Phaser.Math.FloatBetween(0.6, 1.0) },
        duration: 120,
        delay: idx * 4,
      });

      const dx = Math.cos(ray.rotation) * (ray.displayWidth + Phaser.Math.Between(40, 160));
      const dy = Math.sin(ray.rotation) * (ray.displayWidth + Phaser.Math.Between(40, 160));

      this.scene.tweens.add({
        targets: ray,
        x: ray.x + dx,
        y: ray.y + dy,
        alpha: 0,
        ease: "Cubic.easeOut",
        duration: durationMs,
        delay: Phaser.Math.Between(40, 160),
        onComplete: () => {
          if (ray.active) ray.destroy();
        },
      });
    });

    this.scene.time.delayedCall(Math.floor(durationMs * 0.15), () => {
      try {
        if (burstParticles.active) burstParticles.explode(60);
      } catch (e) {
        log("GoodDominantPlayEffect", "WARN: Particle explode failed (burst)", e);
      }
    });

    this.scene.tweens.add({
      targets: animCard,
      alpha: { from: 0, to: 1 },
      duration: Math.max(700, durationMs * 0.9),
      delay: durationMs * 0.1,
      ease: "Quad.easeInOut",
    });

    return this.scene.tweens.add({
      targets: corona,
      scale: corona.scale * 2.4,
      alpha: 0,
      duration: durationMs * 2,
      ease: "Quad.easeOut",
      onComplete: () => {
        pulseTween.stop();
        if (corona.active) corona.destroy();
        if (mainParticles.active) mainParticles.destroy();
        if (burstParticles.active) burstParticles.destroy();

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

  private ensureRayTexture() {
    if (this.scene.textures.exists("rayTexture")) return;
    const w = 512, h = 32;
    const gfx = this.scene.make.graphics({ x: 0, y: 0 });
    for (let i = 0; i < w; i++) {
      const t = i / w;
      const alpha = Math.pow(1 - t, 3) * 0.9;
      const barHeight = h * (0.6 + 0.4 * Math.sin(i / 12));
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillRect(i, (h - barHeight) / 2, 1, barHeight);
    }
    gfx.generateTexture("rayTexture", w, h);
    gfx.destroy();
  }
}
