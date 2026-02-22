/**
 * Type definition for a single layer within a layered sound effect.
 */
export type SoundLayer = {
  key: string; // The asset key of the sound file.
  vol?: number; // Base volume for this layer (0.0 to 1.0).
  detuneRange?: number; // Random detune in cents (+/-). 0 for no detune.
  delay?: number; // Delay in milliseconds before this layer plays.
  rate?: number; // Playback rate. 1.0 is normal speed.
  loop?: boolean; // ✨ NEU: Soll der Sound loopen?
  repeatInterval?: { min: number; max: number }; // ✨ NEU: Für zufällige Wiederholungen (z.B. Eule)
  panRange?: number; // ✨ NEU: Zufälliges Panning (+/- Wert)
  volRange?: number; // ✨ NEU: Zufällige Lautstärkeschwankung (+/- Wert)
};

/**
 * Type definition for a complete sound effect configuration.
 */
export type SoundEffectConfig = {
  layers: SoundLayer[];
  // Optional special flags for custom logic in the SoundManager
  pitchShiftByPosition?: boolean; // Example for hand card hover
};

/**
 * Main audio configuration object.
 * Maps a sound effect trigger (e.g., "CARD_PLAY") to its layered configuration.
 */
export const AUDIO_CONFIG: Record<string, SoundEffectConfig> = {
  // --- UI & Interaction ---

  CARD_HOVER: {
    layers: [
      // A very subtle paper rustle
      { key: "cardHover", vol: 0.01, detuneRange: 20 },
    ],
  },

  CARD_HOVER_FIELD: {
    layers: [
      // A more defined whoosh for field cards
      { key: "cardHoverField", vol: 0.07, detuneRange: 50 },
    ],
  },

  MENU_OPEN: {
    layers: [{ key: "menu_open", vol: 0.1, detuneRange: 10 }],
  },

  MENU_SELECT: {
    layers: [{ key: "menu_select", vol: 0.3, detuneRange: 5 }],
  },

  MENU_HOVER: {
    layers: [{ key: "menu_hover", vol: 0.2, detuneRange: 30 }],
  },

  PAGE_FLIP: {
    layers: [{ key: "page_flip", vol: 0.3, detuneRange: 100 }],
  },

  // ✨ NEU: Schalter-Sound für Einstellungen
  UI_TOGGLE: {
    layers: [
      // Layer 1: Der direkte, knackige Klick
      { key: "ui_switch", vol: 0.45, detuneRange: 50 },
      // Layer 2: Der "Hall" (verzögert, leiser und etwas dumpfer), für das Raumgefühl
      { key: "ui_switch", vol: 0.15, rate: 0.9, delay: 60, detuneRange: 20 }
    ]
  },

  // --- Game Actions ---

  CARD_DRAW: {
    layers: [
      { key: "cardDraw", vol: 0.1, detuneRange: 50 },
      { key: "cardHoverField", vol: 0.1, detuneRange: 200, delay: 20 },
    ],
  },

  CARD_PLAY: {
    layers: [{ key: "cardPlay", vol: 0.4, detuneRange: 80 }],
  },

  CARD_SHUFFLE: {
    layers: [{ key: "cardShuffle", vol: 0.7, detuneRange: 20 }],
  },

  // --- Game Effects ---

  FORTRESS_IMPACT: {
    layers: [
      { key: "fortressImpact", vol: 0.8, detuneRange: 50 },
      { key: "cardPlay", vol: 0.4, detuneRange: 200, delay: 80, rate: 0.8 },
    ],
  },

  GOOD_DOMINANT: {
    layers: [{ key: "goodDominantSound", vol: 0.8, detuneRange: 10 }],
  },

  EVIL_DOMINANT: {
    layers: [{ key: "evilDominantSound", vol: 1.0, detuneRange: 10 }],
  },

  PHASE_CHANGE: {
    // ✨ NEU: Layer-Sound basierend auf dem PoC
    layers: [
      { key: "clack", vol: 0.1, detuneRange: 20 },
      { key: "whoosh", vol: 0.85, detuneRange: 100, rate: 1.1 },
      { key: "shimmer", vol: 0.95, detuneRange: 50, delay: 10 },
    ],
  },

  // --- Background Ambience ---

  AMBIENCE_TEMPLE: {
    layers: [{ key: "ambience_temple", vol: 0.1, loop: true }],
  },

  AMBIENCE_GARDEN: {
    layers: [
      { key: "ambience_garden", vol: 0.2, loop: true },
      // Die Eule ruft zufällig alle 19-37 Sekunden
      {
        key: "sfx_owl",
        vol: 0.5,
        volRange: 0.2, // Variiert zwischen 0.3 und 0.7
        repeatInterval: { min: 19000, max: 37000 },
        panRange: 0.8, // Zufällig links/rechts
      },
    ],
  },

  AMBIENCE_PLACE: {
    layers: [{ key: "ambience_place", vol: 1.0, loop: true }],
  },
};
