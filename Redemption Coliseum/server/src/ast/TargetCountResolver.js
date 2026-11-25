const { AST_SELECTION_MODES } = require("../../../shared/astConstants");
const { DynamicValueResolver } = require("./DynamicValueResolver");

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
 * Supports REG v11.1.0 dynamic counts (min_value / max_value / count.dynamic) and fixed_value: "all".
 *
 * @param {Object} [targetDef={}]
 * @param {number|Object|string} [overrideCount]
 * @param {Object|null} [context=null] Optional execution context for resolving `count.dynamic`.
 * @returns {{
 *   isAll: boolean,
 *   hasCustomMin: boolean,
 *   hasCustomMax: boolean,
 *   hasDynamic: boolean,
 *   dynamicSpec: Object|null,
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
function parseTargetCount(targetDef = {}, overrideCount = undefined, context = null) {
  const safeTarget = targetDef || {};
  const rawCount = overrideCount !== undefined ? overrideCount : safeTarget.count;
  const countObj = rawCount && typeof rawCount === "object" ? rawCount : null;

  const hasCustomMin = Boolean(countObj && typeof countObj.min_value === "number");
  const hasCustomMax = Boolean(countObj && typeof countObj.max_value === "number");
  const hasFixedNumber = Boolean(countObj && typeof countObj.fixed_value === "number");
  const hasNumericShorthand = typeof rawCount === "number";
  const dynamicSpec = countObj?.dynamic && typeof countObj.dynamic === "object" ? countObj.dynamic : null;
  const hasDynamic = Boolean(dynamicSpec);

  const isAll = Boolean(
    !hasDynamic && (
      safeTarget.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL ||
        safeTarget.all === true ||
        isAllKeyword(rawCount) ||
        isAllKeyword(countObj?.fixed_value) ||
        isAllKeyword(countObj?.max_value)
    )
  );

  const resolvedDynamicCount = hasDynamic && context
    ? DynamicValueResolver.resolveDynamicCount(dynamicSpec, context)
    : null;

  const finiteCount = hasNumericShorthand
    ? rawCount
    : hasFixedNumber
      ? countObj.fixed_value
      : hasCustomMax
        ? countObj.max_value
        : resolvedDynamicCount !== null
          ? resolvedDynamicCount
          : (hasDynamic && typeof dynamicSpec.limit === "number" ? dynamicSpec.limit : 1);

  const count = isAll ? Infinity : finiteCount;
  const minCount = hasCustomMin ? countObj.min_value : count;
  const maxCount = count;
  const isPlural = isAll || maxCount > 1 || (hasDynamic && dynamicSpec.offset === -1);
  const isSingleTarget =
    !isAll &&
    !hasDynamic &&
    finiteCount === 1 &&
    (!hasCustomMin || countObj.min_value !== 0);

  let displayCount = isAll ? "all" : finiteCount;
  if (hasDynamic && resolvedDynamicCount === null) {
    displayCount = dynamicSpec.offset === -1 ? "all but 1" : "X";
  }

  return {
    isAll,
    hasCustomMin,
    hasCustomMax,
    hasDynamic,
    dynamicSpec,
    minValue: countObj?.min_value,
    maxValue: countObj?.max_value,
    fixedValue: countObj?.fixed_value,
    count,
    finiteCount,
    minCount,
    maxCount,
    isPlural,
    isSingleTarget,
    displayCount,
  };
}

module.exports = {
  isAllKeyword,
  parseTargetCount,
};
