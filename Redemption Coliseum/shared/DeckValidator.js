/**
 * @module shared/DeckValidator
 * Provides shared deck validation logic for client and server.
 */

import { DECK_VALIDATION_RULES } from "./deck-validation-rules.js";

/**
 * Normalizes deck input lists (either raw card definitions or DeckEntry structures)
 * into a uniform array of { card, quantity }.
 * 
 * @param {Array} input 
 * @returns {Array<{card: Object, quantity: Number}>}
 */
function normalizeDeckInput(input) {
  if (!Array.isArray(input)) return [];
  return input.map(item => {
    if (item && item.card) {
      return { card: item.card, quantity: item.quantity || 1 };
    } else {
      return { card: item, quantity: 1 };
    }
  });
}

/**
 * Checks if a card matches the specified card type (handles string and array type properties).
 * 
 * @param {Object} card 
 * @param {String} type 
 * @returns {Boolean}
 */
function isCardType(card, type) {
  if (!card || !card.Type) return false;
  if (Array.isArray(card.Type)) {
    return card.Type.includes(type);
  }
  return typeof card.Type === 'string' && card.Type.includes(type);
}

/**
 * Calculates the minimum required Lost Souls based on deck size and format formula.
 * 
 * @param {Number} deckSize 
 * @param {Object} formula 
 * @returns {Number}
 */
function getMinRequiredLostSouls(deckSize, formula) {
  if (!formula) return 0;
  const extraCards = Math.max(deckSize - formula.baseDeckSize, 0);
  const steps = Math.floor(extraCards / formula.cardsPerAdditionalSoul);
  return formula.baseLostSouls + steps * formula.additionalSoulsPerStep;
}

export class DeckValidator {
  /**
   * Retrieves the rules for a given format ID.
   * 
   * @param {String} [formatId] 
   * @returns {Object|null}
   */
  static getRules(formatId) {
    const format = formatId || DECK_VALIDATION_RULES.defaultFormat;
    const formatConfig = DECK_VALIDATION_RULES.formats[format];
    return formatConfig ? formatConfig.rules : null;
  }

  /**
   * Validates a deck and reserve list against the specified format rules.
   * 
   * @param {Array} deckInput 
   * @param {Array} reserveInput 
   * @param {String} [formatId] 
   * @returns {Object} Validation results
   */
  static validate(deckInput, reserveInput, formatId = null) {
    const rules = this.getRules(formatId);
    if (!rules) {
      throw new Error(`Format rules not found for format ID: ${formatId}`);
    }

    const normalizedDeck = normalizeDeckInput(deckInput);
    const normalizedReserve = normalizeDeckInput(reserveInput);

    let numDeck = 0;
    let numDoms = 0;
    let numSouls = 0;

    normalizedDeck.forEach(entry => {
      numDeck += entry.quantity;
      if (isCardType(entry.card, "Dominant")) {
        numDoms += entry.quantity;
      }
      if (isCardType(entry.card, "Lost Soul")) {
        numSouls += entry.quantity;
      }
    });

    let numReserve = 0;
    normalizedReserve.forEach(entry => {
      numReserve += entry.quantity;
    });

    // 1. Deck size validation
    const deckMin = rules.deck.minCards;
    const deckMax = rules.deck.maxCards;
    const isDeckSizeValid = numDeck >= deckMin && (deckMax === null || numDeck <= deckMax);

    // 2. Reserve size validation
    const reserveMin = rules.reserve.minCards;
    const reserveMax = rules.reserve.maxCards;
    const isReserveSizeValid = numReserve >= reserveMin && (reserveMax === null || numReserve <= reserveMax);

    // 2b. Reserve disallowed types validation
    const disallowedTypes = rules.reserve.disallowedTypes || [];
    let hasDisallowedInReserve = false;
    normalizedReserve.forEach(entry => {
      disallowedTypes.forEach(type => {
        if (isCardType(entry.card, type)) {
          hasDisallowedInReserve = true;
        }
      });
    });
    const isReserveTypesValid = !hasDisallowedInReserve;

    // 3. Dominants limit validation (ratio or max total)
    const maxRatio = rules.cardTypeLimits.dominant.maxRatioToLostSouls;
    const maxDomsAllowed = Math.floor(numSouls * maxRatio);
    const areDominantsValid = numDoms <= maxDomsAllowed;

    // 4. Lost souls formula validation
    const formula = rules.cardTypeLimits.lostSoul.formula;
    const minRequiredSouls = getMinRequiredLostSouls(numDeck, formula);
    const areLostSoulsValid = numSouls >= minRequiredSouls;

    const isValid = isDeckSizeValid && isReserveSizeValid && isReserveTypesValid && areDominantsValid && areLostSoulsValid;

    return {
      isValid,
      deckSize: {
        current: numDeck,
        min: deckMin,
        max: deckMax,
        isValid: isDeckSizeValid
      },
      reserveSize: {
        current: numReserve,
        min: reserveMin,
        max: reserveMax,
        isValid: isReserveSizeValid && isReserveTypesValid,
        hasDisallowedTypes: hasDisallowedInReserve
      },
      dominants: {
        current: numDoms,
        maxAllowed: maxDomsAllowed,
        isValid: areDominantsValid
      },
      lostSouls: {
        current: numSouls,
        minRequired: minRequiredSouls,
        isValid: areLostSoulsValid
      }
    };
  }

  /**
   * Generates human-readable rule violation messages from a validation result object.
   * 
   * @param {Object} result The object returned by DeckValidator.validate
   * @returns {Array<String>} List of violation message strings
   */
  static getRuleViolationMessages(result) {
    if (!result || result.isValid) return [];
    const messages = [];

    if (result.deckSize && !result.deckSize.isValid) {
      const { current, min, max } = result.deckSize;
      if (current < min) {
        messages.push(`Deck size: ${current} cards (minimum ${min} required)`);
      } else if (max !== null && current > max) {
        messages.push(`Deck size: ${current} cards (maximum ${max} allowed)`);
      }
    }

    if (result.reserveSize && !result.reserveSize.isValid) {
      const { current, min, max, hasDisallowedTypes } = result.reserveSize;
      if (current < min) {
        messages.push(`Reserve size: ${current} cards (minimum ${min} required)`);
      } else if (max !== null && current > max) {
        messages.push(`Reserve size: ${current} cards (maximum ${max} allowed)`);
      }
      if (hasDisallowedTypes) {
        messages.push("Reserve contains disallowed card types (Dominant or Lost Soul)");
      }
    }

    if (result.dominants && !result.dominants.isValid) {
      messages.push(`Dominants: ${result.dominants.current} (maximum ${result.dominants.maxAllowed} allowed)`);
    }

    if (result.lostSouls && !result.lostSouls.isValid) {
      messages.push(`Lost Souls: ${result.lostSouls.current} (minimum ${result.lostSouls.minRequired} required)`);
    }

    return messages;
  }
}
