import Phaser from "phaser";
import type { GameBackground } from "./GameBackground";
import { SettingsManager } from "../../managers/SettingsManager";

export class TempleBackground implements GameBackground {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;
  private container: Phaser.GameObjects.Container;
  private bgImage!: Phaser.GameObjects.Image;

  // Speicher für Effekte zum Aufräumen
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private glowImages: Phaser.GameObjects.Image[] = [];
  private activeTweens: Phaser.Tweens.Tween[] = [];

  // Original-Koordinaten aus dem PoC (basierend auf 1024x768)
  private readonly VIRTUAL_WIDTH = 1024;
  private readonly VIRTUAL_HEIGHT = 768;
  private readonly LEFT_MENORA_X = [226, 269, 313, 359, 403];
  private readonly RIGHT_MENORA_X = [622, 668, 713, 755, 800];
  private readonly MENORA_Y = 246;

  // ✨ NEU: Konfiguration für visuelle Effekte als private Felder
  private readonly FLAME_CONFIG = {
    lifespan: { min: 800, max: 1000 },
    angle: { min: 260, max: 280 },
    speed: { min: 10, max: 130 },
    scale: { start: 0.03, end: 0 },
    alpha: { start: 0.4, end: 0 },
    frequency: 50,
    quantity: 1,
    tint: [0xffe0a0, 0xffc080, 0xffa040],
  };

  private readonly SPARK_CONFIG = {
    lifespan: 1500,
    angle: { min: 250, max: 290 },
    speed: { min: 40, max: 80 },
    scale: { start: 0.02, end: 0 },
    alpha: { start: 0.5, end: 0 },
    frequency: 500,
    quantity: 1,
    tint: [0xfff8c0, 0xffe080],
  };

  private readonly GLOW_CONFIG = {
    baseScale: 0.4,
    baseAlpha: 0.2,
    flickerAlpha: { min: 0.1, max: 0.25 },
    flickerScale: { min: 0.9, max: 1.1 }, // Faktor relativ zur Basis
    duration: { min: 100, max: 300 },
  };

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
    // ✨ FIX: Container mit virtueller Größe erstellen
    this.container = this.scene.add.container(0, 0);
    this.container.setSize(this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
    this.container.setDepth(-1000); // Ganz hinten
  }

  public create() {
    // 1. Hintergrundbild
    // ✨ FIX: Positionierung relativ zum Container (virtuelle Größe)
    this.bgImage = this.scene.add.image(
      this.VIRTUAL_WIDTH / 2,
      this.VIRTUAL_HEIGHT / 2,
      "bg_temple",
    );
    this.bgImage.setDisplaySize(this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
    this.container.add(this.bgImage);

    // 2. Sound starten (über SoundManager)
    // ✨ FIX: Übergebe die aktuelle Szene explizit, da getActiveScene() während create() unzuverlässig sein kann.
    this.scene.game.events.emit("playAmbience", "AMBIENCE_TEMPLE", this.scene);

    // 3. Effekte erstellen (wenn aktiviert)
    if (this.settingsManager.areBackgroundEffectsEnabled()) {
      this.createEffects();
    }

    // 4. Initiale Größe anpassen
    this.resize(this.scene.scale.width, this.scene.scale.height);
  }

  public resize(width: number, height: number): void {
    const scale = Math.min(
      width / this.VIRTUAL_WIDTH,
      height / this.VIRTUAL_HEIGHT,
    ); // ✨ FIX: Math.min für FIT-Verhalten (schwarze Balken statt Zoom)
    this.container.setScale(scale);
    this.container.setPosition(
      (width - this.VIRTUAL_WIDTH * scale) / 2,
      (height - this.VIRTUAL_HEIGHT * scale) / 2,
    );
  }

  public update(time: number, delta: number) {
    // Hier könnten wir später komplexe Animationen steuern
  }

  public onSettingsChanged(areEffectsEnabled: boolean) {
    if (areEffectsEnabled) {
      // Wenn wir noch keine Effekte haben, erstellen wir sie
      if (this.emitters.length === 0) {
        this.createEffects();
      }
    } else {
      // Effekte ausschalten -> Aufräumen
      this.clearEffects();
    }
  }

  public destroy() {
    this.clearEffects();
    this.container.destroy();
  }

  private clearEffects() {
    this.emitters.forEach((e) => e.destroy());
    this.emitters = [];
    this.glowImages.forEach((g) => g.destroy());
    this.glowImages = [];
    this.activeTweens.forEach((t) => t.stop());
    this.activeTweens = [];
  }

  private createEffects() {
    // Linke Menora
    this.LEFT_MENORA_X.forEach((x) => {
      this.spawnCandleEffect(x, this.MENORA_Y);
    });

    // Rechte Menora
    this.RIGHT_MENORA_X.forEach((x) => {
      this.spawnCandleEffect(x, this.MENORA_Y);
    });
  }

  private spawnCandleEffect(x: number, y: number) {
    // 1. Flammen-Partikel
    // Wir nutzen 'bg_flame' und 'bg_spark' (müssen in CardGameScene geladen werden)
    const flame = this.scene.add.particles(x, y, "bg_flame", {
      lifespan: this.FLAME_CONFIG.lifespan,
      angle: this.FLAME_CONFIG.angle,
      speed: this.FLAME_CONFIG.speed,
      scale: this.FLAME_CONFIG.scale,
      alpha: this.FLAME_CONFIG.alpha,
      blendMode: "ADD",
      frequency: this.FLAME_CONFIG.frequency,
      quantity: this.FLAME_CONFIG.quantity,
      tint: this.FLAME_CONFIG.tint,
    });
    this.container.add(flame);
    this.emitters.push(flame);

    // 2. Funken
    const spark = this.scene.add.particles(x, y, "bg_spark", {
      lifespan: this.SPARK_CONFIG.lifespan,
      angle: this.SPARK_CONFIG.angle,
      speed: this.SPARK_CONFIG.speed,
      scale: this.SPARK_CONFIG.scale,
      alpha: this.SPARK_CONFIG.alpha,
      blendMode: "ADD",
      frequency: this.SPARK_CONFIG.frequency,
      quantity: this.SPARK_CONFIG.quantity,
      tint: this.SPARK_CONFIG.tint,
    });
    this.container.add(spark);
    this.emitters.push(spark);

    // 3. Glühen (Glow) mit Tween
    const glow = this.scene.add.image(x, y, "bg_light_glow");
    glow.setScale(this.GLOW_CONFIG.baseScale);
    glow.setAlpha(this.GLOW_CONFIG.baseAlpha);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(glow);
    this.glowImages.push(glow);

    this.flickerGlow(glow);
  }

  private flickerGlow(glow: Phaser.GameObjects.Image) {
    // Rekursiver Tween für Flackern
    const targetAlpha = Phaser.Math.FloatBetween(
      this.GLOW_CONFIG.flickerAlpha.min,
      this.GLOW_CONFIG.flickerAlpha.max,
    );
    // const targetScale = glow.scaleX * Phaser.Math.FloatBetween(
    //   this.GLOW_CONFIG.flickerScale.min,
    //   this.GLOW_CONFIG.flickerScale.max
    // );
    const duration = Phaser.Math.Between(
      this.GLOW_CONFIG.duration.min,
      this.GLOW_CONFIG.duration.max,
    );

    const tween = this.scene.tweens.add({
      targets: glow,
      alpha: targetAlpha,
      // scale: targetScale, // Skalierung weglassen, damit es nicht zu unruhig wird
      duration: duration,
      onComplete: () => {
        if (glow.scene) {
          // Check ob noch aktiv
          this.flickerGlow(glow);
        }
      },
    });
    this.activeTweens.push(tween);
  }
}
