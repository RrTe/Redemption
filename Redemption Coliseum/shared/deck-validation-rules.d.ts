export interface DeckValidationFormatRules {
  displayName: string;
  rules: {
    deck: {
      minCards: number;
      maxCards: number | null;
      maxCopiesPerCard: number;
    };
    reserve: {
      minCards: number;
      maxCards: number;
      maxCopiesPerCard: number;
      disallowedTypes?: string[];
    };
    cardTypeLimits: {
      dominant: {
        maxRatioToLostSouls: number;
        maxTotal: number | null;
      };
      lostSoul: {
        formula: {
          baseDeckSize: number;
          baseLostSouls: number;
          cardsPerAdditionalSoul: number;
          additionalSoulsPerStep: number;
        };
      };
    };
  };
}

export interface DeckValidationConfig {
  defaultFormat: string;
  formats: {
    [formatId: string]: DeckValidationFormatRules;
  };
}

export const DECK_VALIDATION_RULES: DeckValidationConfig;
