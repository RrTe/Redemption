import { error } from "../utils/logger"; // ✨ NEU: Import

/**
 * Definiert die Struktur der Spieleinstellungen.
 */
export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showTimer: boolean;
  animationsEnabled: boolean; // ✨ NEU: Option für Animationen
  backgroundEffectsEnabled: boolean; // ✨ NEU: Option für Hintergrundeffekte
}

/**
 * Standardwerte, falls keine Einstellungen im Speicher gefunden werden.
 */
const DEFAULTS: GameSettings = {
  masterVolume: 0.7,
  sfxVolume: 1.0,
  musicVolume: 0.8,
  showTimer: true,
  animationsEnabled: true, // ✨ NEU: Standardmäßig an
  backgroundEffectsEnabled: true, // ✨ NEU: Standardmäßig an
};

const STORAGE_KEY = "redemption-coliseum-settings";

/**
 * ✨ NEU: Eine zentrale Klasse, die alle globalen Einstellungen verwaltet.
 * Liest und schreibt Einstellungen aus/in den localStorage.
 */
export class SettingsManager {
  private settings: GameSettings;

  constructor() {
    this.settings = this.load();
  }

  /** Lädt die Einstellungen aus dem localStorage oder verwendet Standardwerte. */
  private load(): GameSettings {
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEY);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        // Fülle fehlende Werte mit den Standards auf, falls die Struktur sich geändert hat.
        return { ...DEFAULTS, ...parsed };
      }
    } catch (error) {
      error("SettingsManager", // ✨ FIX: Logger nutzen
        "Error loading settings from localStorage",
        error,
      );
    }
    return { ...DEFAULTS };
  }

  /** Speichert die aktuellen Einstellungen im localStorage. */
  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      error("SettingsManager", // ✨ FIX: Logger nutzen
        "Error saving settings to localStorage",
        error,
      );
    }
  }

  /** Holt einen bestimmten Einstellungswert. */
  public get<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.settings[key];
  }

  /** ✨ NEU: Prüft, ob Animationen aktiviert sind. */
  public areAnimationsEnabled(): boolean {
    return this.settings.animationsEnabled;
  }

  /** ✨ NEU: Prüft, ob Hintergrundeffekte aktiviert sind. */
  public areBackgroundEffectsEnabled(): boolean {
    return this.settings.backgroundEffectsEnabled;
  }
}
