import {
  ZONES as ZonesJs,
  ALL_ZONES as AllZonesJs,
  DROP_ZONE_NAMES as DropZoneNamesJs,
  PILE_ZONES as PileZonesJs,
  CONCEALED_ZONES as ConcealedZonesJs,
  PUBLIC_ZONES as PublicZonesJs,
} from "./zones.js";

export const ZONES: typeof ZonesJs;

export type ZONES_TYPE = typeof ZonesJs;

export type Zone = ZONES_TYPE[keyof ZONES_TYPE];

export const ALL_ZONES: typeof AllZonesJs;

export const DROP_ZONE_NAMES: typeof DropZoneNamesJs;

export const PILE_ZONES: typeof PileZonesJs;

export const CONCEALED_ZONES: typeof ConcealedZonesJs;

export const PUBLIC_ZONES: typeof PublicZonesJs;
