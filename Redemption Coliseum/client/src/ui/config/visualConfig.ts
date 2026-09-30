export const PHASE_BAR_STYLE = {
  FILL_COLOR: 0x1a1a2e, // Dunkles Blau/Grau für den Körper
  FILL_ALPHA: 0.9, // Deckkraft des Körpers
  SHADOW_COLOR: 0x000000, // Schattenfarbe
  SHADOW_ALPHA: 0.5, // Schattenstärke
  HIGHLIGHT_COLOR: 0xffffff, // Glanzlicht oben
  HIGHLIGHT_ALPHA: 0.05, // Stärke des Glanzlichts
  STROKE_COLOR: 0x444466, // Randfarbe
  STROKE_ALPHA: 0.8, // Randstärke
  CORNER_RADIUS: 15, // Rundung der Ecken
};

export const PHASE_INDICATOR_STYLE = {
  ACTIVE_COLOR: 0xffd700, // Gold für aktiven Spieler
  INACTIVE_COLOR: 0xaaaaaa, // Silber/Grau für inaktiven Spieler
  GLOW_STEPS: 4, // Schichten für den weichen Verlauf
  BASE_ALPHA_ACTIVE: 0.25, // Start-Transparenz (aktiv)
  BASE_ALPHA_INACTIVE: 0.12, // Start-Transparenz (inaktiv)
};

export const ZONE_HIGHLIGHT_STYLE = {
  COLOR: 0xffd700,
  ALPHA: 0.3,
  CORNER_RADIUS: 15,
  HOVER_DELAY_MS: 500,
};

export const CARD_PREVIEW_CONFIG = {
  HOVER_DELAY_MS: 500,
};

export const INTERACTION_CONFIG = {
  DOUBLE_CLICK_MS: 300,
  LONG_PRESS_MS: 500,
  TAP_MOVE_THRESHOLD_PX: 15,
};

export const EFFECT_CHRONICLE_CONFIG = {
  ASSET_KEY: "chronicle_icon",
  ASSET_PATH: "assets/ui/icons/chronicle_icon_compressed.png",
  ASPECT_RATIO: 393 / 512, // ~0.7676 rectangular card-like ratio
  PULSE_DURATION_MS: 1750,
  FLIGHT_DURATION_MS: 500,
  SHRINK_MIN_SCALE: 0.50,
  OFFSET_X_FROM_DECK: 15, // Distance to the left of the deck pile
  RESOLVING_DELAY_MS: 250, // Delay for visual resolution feedback
  BADGE_COLOR: 0xffffff,
  BADGE_BG: 0x0f172a,
  BADGE_BORDER: 0xd4af37,
  BUMP_SCALE_FACTOR: 1.25, // Stärke des Bumps beim Karteneinschlag (+25%)
  BUMP_DURATION_MS: 75,   // Dauer des Bumps in ms
};


