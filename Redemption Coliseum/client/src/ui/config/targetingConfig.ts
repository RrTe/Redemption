// client/src/ui/config/targetingConfig.ts

/**
 * Visual and behavioral configuration for Targeting Arrows in Redemption Coliseum.
 * Strict rules:
 * - Ice blue (#00cec9 / #48dbfb) is strictly reserved for spotlight eligibility and never used here.
 * - Card mouseover flame-yellow border is distinct from arrow alignment palettes.
 */
export const TARGETING_ARROW_CONFIG = {
  // Color palettes per alignment: aura (outer glow), beam (body), core (inner stream), shadow
  PALETTES: {
    GOOD: {
      AURA: 0xd4af37, // Warm amber / celestial gold
      BEAM: 0xf39c12, // Radiant warm amber
      CORE: 0xfff6dd, // Heavenly white-gold highlight
      AURA_ALPHA: 0.35,
      BEAM_ALPHA: 0.65,
      CORE_ALPHA: 0.95,
    },
    EVIL: {
      AURA: 0x0f1419, // Deep obsidian / shadow smoke
      BEAM: 0x242b35, // Smoky graphite
      CORE: 0x5a6578, // Metallic obsidian sheen
      AURA_ALPHA: 0.35,
      BEAM_ALPHA: 0.65,
      CORE_ALPHA: 0.95,
    },
    NEUTRAL: {
      AURA: 0x64748b, // Cool slate sheen
      BEAM: 0x94a3b8, // Pale metallic silver
      CORE: 0xf8fafc, // Platinum white highlight
      AURA_ALPHA: 0.35,
      BEAM_ALPHA: 0.65,
      CORE_ALPHA: 0.95,
    },
  },

  // 3D Drop Shadow offset and transparency
  SHADOW: {
    COLOR: 0x000000,
    ALPHA: 0.40,
    OFFSET_X: 3,
    OFFSET_Y: 5,
  },

  // Animation Timings (in milliseconds)
  TIMINGS: {
    SURGE_DURATION_MS: 180,
    SURGE_EASE: "Power2.easeOut",
    DOCK_BUMP_MS: 120,
    DOCK_BUMP_SCALE: 1.15,
    TELEGRAPH_DURATION_MS: 500,
    FADE_OUT_MS: 160,
  },

  // Continuous arrowhead bobbing & matter flow motion
  MOTION: {
    BOB_AMPLITUDE_PX: 5, // Oscillates +/- 5px along the target vector
    BOB_SPEED: 0.006, // Angular speed for sine wave
    STREAM_CYCLE_SPEED: 0.0001, // Speed of traveling light pulses along spline
    STREAM_PULSE_COUNT: 24, // Number of concurrent energy matter pulses
    STREAM_PULSE_WIDTH: 0.04, // Fraction of spline length per pulse
  },

  // Geometry and Bezier curves
  GEOMETRY: {
    BASE_LINE_WIDTH: 4.5,
    AURA_LINE_WIDTH: 11,
    CORE_LINE_WIDTH: 1.8,
    ARROWHEAD_LENGTH: 22,
    ARROWHEAD_WIDTH: 18,
    ARROWHEAD_INDENT: 6, // Swept-back chevron wing depth
    ARCH_LIFT_FACTOR: 0.22, // Lift proportional to distance between endpoints
    MIN_ARCH_LIFT_PX: 35,
    MAX_ARCH_LIFT_PX: 140,
  },

  // Depth rendering hierarchy
  DEPTHS: {
    ARROW: 1350, // Renders above ELEVATED_DEPTH (1300)
    SOURCE_ELEVATION_DELTA: 10,
  },
} as const;

export type TargetingAlignment = "GOOD" | "EVIL" | "NEUTRAL";

/**
 * Resolves the targeting alignment category ("GOOD", "EVIL", or "NEUTRAL") from a card.
 *
 * @param card CardUI or card data object.
 * @returns Resolved alignment category.
 */
export function resolveCardAlignment(card: any): TargetingAlignment {
  const cardData = card?.cardData || card || {};
  let alignment = cardData.inGameAlignment || cardData.Alignment || "";
  if (Array.isArray(alignment)) {
    alignment = alignment.join(" ");
  }
  const alignStr = String(alignment).toLowerCase();
  const typeStr = String(cardData.inGameType || cardData.Type || "").toLowerCase();

  if (alignStr.includes("good") || typeStr.includes("hero") || typeStr === "ge") {
    return "GOOD";
  }
  if (alignStr.includes("evil") || typeStr.includes("evil character") || typeStr === "ee") {
    return "EVIL";
  }
  return "NEUTRAL";
}
