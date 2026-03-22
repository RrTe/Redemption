import Phaser from "phaser";
import { DEBUG } from "../../utils/logger";
import type { SettingsManager } from "../../managers/SettingsManager";
import type { CardUI } from "../CardUI";
import { PILE_ZONES } from "../../../../shared/zones";

/**
 * Steuert die visuellen Effekte einer einzelnen Karte (Glow, Paralyze, Noise).
 * Fungiert als Komponente der CardUI, nicht als globaler Manager.
 */
export class CardVisuals {
  private scene: Phaser.Scene;
  private cardUI: CardUI;

  // Glow / Spark Effect
  private glowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null =
    null;

  // Paralyze Effect
  private paralyzeEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private paralyzeMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  private paralyzeMask: Phaser.Display.Masks.GeometryMask | null = null;

  // Noise / Foil Effect
  private noiseGraphics: Phaser.GameObjects.Graphics | null = null;
  private noisePoints: {
    x: number;
    y: number;
    alpha: number;
    speedX: number;
    speedY: number;
    flicker: number;
  }[] = [];

  // Debugging
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, cardUI: CardUI) {
    this.scene = scene;
    this.cardUI = cardUI;
  }

  /** Prüft globale Einstellungen. */
  private areEffectsEnabled(): boolean {
    const settings = this.scene.registry.get(
      "settingsManager",
    ) as SettingsManager;
    return settings ? settings.areAnimationsEnabled() : true;
  }

  /** Startet den Glow-Effekt (z.B. bei Mouseover). */
  public startGlow(ignoreZoneCheck: boolean = false) {
    if (!this.areEffectsEnabled()) return;
    if (!ignoreZoneCheck && PILE_ZONES.includes(this.cardUI.currentZone))
      return;
    this.updateGlowZone(true, true);
  }

  /** Stoppt den Glow-Effekt. */
  public stopGlow() {
    if (this.glowEmitter) {
      this.glowEmitter.stop();
      this.glowEmitter.setVisible(false);
    }
  }

  /** Aktiviert oder deaktiviert den Paralyze-Effekt. */
  public updateParalyzeEffect(active: boolean) {
    if (active && this.areEffectsEnabled()) {
      if (this.paralyzeEmitters.length === 0) {
        this.createParalyzeEmitters();
      }
    } else {
      this.removeParalyzeEmitters();
    }
  }

  /** Wird bei Größenänderung der Karte aufgerufen. */
  public onUpdateSize() {
    this.updateGlowZone();
    this.updateParalyzeZone();
    this.syncMaskState();
  }

  /** Wird jeden Frame aufgerufen (für Animationen). */
  public onUpdate() {
    this.syncMaskState();

    // Noise-Effekt Update
    if (this.noiseGraphics && this.areEffectsEnabled()) {
      this.noiseGraphics.clear();
      const w = this.cardUI.width;
      const h = this.cardUI.height;

      for (const pt of this.noisePoints) {
        pt.alpha += pt.flicker * (Math.random() > 0.5 ? 1 : -1);
        pt.alpha = Phaser.Math.Clamp(pt.alpha, 0.05, 0.12);
        pt.x += pt.speedX;
        pt.y += pt.speedY;

        if (pt.x < -w / 2) pt.x = w / 2;
        if (pt.x > w / 2) pt.x = -w / 2;
        if (pt.y < -h / 2) pt.y = h / 2;
        if (pt.y > h / 2) pt.y = -h / 2;

        this.noiseGraphics.fillStyle(0xffffff, pt.alpha);
        this.noiseGraphics.fillRect(pt.x, pt.y, 2, 2);
      }
    }
  }

  private updateGlowZone(
    createIfMissing: boolean = false,
    forceVisible?: boolean,
  ) {
    let w = this.cardUI.width;
    let h = this.cardUI.height;

    if (this.areEffectsEnabled()) {
      if (this.glowEmitter || createIfMissing) {
        let shouldBeVisible = true;
        if (forceVisible !== undefined) shouldBeVisible = forceVisible;
        else if (this.glowEmitter) shouldBeVisible = this.glowEmitter.visible;

        if (this.glowEmitter) this.glowEmitter.destroy();

        const shape = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
        this.glowEmitter = this.scene.add.particles(0, 0, "spark", {
          speedY: { min: -20, max: 20 },
          speedX: { min: -20, max: 20 },
          lifespan: { min: 10, max: 1200 },
          alpha: { start: 0.8, end: 0 },
          scale: { start: 0.1, end: 0 },
          quantity: 100,
          tint: [0xe0ffff, 0xc0c0c0, 0xffd700, 0xffffff],
          blendMode: "ADD",
          emitZone: { type: "edge", source: shape, quantity: 200 },
        });

        this.cardUI.add(this.glowEmitter);
        this.cardUI.sendToBack(this.glowEmitter);

        if (shouldBeVisible) {
          this.glowEmitter.start();
          this.glowEmitter.setVisible(true);
        } else {
          this.glowEmitter.stop();
          this.glowEmitter.setVisible(false);
        }
      }
      this.createNoiseEffect(w, h);
    } else {
      if (this.glowEmitter) {
        this.glowEmitter.destroy();
        this.glowEmitter = null;
      }
      if (this.noiseGraphics) {
        this.noiseGraphics.destroy();
        this.noiseGraphics = null;
      }
    }

    if (DEBUG) {
      if (!this.debugGraphics) {
        this.debugGraphics = this.scene.add.graphics();
        this.cardUI.add(this.debugGraphics);
      }
      this.debugGraphics.clear();
      this.debugGraphics.lineStyle(2, 0x00ff00, 1);
      this.debugGraphics.strokeRectShape(
        new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      );
    } else if (this.debugGraphics) {
      this.debugGraphics.clear();
    }
  }

  private createNoiseEffect(width: number, height: number) {
    if (this.noiseGraphics) {
      this.noiseGraphics.destroy();
      this.noiseGraphics = null;
    }
    if (!this.areEffectsEnabled()) return;

    this.noiseGraphics = this.scene.add.graphics();
    this.cardUI.add(this.noiseGraphics);
    this.noiseGraphics.setBlendMode(Phaser.BlendModes.ADD);

    this.noisePoints = [];
    for (let i = 0; i < 200; i++) {
      this.noisePoints.push({
        x: Phaser.Math.Between(-width / 2, width / 2),
        y: Phaser.Math.Between(-height / 2, height / 2),
        alpha: Phaser.Math.FloatBetween(0.05, 0.12),
        speedX: Phaser.Math.FloatBetween(-0.05, 0.05),
        speedY: Phaser.Math.FloatBetween(0.05, 0.15),
        flicker: Phaser.Math.FloatBetween(0.005, 0.015),
      });
    }
  }

  private createParalyzeEmitters() {
    const w = this.cardUI.width;
    const h = this.cardUI.height;
    const scaleFactor = w / 303.2;
    const rect = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);

    const spark = this.scene.add.particles(0, 0, "blue_spark_small", {
      speedX: { min: -8, max: 8 },
      speedY: { min: -4, max: 4 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 800 },
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.7 * scaleFactor, end: 0.0 },
      quantity: 3,
      tint: [0x99ccff, 0xffffff],
      blendMode: "ADD",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });
    this.cardUI.add(spark);
    this.cardUI.sendToBack(spark);
    this.paralyzeEmitters.push(spark);

    const aura = this.scene.add.particles(0, 0, "blue_aura_small", {
      speedX: { min: -8, max: 8 },
      speedY: { min: -4, max: 4 },
      lifespan: { min: 1500, max: 3000 },
      alpha: { start: 0.3, end: 0 },
      scale: { start: 2.3 * scaleFactor, end: 3.3 * scaleFactor },
      quantity: 1,
      tint: [0x224466, 0x446688, 0x88aacc],
      blendMode: "SCREEN",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });
    this.cardUI.add(aura);
    this.cardUI.sendToBack(aura);
    this.paralyzeEmitters.push(aura);

    const lightning = this.scene.add.particles(0, 0, "blue_lightning", {
      lifespan: 500,
      alpha: { start: 0.8, end: 0.3 },
      scale: { start: 1.0 * scaleFactor, end: 0.8 * scaleFactor },
      quantity: 1,
      frequency: 150,
      tint: [0x99ccff, 0xccccff],
      blendMode: "ADD",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });

    if (this.paralyzeMaskGraphics) this.paralyzeMaskGraphics.destroy();
    this.paralyzeMaskGraphics = this.scene.add.graphics().setVisible(false);
    this.paralyzeMaskGraphics.fillStyle(0xffffff);
    this.paralyzeMaskGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.paralyzeMask = this.paralyzeMaskGraphics.createGeometryMask();
    lightning.setMask(this.paralyzeMask);

    this.cardUI.add(lightning);
    this.cardUI.bringToTop(lightning);
    this.paralyzeEmitters.push(lightning);
  }

  private removeParalyzeEmitters() {
    this.paralyzeEmitters.forEach((e) => e.destroy());
    this.paralyzeEmitters = [];
    if (this.paralyzeMaskGraphics) {
      this.paralyzeMaskGraphics.destroy();
      this.paralyzeMaskGraphics = null;
    }
    this.paralyzeMask = null;
  }

  private updateParalyzeZone() {
    if (this.paralyzeEmitters.length > 0) {
      this.removeParalyzeEmitters();
      this.createParalyzeEmitters();
    }
  }

  private syncMaskState() {
    if (this.paralyzeMaskGraphics && this.cardUI.active) {
      this.paralyzeMaskGraphics.setPosition(this.cardUI.x, this.cardUI.y);
      this.paralyzeMaskGraphics.setRotation(this.cardUI.rotation);
      this.paralyzeMaskGraphics.setScale(
        this.cardUI.scaleX,
        this.cardUI.scaleY,
      );
    }
  }

  public destroy() {
    this.removeParalyzeEmitters();
    if (this.glowEmitter) this.glowEmitter.destroy();
    if (this.noiseGraphics) this.noiseGraphics.destroy();
    if (this.debugGraphics) this.debugGraphics.destroy();
  }
}
