const { AST_SELECTION_MODES } = require("../../../shared/astConstants");

/**
 * Checks whether a value represents the unbounded "all" keyword.
 * @param {unknown} value
 * @returns {boolean}
 */
function isAllKeyword(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "all";
}

/**
 * Parses an AST target's selection mode and count definition into normalized bounds.
 * Supports REG v11.1.0 dynamic counts (min_value / max_value) and fixed_value: "all".
 * @param {Object} [targetDef={}]
 * @param {number|Object|string} [overrideCount]
 * @returns {{
 *   isAll: boolean,
 *   hasCustomMin: boolean,
 *   hasCustomMax: boolean,
 *   minValue: number|undefined,
 *   maxValue: number|undefined,
 *   fixedValue: number|string|undefined,
 *   count: number,
 *   finiteCount: number,
 *   minCount: number,
 *   maxCount: number,
 *   isPlural: boolean,
 *   isSingleTarget: boolean,
 *   displayCount: number|string
 * }}
 */
function parseTargetCount(targetDef = {}, overrideCount = undefined) {
  const safeTarget = targetDef || {};
  const rawCount = overrideCount !== undefined ? overrideCount : safeTarget.count;
  const countObj = rawCount && typeof rawCount === "object" ? rawCount : null;

  const hasCustomMin = Boolean(countObj && typeof countObj.min_value === "number");
  const hasCustomMax = Boolean(countObj && typeof countObj.max_value === "number");
  const hasFixedNumber = Boolean(countObj && typeof countObj.fixed_value === "number");
  const hasNumericShorthand = typeof rawCount === "number";

  const isAll = Boolean(
    safeTarget.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL ||
      safeTarget.all === true ||
      isAllKeyword(rawCount) ||
      isAllKeyword(countObj?.fixed_value) ||
      isAllKeyword(countObj?.max_value)
  );

  const finiteCount = hasNumericShorthand
    ? rawCount
    : hasFixedNumber
      ? countObj.fixed_value
      : hasCustomMax
        ? countObj.max_value
        : 1;

  const count = isAll ? Infinity : finiteCount;
  const minCount = hasCustomMin ? countObj.min_value : count;
  const maxCount = count;
  const isPlural = isAll || maxCount > 1;
  const isSingleTarget =
    !isAll &&
    finiteCount === 1 &&
    (!hasCustomMin || countObj.min_value !== 0);

  return {
    isAll,
    hasCustomMin,
    hasCustomMax,
    minValue: countObj?.min_value,
    maxValue: countObj?.max_value,
    fixedValue: countObj?.fixed_value,
    count,
    finiteCount,
    minCount,
    maxCount,
    isPlural,
    isSingleTarget,
    displayCount: isAll ? "all" : finiteCount,
  };
}

module.exports = {
  isAllKeyword,
  parseTargetCount,
};
