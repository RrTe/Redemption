import Phaser from "phaser";

/**
 * Gemeinsames Interface für alle animierten Hintergründe.
 */
export interface GameBackground {
  /** Wird aufgerufen, um den Hintergrund und seine Effekte zu erstellen. */
  create(): void;

  /** Wird in jedem Frame aufgerufen (für Animationen). */
  update(time: number, delta: number): void;

  /** Räumt alle Ressourcen (Emitter, Tweens) auf. */
  destroy(): void;

  /** Reagiert auf Änderungen in den Einstellungen (z.B. Effekte an/aus). */
  onSettingsChanged(areEffectsEnabled: boolean): void;

  /** ✨ NEU: Passt den Hintergrund an die neue Fenstergröße an. */
  resize(width: number, height: number): void;
}
