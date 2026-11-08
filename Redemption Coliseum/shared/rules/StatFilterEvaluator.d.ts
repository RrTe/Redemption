import { StatFilter, AstStatFilterOperator } from "../astConstants";

export interface CardStats {
  strength: number;
  toughness: number;
}

export declare class StatFilterEvaluator {
  /**
   * Evaluates an array of stat_filters against a target card in a given context.
   * Conjunction rule (Logical AND): all filters must evaluate to true.
   *
   * @param card Card instance to evaluate.
   * @param statFilters List of StatFilter objects from AST.
   * @param context Runtime evaluation context for dynamic variables.
   * @returns True if all filters are fulfilled or if statFilters is empty.
   */
  static matchesStatFilters(card: any, statFilters?: StatFilter[] | null, context?: any): boolean;

  /**
   * Evaluates a single StatFilter object against a card.
   *
   * @param card Card instance.
   * @param filter Single StatFilter object with stat, operator, value or variable.
   * @param context Runtime evaluation context.
   * @returns True if the card satisfies the single filter condition.
   */
  static matchesSingleFilter(card: any, filter: StatFilter, context?: any): boolean;

  /**
   * Resolves a static number or dynamic variable threshold to an integer or float.
   *
   * @param filter Filter object containing value or variable.
   * @param context Context object supplying dynamic variables.
   * @returns Resolved threshold value, or null if unresolved.
   */
  static resolveThreshold(filter: StatFilter, context?: any): number | null;

  /**
   * Computes current effective strength and toughness for a card, accounting
   * for dual-card active side, repository defaults, and dynamic counter modifiers.
   *
   * @param card Card instance.
   * @returns Effective card stats.
   */
  static getCardStats(card: any): CardStats;

  /**
   * Evaluates a relational comparison between an actual stat and a threshold value.
   *
   * @param actual The card's effective stat value.
   * @param operator Relational operator.
   * @param threshold Target threshold to compare against.
   * @returns True if the relational comparison holds.
   */
  static compare(actual: number, operator: AstStatFilterOperator | string, threshold: number): boolean;
}

