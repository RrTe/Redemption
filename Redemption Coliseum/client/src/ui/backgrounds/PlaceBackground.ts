import Phaser from "phaser";
import type { GameBackground } from "./GameBackground";
import { SettingsManager } from "../../managers/SettingsManager";

export class PlaceBackground implements GameBackground {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;
  private container: Phaser.GameObjects.Container;
  private bgImage!: Phaser.GameObjects.Image;

  // ✨ NEU: Liste für aktive Staub-Emitter (statt einem einzigen)
  private dustEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private dustTimer: Phaser.Time.TimerEvent | null = null;

  private leafTimer: Phaser.Time.TimerEvent | null = null;
  private activeLeaves: Phaser.GameObjects.Image[] = [];
  private maskGraphics: Phaser.GameObjects.Graphics | null = null; // ✨ NEU: Maske

  private readonly VIRTUAL_WIDTH = 1024;
  private readonly VIRTUAL_HEIGHT = 768;

  // ✨ NEU: Wind-Logik aus dem PoC
  private currentWindFactor: number = 1.0;
  private readonly DUST_ZONES = [
    { x: 150, y: 550 },
    { x: 350, y: 650 },
    { x: 350, y: 350 },
    { x: 930, y: 100 },
    { x: 770, y: 250 },
  ];
  private readonly DUST_COLORS = [0xb75906, 0xb15503, 0xc6680b, 0xb75906];

  // ✨ NEU: Konfiguration für Staub
  private readonly DUST_CONFIG = {
    lifespan: { min: 2000, max: 5000 },
    speedX: { min: 20, max: 60 },
    speedY: { min: -60, max: 20 },
    accelerationX: -10,
    accelerationY: -5,
    scale: { start: 0.1, end: 0.01 },
    alpha: { start: 0.7, end: 0 },
    frequency: 50,
    quantity: 1,
    burstDuration: 1000,
    nextBurstDelay: { min: 1000, max: 6000 },
  };

  // ✨ NEU: Konfiguration für Blätter
  private readonly LEAF_CONFIG = {
    spawnInterval: 4000,
    spawnChance: 0.4, // 40% Chance
    duration: { min: 4000, max: 7000 },
  };

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
    this.container = this.scene.add.container(0, 0).setDepth(-1000);
  }

  public create() {
    // 1. Hintergrund
    this.bgImage = this.scene.add.image(
      this.VIRTUAL_WIDTH / 2,
      this.VIRTUAL_HEIGHT / 2,
      "bg_place",
    );
    this.bgImage.setDisplaySize(this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
    this.container.add(this.bgImage);

    // ✨ NEU: Maske erstellen, die exakt dem Hintergrundbild entspricht
    this.maskGraphics = this.scene.make.graphics({}, false);
    const mask = new Phaser.Display.Masks.GeometryMask(
      this.scene,
      this.maskGraphics,
    );
    this.container.setMask(mask);

    // 2. Sound
    // ✨ FIX: Übergebe die aktuelle Szene explizit.
    this.scene.game.events.emit("playAmbience", "AMBIENCE_PLACE", this.scene);

    // 3. Effekte
    if (this.settingsManager.areBackgroundEffectsEnabled()) {
      this.startEffects();
    }

    // 4. Initiale Größe
    this.resize(this.scene.scale.width, this.scene.scale.height);
  }

  public resize(width: number, height: number): void {
    const scale = Math.min(
      width / this.VIRTUAL_WIDTH,
      height / this.VIRTUAL_HEIGHT,
    ); // ✨ FIX: Math.min für FIT-Verhalten

    const x = (width - this.VIRTUAL_WIDTH * scale) / 2;
    const y = (height - this.VIRTUAL_HEIGHT * scale) / 2;

    this.container.setScale(scale);
    this.container.setPosition(x, y);

    // ✨ FIX: Maske an die tatsächliche Welt-Position und -Größe des Containers anpassen
    if (this.maskGraphics) {
      this.maskGraphics.clear();
      this.maskGraphics.fillStyle(0xffffff);
      this.maskGraphics.fillRect(
        x,
        y,
        this.VIRTUAL_WIDTH * scale,
        this.VIRTUAL_HEIGHT * scale,
      );
    }
  }

  private startEffects() {
    // --- Staub-Zyklus starten ---
    this.scheduleNextDust();

    // --- Blätter-Zyklus starten ---
    this.leafTimer = this.scene.time.addEvent({
      delay: this.LEAF_CONFIG.spawnInterval,
      loop: true,
      callback: () => {
        if (Math.random() < this.LEAF_CONFIG.spawnChance) {
          this.spawnLeaf();
        }
      },
    });
  }

  private scheduleNextDust() {
    const delay = Phaser.Math.Between(
      this.DUST_CONFIG.nextBurstDelay.min,
      this.DUST_CONFIG.nextBurstDelay.max,
    );
    this.dustTimer = this.scene.time.delayedCall(delay, () =>
      this.spawnDustBurst(),
    );
  }

  private spawnDustBurst() {
    const zone = Phaser.Utils.Array.GetRandom(this.DUST_ZONES);
    this.currentWindFactor = 1.5; // Windstoß aktiv!

    // Emitter für diesen Burst erstellen
    const emitter = this.scene.add.particles(zone.x, zone.y, "bg_dust", {
      lifespan: this.DUST_CONFIG.lifespan,
      speedX: this.DUST_CONFIG.speedX,
      speedY: this.DUST_CONFIG.speedY,
      accelerationX: this.DUST_CONFIG.accelerationX,
      accelerationY: this.DUST_CONFIG.accelerationY,
      scale: this.DUST_CONFIG.scale,
      alpha: this.DUST_CONFIG.alpha,
      blendMode: "ADD",
      tint: Phaser.Utils.Array.GetRandom(this.DUST_COLORS),
      frequency: this.DUST_CONFIG.frequency,
      quantity: this.DUST_CONFIG.quantity,
      emitting: true,
      emitZone: {
        type: "random",
        source: new Phaser.Geom.Rectangle(-50, -50, 50, 50),
      } as any, // ✨ FIX: Cast zu 'any' um Typkonflikte sicher zu beheben
    });

    this.container.add(emitter);
    this.dustEmitters.push(emitter);

    // Nach 1 Sekunde Wind normalisieren und Emitter stoppen
    this.scene.time.delayedCall(this.DUST_CONFIG.burstDuration, () => {
      this.currentWindFactor = 1.0;
      emitter.stop();
      // Emitter später ganz entfernen, wenn alle Partikel weg sind
      this.scene.time.delayedCall(5000, () => {
        emitter.destroy();
        this.dustEmitters = this.dustEmitters.filter((e) => e !== emitter);
      });
    });

    this.scheduleNextDust();
  }

  private spawnLeaf() {
    const keys = ["bg_leaf1", "bg_leaf2", "bg_leaf3"];
    const key = Phaser.Utils.Array.GetRandom(keys);

    // Start links außerhalb
    const startX = -50;
    const startY = Phaser.Math.Between(
      this.VIRTUAL_HEIGHT * 0.2,
      this.VIRTUAL_HEIGHT * 0.9,
    );

    const leaf = this.scene.add.image(startX, startY, key);
    // ✨ FIX: Skalierung wie im PoC dynamisch machen
    const initialScale = Phaser.Math.FloatBetween(0.7, 1.0);
    const finalScale = initialScale * Phaser.Math.FloatBetween(0.4, 0.6);
    leaf.setScale(initialScale);
    this.container.add(leaf);
    this.activeLeaves.push(leaf);

    // Flugbahn (Bezier) - ✨ FIX: Nutze currentWindFactor für Kurven
    const endX = this.VIRTUAL_WIDTH + 100 + this.currentWindFactor * 60;
    const endY = startY + Phaser.Math.Between(-200, 200);

    const controlX1 = this.VIRTUAL_WIDTH * 0.3 + this.currentWindFactor * 30;
    const controlY1 = startY - 100;
    const controlX2 = this.VIRTUAL_WIDTH * 0.7 + this.currentWindFactor * 50;
    const controlY2 = endY + 100;

    // ✨ FIX: Geschwindigkeit abhängig vom Wind
    const duration =
      Phaser.Math.Between(
        this.LEAF_CONFIG.duration.min,
        this.LEAF_CONFIG.duration.max,
      ) / this.currentWindFactor;

    // ✨ FIX: Bewegungstween mit Proxy-Objekt (wie im PoC) für sauberes Easing und Typ-Sicherheit
    const tweenObject = { t: 0 };

    this.scene.tweens.add({
      targets: tweenObject,
      t: 1, // Wir animieren t von 0 auf 1
      duration: duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const t = tweenObject.t;
        const x = Phaser.Math.Interpolation.Bezier(
          [startX, controlX1, controlX2, endX],
          t,
        );
        const y = Phaser.Math.Interpolation.Bezier(
          [startY, controlY1, controlY2, endY],
          t,
        );
        leaf.setPosition(x, y);

        // Skalierung interpolieren
        const currentScale = Phaser.Math.Interpolation.Linear(
          [initialScale, finalScale],
          t,
        );
        leaf.setScale(currentScale);
      },
      onComplete: () => {
        leaf.destroy();
        this.activeLeaves = this.activeLeaves.filter((l) => l !== leaf);
      },
    });

    // Rotationstween (Flattern)
    this.scene.tweens.add({
      targets: leaf,
      angle: Phaser.Math.Between(180, 720) * this.currentWindFactor,
      duration: duration / this.currentWindFactor,
    });
  }

  public update(time: number, delta: number) {}

  public onSettingsChanged(areEffectsEnabled: boolean) {
    if (areEffectsEnabled) {
      // Prüfen ob Timer läuft, um doppeltes Starten zu verhindern
      if (!this.dustTimer) {
        this.startEffects();
      }
    } else {
      this.clearEffects();
    }
  }

  public destroy() {
    this.clearEffects();
    this.container.destroy();
    // ✨ FIX: Maske erst beim endgültigen Zerstören der Szene aufräumen
    if (this.maskGraphics) {
      this.maskGraphics.destroy();
    }
  }

  private clearEffects() {
    this.dustEmitters.forEach((e) => e.destroy());
    this.dustEmitters = [];
    if (this.dustTimer) {
      this.dustTimer.remove();
      this.dustTimer = null;
    }
    if (this.leafTimer) {
      this.leafTimer.remove();
      this.leafTimer = null;
    }
    this.activeLeaves.forEach((l) => l.destroy());
    this.activeLeaves = [];
    // ✨ FIX: Maske NICHT zerstören, da sie für den Hintergrund benötigt wird!
  }
}
