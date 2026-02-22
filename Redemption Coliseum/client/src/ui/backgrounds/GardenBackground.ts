import Phaser from "phaser";
import type { GameBackground } from "./GameBackground";
import { SettingsManager } from "../../managers/SettingsManager";

export class GardenBackground implements GameBackground {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;
  private container: Phaser.GameObjects.Container;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private maskImages: Phaser.GameObjects.Image[] = []; // ✨ NEU: Liste für Masken-Bilder

  private readonly VIRTUAL_WIDTH = 1024;
  private readonly VIRTUAL_HEIGHT = 768;

  // ✨ NEU: Konfiguration für die Baum-Animation
  private readonly TREE_ANIMATION_CONFIG = {
    scaleX: { min: 1.01, max: 1.02 },
    scaleY: { min: 1.0, max: 1.01 },
    xOffset: { min: -2, max: 2 },
    duration: { min: 2000, max: 3500 },
  };

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
    // ✨ FIX: Container mit virtueller Größe erstellen
    this.container = this.scene.add.container(0, 0);
    this.container.setSize(this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
    this.container.setDepth(-1000);
  }

  public create() {
    // 1. Basis-Hintergrund
    // ✨ FIX: Positionierung relativ zum Container (virtuelle Größe)
    const bg = this.scene.add.image(
      this.VIRTUAL_WIDTH / 2,
      this.VIRTUAL_HEIGHT / 2,
      "bg_garden",
    );
    bg.setDisplaySize(this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
    this.container.add(bg);

    // 2. Sound starten
    // ✨ FIX: Übergebe die aktuelle Szene explizit.
    this.scene.game.events.emit("playAmbience", "AMBIENCE_GARDEN", this.scene);

    // 3. Effekte (Wankende Bäume)
    if (this.settingsManager.areBackgroundEffectsEnabled()) {
      this.createTreeEffects();
    }

    // 4. Initiale Größe anpassen
    this.resize(this.scene.scale.width, this.scene.scale.height);
  }

  public resize(width: number, height: number): void {
    const scale = Math.min(
      // ✨ FIX: Math.min für FIT-Verhalten
      width / this.VIRTUAL_WIDTH,
      height / this.VIRTUAL_HEIGHT,
    );
    this.container.setScale(scale);
    this.container.setPosition(
      (width - this.VIRTUAL_WIDTH * scale) / 2,
      (height - this.VIRTUAL_HEIGHT * scale) / 2,
    );

    // ✨ FIX: Masken-Bilder manuell synchronisieren, da sie nicht im Container sind.
    // Sie müssen exakt dort liegen, wo der Container das virtuelle Bild hinzeichnet.
    this.maskImages.forEach((mask) => {
      mask.setScale(scale);
      // Globale Position berechnen: Container-Ursprung + (Virtuelle Mitte * Skalierung)
      mask.setPosition(
        this.container.x + (this.VIRTUAL_WIDTH / 2) * scale,
        this.container.y + (this.VIRTUAL_HEIGHT / 2) * scale,
      );
    });
  }

  private createTreeEffects() {
    // Wir erstellen 3 Layer mit Masken für den "Wind"-Effekt
    for (let i = 1; i <= 3; i++) {
      // Das Overlay-Bild (identisch zum Hintergrund)
      const overlay = this.scene.add.image(
        this.VIRTUAL_WIDTH / 2,
        this.VIRTUAL_HEIGHT / 2,
        "bg_garden",
      );
      // Wir berechnen den Basis-Scale, damit wir ihn im Tween als Referenz nutzen können
      const baseScaleX = this.VIRTUAL_WIDTH / overlay.width;
      const baseScaleY = this.VIRTUAL_HEIGHT / overlay.height;
      overlay.setScale(baseScaleX, baseScaleY);

      // Die Maske (unsichtbar, definiert den sichtbaren Bereich des Overlays)
      // ✨ FIX: Maske NICHT in den Container legen und NICHT zur Szene hinzufügen (add: false).
      // Das verhindert Rendering-Probleme. Wir positionieren sie manuell in 'resize'.
      const maskImage = this.scene.make.image({
        x: this.VIRTUAL_WIDTH / 2, // Wird in resize überschrieben
        y: this.VIRTUAL_HEIGHT / 2,
        key: `bg_garden_mask${i}`,
        add: false, // Wichtig: Nicht der Display-Liste hinzufügen!
      });
      // Wir speichern sie, um sie beim Resizen zu aktualisieren
      this.maskImages.push(maskImage);

      // Maske anwenden
      overlay.setMask(
        new Phaser.Display.Masks.BitmapMask(this.scene, maskImage),
      );
      this.container.add(overlay);

      // Tween für das Wanken
      const tween = this.scene.tweens.add({
        targets: overlay,
        scaleX:
          baseScaleX *
          Phaser.Math.FloatBetween(
            this.TREE_ANIMATION_CONFIG.scaleX.min,
            this.TREE_ANIMATION_CONFIG.scaleX.max,
          ),
        scaleY:
          baseScaleY *
          Phaser.Math.FloatBetween(
            this.TREE_ANIMATION_CONFIG.scaleY.min,
            this.TREE_ANIMATION_CONFIG.scaleY.max,
          ),
        x:
          this.VIRTUAL_WIDTH / 2 +
          Phaser.Math.Between(
            this.TREE_ANIMATION_CONFIG.xOffset.min,
            this.TREE_ANIMATION_CONFIG.xOffset.max,
          ),
        duration: Phaser.Math.Between(
          this.TREE_ANIMATION_CONFIG.duration.min,
          this.TREE_ANIMATION_CONFIG.duration.max,
        ),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.activeTweens.push(tween);
    }
  }

  public update(time: number, delta: number) {}

  public onSettingsChanged(areEffectsEnabled: boolean) {
    if (!areEffectsEnabled) {
      this.clearEffects();
    } else if (this.activeTweens.length === 0) {
      // Re-Create wenn wieder aktiviert (vereinfacht: wir laden die Szene neu oder lassen es statisch)
      // Für komplexe Masken ist ein komplettes Re-Create am sichersten.
      this.container.removeAll(true);
      this.create(); // create ruft jetzt resize auf, was korrekt ist
    }
  }

  public destroy() {
    this.clearEffects();
    this.container.destroy();
  }

  private clearEffects() {
    this.activeTweens.forEach((t) => t.stop());
    this.activeTweens = [];
    // ✨ NEU: Masken aufräumen
    this.maskImages.forEach((m) => m.destroy());
    this.maskImages = [];
    // Hinweis: Die Overlays sind im Container und werden mit ihm zerstört oder bei removeAll entfernt.
  }
}
