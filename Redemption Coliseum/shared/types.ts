import { type ArraySchema, type MapSchema } from "@colyseus/schema";
import type { CardData } from "./card";
import type { Zone } from "./zones";
import type { CardAction } from "./actionSchema";

export interface CardState extends CardData {
  id: string;
  controllerId: string; // ✨ HIER IST DIE KORREKTUR
  originalOwnerId: string; // ✨ HIER IST DIE KORREKTUR
  zone: Zone;
  x: number;
  y: number;
  lastMoved: number;
  isTapped: boolean;
  isFaceDown: boolean;
  isFaceUp: boolean; // ✨ FIX: Hinzugefügt, da es im Server-Schema existiert
  isFlipped: boolean;
  isToken: boolean; // ✨ NEU: Kennzeichnet temporäre Token-Karten
  notes: string;
  counters: MapSchema<number>;
  attachedTo: string | null; // ✨ NEU: ID der Karte, an die diese Karte angehängt ist
  inGameType: string;
  inGameAlignment: string;
  availableActions: ArraySchema<CardAction>; // ✨ NEU: Liste der erlaubten Aktionen für diese Karte
  toJSON(): any; // ✨ KORREKTUR: Füge die toJSON-Methode hinzu, die von Colyseus-Objekten bereitgestellt wird.
}

export interface SearchContextState {
  zone: Zone;
  cards: ArraySchema<CardState>;
}

export interface PlayerState {
  sessionId: string;
  redeemedSouls: number;
  turn: number;
  name: string; // ✨ FIX: Fehlende Eigenschaft ergänzt
  deckName: string; // ✨ FIX: Fehlende Eigenschaft ergänzt
  deck: ArraySchema<CardState>;
  hand: ArraySchema<CardState>;
  discard: ArraySchema<CardState>;
  reserve: ArraySchema<CardState>;
  land_of_redemption: ArraySchema<CardState>;
  banish: ArraySchema<CardState>;
  territory: ArraySchema<CardState>;
  land_of_bondage: ArraySchema<CardState>;
  status: "playing" | "searching";
  connected: boolean; // ✨ NEU: Verbindungsstatus
  ready: boolean; // ✨ NEU: Gibt an, ob der Spieler die Ladeszene abgeschlossen hat
  searchContext: SearchContextState;
}

export interface RoomState {
  players: MapSchema<PlayerState>;
  activePlayer: string;
  currentPhase: string;
  revealedCards: ArraySchema<CardState>;
  revealedSelectedCardIds: ArraySchema<string>;
  actionTakerId: string; // General flag for who is taking an action
  activeActionPiles: MapSchema<string>; // ✨ REFACTOR: pileId -> sessionId
  battlefield: ArraySchema<CardState>;
}
