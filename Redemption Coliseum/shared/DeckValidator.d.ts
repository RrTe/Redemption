import { type DeckValidationFormatRules } from "./deck-validation-rules";

export interface ValidationPropertyResult {
  current: number;
  min?: number;
  max?: number | null;
  maxAllowed?: number;
  minRequired?: number;
  isValid: boolean;
  hasDisallowedTypes?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  deckSize: ValidationPropertyResult;
  reserveSize: ValidationPropertyResult;
  dominants: ValidationPropertyResult;
  lostSouls: ValidationPropertyResult;
}

export class DeckValidator {
  /**
   * Retrieves the rules for a given format ID.
   */
  static getRules(formatId?: string | null): DeckValidationFormatRules["rules"] | null;

  /**
   * Validates a deck and reserve list against the specified format rules.
   */
  static validate(
    deckInput: any[],
    reserveInput: any[],
    formatId?: string | null
  ): ValidationResult;

  /**
   * Generates human-readable rule violation messages from a validation result object.
   */
  static getRuleViolationMessages(result: ValidationResult): string[];
}
