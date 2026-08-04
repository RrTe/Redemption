import type { DeckData } from "../utils/DeckUtils";

export interface DeckStats {
  wins: { full: number; partial: number };
  losses: { full: number; partial: number };
  ties: number;
}

export interface DeckMetadata {
  id: string; // UUID
  name: string;
  lastModified: number;
  cardCount: {
    main: number;
    reserve: number;
  };
  formatVersion: string;
  format: string; // To be derived from an external configuration file later
  isValid: boolean; // Evaluated by centralized validation logic (using current DeckEditor logic for now)
  validationErrors?: string[];
  brigades: string[];
  cardIds: string[];
  visuals: {
    heroCharacterCardId: string | null;
    evilCharacterCardId: string | null;
    fallbackGraphic: string;
  };
  stats: DeckStats;
}

export interface WrappedDeck {
  meta: DeckMetadata;
  deckData: DeckData; // Existing format: { main: string[], reserve: string[] }
}
