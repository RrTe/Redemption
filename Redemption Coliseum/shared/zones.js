/**
 * Definiert die Zonen eines Spiels.
 * Dies stellt sicher, dass Client und Server dieselben Zonenbezeichner verwenden.
 */
export const ZONES = /** @type {const} */ ({
  DECK: "deck",
  HAND: "hand",
  DISCARD: "discard",
  RESERVE: "reserve",
  BANISH: "banish",
  SET_ASIDE: "set_aside",
  ARTIFACT: "artifact",
  TERRITORY: "territory",
  LAND_OF_BONDAGE: "land_of_bondage",
  LAND_OF_REDEMPTION: "land_of_redemption",
  BATTLEFIELD: "battlefield", // ✨ NEU
});

/**
 * Ein Array mit allen Zonen-Namen.
 */
export const ALL_ZONES = Object.values(ZONES);

/**
 * Ein Array mit allen Zonen, die als Drop-Zonen fungieren.
 */
export const DROP_ZONE_NAMES = [
  ZONES.TERRITORY,
  ZONES.HAND,
  ZONES.DISCARD,
  ZONES.LAND_OF_BONDAGE,
  ZONES.BATTLEFIELD, // ✨ NEU
];

/**
 * Ein Array mit allen Zonen, die als "private" Stapel gelten.
 */
export const PILE_ZONES = [ZONES.DECK, ZONES.DISCARD, ZONES.RESERVE, ZONES.BANISH];

/**
 * ✨ DEIN PLAN: Zonen, deren Inhalt grundsätzlich für alle Spieler verdeckt ist (Deck, Reserve).
 */
export const CONCEALED_ZONES = [ZONES.DECK, ZONES.RESERVE];

/**
 * ✨ DEIN PLAN: Zonen, deren Inhalt grundsätzlich für alle Spieler offen sichtbar ist.
 */
export const PUBLIC_ZONES = [
  ZONES.DISCARD,
  ZONES.BANISH,
  ZONES.TERRITORY,
  ZONES.LAND_OF_BONDAGE,
  ZONES.LAND_OF_REDEMPTION,
  ZONES.BATTLEFIELD, // ✨ NEU
];
