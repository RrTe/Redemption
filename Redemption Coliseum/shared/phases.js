/**
 * Definiert die Phasen eines Spielzugs.
 * Dies stellt sicher, dass Client und Server dieselben Phasenbezeichner verwenden.
 */
export const PHASES = /** @type {const} */ ({
  DRAW: "draw",
  UPKEEP: "upkeep",
  PREP: "prep",
  BATTLE: "battle",
  DISCARD: "discard",
});

/**
 * Sub-steps during the coordinated Draw Phase resolution.
 */
export const DRAW_STEPS = /** @type {const} */ ({
  NONE: "none",
  ACTIVE_STARS: "active_stars",
  OPPONENT_STARS: "opponent_stars",
  ACTIVE_SOULS: "active_souls",
  OPPONENT_SOULS: "opponent_souls",
  COMPLETED: "completed",
});

