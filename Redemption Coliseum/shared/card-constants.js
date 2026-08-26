/**
 * @module shared/card-constants
 * Definiert Konstanten für Karteneigenschaften, die von Client und Server geteilt werden.
 */

/**
 * Definiert die Kartentypen als Konstanten.
 * @readonly
 */
export const CARD_TYPES = /** @type {const} */ ({
  HERO: "Hero",
  EC: "Evil Character",
  FORTRESS: "Fortress",
  SITE: "Site",
  ARTIFACT: "Artifact",
  LOST_SOUL: "Lost Soul",
  DOMINANT: "Dominant",
  GE: "GE",
  EE: "EE",
  // Weitere Typen hier hinzufügen, wenn sie bekannt werden
});

/**
 * Definiert die Gesinnungen als Konstanten.
 * @readonly
 */
export const ALIGNMENTS = /** @type {const} */ ({
  GOOD: "Good",
  EVIL: "Evil",
});

/**
 * Definiert die Kartentypen, die im Territorium automatisch sortiert und angeordnet werden.
 * Alle anderen Typen werden als "frei platzierbar" behandelt.
 */
export const MANAGED_TERRITORY_TYPES = [
  CARD_TYPES.HERO,
  CARD_TYPES.FORTRESS,
  CARD_TYPES.SITE,
  CARD_TYPES.EC,
  CARD_TYPES.ARTIFACT,
];

/**
 * Maximal erlaubte Anzahl an Handkarten.
 * @readonly
 */
export const MAX_HAND_SIZE = 16;

