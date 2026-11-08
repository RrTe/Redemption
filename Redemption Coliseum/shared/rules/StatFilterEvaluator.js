/**
 * @module shared/rules/StatFilterEvaluator
 * Evaluator for structured StatFilter definitions in card AST TargetSelectors
 * adhering to Redemption REG v11.0.0 guidelines and AST specification.
 */
const { BattleCalculator } = require("../BattleCalculator");
const { ZONES } = require("../zones");
const {
  AST_STAT_FILTER_STATS,
  AST_STAT_FILTER_OPERATORS,
} = require("../astConstants");

/**
 * Pure service for resolving and evaluating structured stat filters on cards.
 */
class StatFilterEvaluator {
  /**
   * Evaluates an array of stat_filters against a target card in a given context.
   * Conjunction rule (Logical AND): all filters must evaluate to true.
   *
   * @param {object} card Card instance to evaluate.
   * @param {Array<object>} [statFilters=[]] List of StatFilter objects from AST.
   * @param {object} [context={}] Runtime evaluation context for dynamic variables.
   * @returns {boolean} True if all filters are fulfilled or if statFilters is empty.
   */
  static matchesStatFilters(card, statFilters = [], context = {}) {
    if (!card) return false;
    if (!Array.isArray(statFilters) || statFilters.length === 0) {
      return true;
    }

    for (let i = 0; i < statFilters.length; i++) {
      if (!this.matchesSingleFilter(card, statFilters[i], context)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a single StatFilter object against a card.
   *
   * @param {object} card Card instance.
   * @param {object} filter Single StatFilter object with stat, operator, value or variable.
   * @param {object} [context={}] Runtime evaluation context.
   * @returns {boolean} True if the card satisfies the single filter condition.
   */
  static matchesSingleFilter(card, filter, context = {}) {
    if (!filter || typeof filter !== "object") return true;

    const threshold = this.resolveThreshold(filter, context);
    if (threshold === null || threshold === undefined || isNaN(threshold)) {
      return false;
    }

    const { strength, toughness } = this.getCardStats(card);
    const op = filter.operator || AST_STAT_FILTER_OPERATORS.GTE;
    const stat = String(filter.stat || "").trim().toLowerCase();

    switch (stat) {
      case AST_STAT_FILTER_STATS.STRENGTH:
        return this.compare(strength, op, threshold);
      case AST_STAT_FILTER_STATS.TOUGHNESS:
        return this.compare(toughness, op, threshold);
      case AST_STAT_FILTER_STATS.BOTH:
        return this.compare(strength, op, threshold) && this.compare(toughness, op, threshold);
      case AST_STAT_FILTER_STATS.EITHER:
        return this.compare(strength, op, threshold) || this.compare(toughness, op, threshold);
      default:
        return false;
    }
  }

  /**
   * Resolves a static number or dynamic variable threshold to an integer or float.
   *
   * @param {object} filter Filter object containing value or variable.
   * @param {object} [context={}] Context object supplying dynamic variables (e.g. context.variables.X).
   * @returns {number|null} Resolved threshold value, or null if unresolved.
   */
  static resolveThreshold(filter, context = {}) {
    if (!filter) return null;

    // 1. Static numeric threshold
    if (typeof filter.value === "number") {
      return filter.value;
    }
    if (typeof filter.value === "string" && filter.value.trim() !== "" && !isNaN(Number(filter.value))) {
      return Number(filter.value);
    }

    // 2. Dynamic variable threshold (e.g. "X")
    if (typeof filter.variable === "string" && filter.variable.trim() !== "") {
      const varKey = filter.variable.trim();
      const lookupContainers = [
        context?.variables,
        context?.vars,
        context?.dynamicValues,
        context,
      ];

      for (const container of lookupContainers) {
        if (!container || typeof container !== "object") continue;
        const rawVal = container[varKey];
        if (typeof rawVal === "number") {
          return rawVal;
        }
        if (typeof rawVal === "string" && rawVal.trim() !== "" && !isNaN(Number(rawVal))) {
          return Number(rawVal);
        }
      }
    }

    return null;
  }

  /**
   * Computes current effective strength and toughness for a card, accounting
   * for dual-card active side, repository defaults, and dynamic counter modifiers.
   *
   * @param {object} card Card instance.
   * @returns {{ strength: number, toughness: number }} Effective card stats.
   */
  static getCardStats(card) {
    if (!card) return { strength: 0, toughness: 0 };

    let rawStr = card.Strength;
    let rawTough = card.Toughness;

    // Dual-sided card in play: use active side stats if specified
    const isInPlay = card.zone === ZONES.BATTLEFIELD || card.zone === ZONES.TERRITORY;
    if (isInPlay && Array.isArray(card.sides) && card.sides.length > 1) {
      const activeSideIndex = (card.inGameAlignment || "").toLowerCase().includes("evil") ? 1 : 0;
      const side = card.sides[activeSideIndex];
      if (side) {
        if (side.Strength !== undefined && side.Strength !== null && side.Strength !== "") rawStr = side.Strength;
        if (side.Toughness !== undefined && side.Toughness !== null && side.Toughness !== "") rawTough = side.Toughness;
      }
    }

    // Fallback to CardRepository if base stats are missing on runtime instance
    if ((rawStr === undefined || rawStr === null || rawStr === "" || rawTough === undefined || rawTough === null || rawTough === "") && card.templateId) {
      try {
        const { CardRepository } = require("../CardRepository");
        const dbCard = typeof CardRepository.getById === "function"
          ? CardRepository.getById(card.templateId)
          : CardRepository.get(card.templateId);
        if (dbCard) {
          if (rawStr === undefined || rawStr === null || rawStr === "") rawStr = dbCard.Strength;
          if (rawTough === undefined || rawTough === null || rawTough === "") rawTough = dbCard.Toughness;
        }
      } catch (_e) { }
    }

    const baseStr = BattleCalculator.parseStat(rawStr);
    const baseTough = BattleCalculator.parseStat(rawTough);
    const modStr = BattleCalculator.getCounterModifier(card, "strength");
    const modTough = BattleCalculator.getCounterModifier(card, "toughness");

    return {
      strength: baseStr + modStr,
      toughness: baseTough + modTough,
    };
  }

  /**
   * Evaluates a relational comparison between an actual stat and a threshold value.
   *
   * @param {number} actual The card's effective stat value.
   * @param {string} operator Relational operator (">=", "<=", "==", ">", "<", "!=").
   * @param {number} threshold Target threshold to compare against.
   * @returns {boolean} True if the relational comparison holds.
   */
  static compare(actual, operator, threshold) {
    switch (operator) {
      case AST_STAT_FILTER_OPERATORS.LTE:
        return actual <= threshold;
      case AST_STAT_FILTER_OPERATORS.GTE:
        return actual >= threshold;
      case AST_STAT_FILTER_OPERATORS.EQ:
      case "===":
        return actual === threshold;
      case AST_STAT_FILTER_OPERATORS.GT:
        return actual > threshold;
      case AST_STAT_FILTER_OPERATORS.LT:
        return actual < threshold;
      case AST_STAT_FILTER_OPERATORS.NEQ:
      case "!==":
        return actual !== threshold;
      default:
        return actual >= threshold;
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { StatFilterEvaluator };
}

