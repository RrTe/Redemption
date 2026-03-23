import Phaser from "phaser";
import type { CardUI } from "../CardUI";

export const SHADOW_CONFIG = {
  OFFSET_REST: 10, // Versatz im Ruhezustand (x, y)
  OFFSET_DRAG: 25, // Versatz beim Ziehen (simulierte Höhe)
  ALPHA_REST: 0.4, // Transparenz im Ruhezustand (0-1)
  ALPHA_DRAG: 0.3, // Transparenz beim Ziehen (weicher)
  SCALE_DRAG: 1.1, // Skalierung beim Ziehen (wird größer)
  PADDING: 0, // Größenzuschlag für den Schatten (Breite/Höhe)
  SLICE: 6, // 9-Slice Randgröße (Ecken-Rundung)
};

export class CardPhysicsEffects {
  private cardUI: CardUI;
  private pulseTime: number = Math.random() * 100;

  constructor(cardUI: CardUI) {
    this.cardUI = cardUI;
  }

  public update(delta: number) {
    if (
      this.cardUI.isBeingDragged &&
      this.cardUI.dragTargetX !== null &&
      this.cardUI.dragTargetY !== null
    ) {
      const lerpFactor = 0.12;

      // Interpoliere zur Zielposition
      const newX = Phaser.Math.Linear(this.cardUI.x, this.cardUI.dragTargetX, lerpFactor);
      const newY = Phaser.Math.Linear(this.cardUI.y, this.cardUI.dragTargetY, lerpFactor);

      // Berechne Geschwindigkeit
      const vx = newX - this.cardUI.x;
      const vy = newY - this.cardUI.y;

      this.cardUI.setPosition(newX, newY);

      // Schatten-Dynamik beim Ziehen (Lift-Effekt)
      this.cardUI.updateShadowState(
        SHADOW_CONFIG.OFFSET_DRAG,
        SHADOW_CONFIG.ALPHA_DRAG,
        SHADOW_CONFIG.SCALE_DRAG
      );

      // Rotation (Wedeln): Reagiert stark auf horizontale Bewegung
      const rot = Phaser.Math.Clamp(vx * 0.05, -0.4, 0.4);
      this.cardUI.setRotation(rot);

      // 3D-Tiefe durch Stauchung (Perspective Tilt)
      const dragBaseScale = 1.1;
      const squashFactor = 0.015; // Empfindlichkeit
      const maxSquash = 0.25; // Maximale Stauchung

      // Pulsieren (Herzschlag)
      this.pulseTime += 0.003 * delta;
      const wave = Math.sin(this.pulseTime);
      const pulse = 0.008 * wave;

      // Horizontaler Speed staucht die Breite, Vertikaler die Höhe
      const squashX = Phaser.Math.Clamp(Math.abs(vx) * squashFactor, 0, maxSquash);
      const squashY = Phaser.Math.Clamp(Math.abs(vy) * squashFactor, 0, maxSquash);

      this.cardUI.setScale(
        dragBaseScale * (1 - squashX) + pulse,
        dragBaseScale * (1 - squashY) + pulse
      );

      // Helligkeitseffekt synchron zum Pulsieren
      const brightnessIntensity = 0.05;

      if (wave > 0) {
        // Aufhellen (Overlay)
        this.cardUI.applyBrightnessEffect(true, wave * brightnessIntensity);
      } else {
        // Abdunkeln (Tint)
        const darkFactor = Math.abs(wave) * brightnessIntensity;
        const val = Math.floor(255 * (1 - darkFactor));
        const color = Phaser.Display.Color.GetColor(val, val, val);
        this.cardUI.applyBrightnessEffect(false, 0, color);
      }
    } else {
      // Reset Schatten wenn nicht gezogen
      this.cardUI.updateShadowState(
        SHADOW_CONFIG.OFFSET_REST,
        SHADOW_CONFIG.ALPHA_REST,
        1
      );
    }
  }
}