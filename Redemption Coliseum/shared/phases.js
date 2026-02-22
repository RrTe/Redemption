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
