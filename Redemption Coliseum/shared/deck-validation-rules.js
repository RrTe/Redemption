/**
 * @module shared/deck-validation-rules
 * Defines deck validation rules for different game formats.
 */

export const DECK_VALIDATION_RULES = {
  defaultFormat: "type_1",
  formats: {
    type_1: {
      displayName: "Type 1",
      shortName: "T1",
      rules: {
        deck: {
          minCards: 50,
          maxCards: 154,
          maxCopiesPerCard: 1
        },
        reserve: {
          minCards: 0,
          maxCards: 10,
          maxCopiesPerCard: 1,
          disallowedTypes: ["Dominant", "Lost Soul"]
        },
        cardTypeLimits: {
          dominant: {
            maxRatioToLostSouls: 1.0,
            maxTotal: null
          },
          lostSoul: {
            formula: {
              baseDeckSize: 50,
              baseLostSouls: 7,
              cardsPerAdditionalSoul: 7,
              additionalSoulsPerStep: 1
            }
          }
        }
      }
    }
  }
};
