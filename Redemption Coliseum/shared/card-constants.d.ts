/**
 * @module shared/card-constants
 * Definiert Konstanten für Karteneigenschaften, die von Client und Server geteilt werden.
 */

import {
  CARD_TYPES as CardTypeJS,
  MANAGED_TERRITORY_TYPES as ManagedTerritoryTypesJs,
  ALIGNMENTS as AlignmentsJS,
} from "./card-constants.js";
export const CARD_TYPES: typeof CardTypeJS;
export type CardType = (typeof CARD_TYPES)[keyof typeof CARD_TYPES];
export const ALIGNMENTS: typeof AlignmentsJS;

export const MANAGED_TERRITORY_TYPES: typeof ManagedTerritoryTypesJs;
