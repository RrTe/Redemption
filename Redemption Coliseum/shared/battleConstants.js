/**
 * @module shared/battleConstants
 * Constants for the battle engine, initiative evaluation, and HUD visual states.
 */

export const BATTLE_STATE_REASON = /** @type {const} */ ({
  NO_BATTLE: "NO_BATTLE",                 // Outside battle phase or empty battlefield before attack
  UNBLOCKED: "UNBLOCKED",                 // Hero attacks, 0 blockers present (initial or blocker removed)
  BLOCKER_UNOPPOSED: "BLOCKER_UNOPPOSED", // Blocker in battle, 0 heroes present (all heroes removed)
  RESCUER_UNOPPOSED: "RESCUER_UNOPPOSED", // Hero in battle, blocker was defeated/removed (rescue attempt successful)
  LOSING_NUMBERS: "LOSING_NUMBERS",       // Both sides have characters; losing side holds regular initiative
  STALEMATE: "STALEMATE",                 // Both sides have characters; neither reaches toughness -> non-last-card player holds initiative
  MUTUAL_DESTRUCTION: "MUTUAL_DESTRUCTION",// Both sides have characters; both reach toughness -> non-last-card player holds initiative
});

export const BATTLE_HUD_CONFIG = /** @type {const} */ ({
  BADGE_WIDTH: 115,
  BADGE_HEIGHT: 36,
  INITIATIVE_WIDTH: 350,
  INITIATIVE_HEIGHT: 34,
  SLOT_GAP: 8,
  PANEL_PADDING: 6,
  BORDER_RADIUS: 8,
  RESCUER_COLOR: 0xd4af37, // Gold accent for Rescuer
  BLOCKER_COLOR: 0x9b59b6, // Amethyst / Purple-Crimson accent for Blocker
  GOLD_HEX: "#ffd700",
  BLOCKER_HEX: "#c084fc",
  INITIATIVE_GLOW_COLOR: 0x00ffff, // Cyan glow for player holding initiative
  STALEMATE_COLOR: 0xe67e22, // Amber / Orange for Stalemate
  MUTUAL_COLOR: 0xe74c3c, // Ruby red for Mutual Destruction
  BACKGROUND_COLOR: 0x0a0e17,
  BACKGROUND_ALPHA: 0.88,
  STROKE_WIDTH: 2,
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BATTLE_STATE_REASON,
    BATTLE_HUD_CONFIG,
  };
}
