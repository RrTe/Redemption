// server/scripts/auditAst.js
const fs = require("fs");
const path = require("path");
const { AstEffectRunner } = require("../src/ast/AstEffectRunner");

const ROOT_DIR = path.resolve(__dirname, "../..");
const CARDS_LOGIC_PATH = path.join(ROOT_DIR, "shared", "cards_logic.json");
const AST_CONSTANTS_PATH = path.join(ROOT_DIR, "shared", "ast_constants.json");
const CONDITION_EVALUATOR_PATH = path.join(__dirname, "../src/ast/ConditionEvaluator.js");

/**
 * Safely reads and parses a JSON file.
 *
 * @param {string} filePath Absolute JSON file path.
 * @returns {any} Parsed JSON value.
 */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[auditAst] Failed to read ${filePath}:`, err.message);
    process.exit(1);
  }
}

/**
 * Extracts implemented switch case identifiers from ConditionEvaluator.js dynamically.
 *
 * @returns {Set<string>} Set of implemented condition_type names.
 */
function readImplementedConditions() {
  try {
    const source = fs.readFileSync(CONDITION_EVALUATOR_PATH, "utf8");
    const switchStart = source.indexOf("switch (condition_type)");
    const slice = switchStart >= 0 ? source.slice(switchStart) : source;
    const matches = slice.matchAll(/case\s+["']([^"']+)["']\s*:/g);
    const implemented = new Set();
    for (const m of matches) {
      implemented.add(m[1]);
    }
    return implemented;
  } catch (err) {
    console.warn(`[auditAst] Could not inspect ConditionEvaluator.js: ${err.message}`);
    return new Set();
  }
}

/**
 * Parses CLI options (--card, --action, --condition, --limit).
 *
 * @param {string[]} argv Raw CLI arguments.
 * @returns {{ card: string|null, action: string|null, condition: string|null, limit: number }}
 */
function parseArgs(argv) {
  const opts = { card: null, action: null, condition: null, limit: 10 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--card" && argv[i + 1]) opts.card = argv[++i];
    else if (arg.startsWith("--card=")) opts.card = arg.slice(7);
    else if (arg === "--action" && argv[i + 1]) opts.action = argv[++i];
    else if (arg.startsWith("--action=")) opts.action = arg.slice(9);
    else if (arg === "--condition" && argv[i + 1]) opts.condition = argv[++i];
    else if (arg.startsWith("--condition=")) opts.condition = arg.slice(12);
    else if (arg === "--limit" && argv[i + 1]) opts.limit = Math.max(1, Number(argv[++i]) || 10);
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, Number(arg.slice(8)) || 10);
  }
  return opts;
}

/**
 * Increments a frequency counter in a plain object.
 *
 * @param {Record<string, number>} map Target counter map.
 * @param {string} key Bucket key.
 */
function inc(map, key) {
  const k = key || "(missing)";
  map[k] = (map[k] || 0) + 1;
}

/**
 * Sorts counter entries descending by frequency.
 *
 * @param {Record<string, number>} map Frequency map.
 * @returns {Array<[string, number]>}
 */
function sortDesc(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/**
 * Iterates all abilities across all sides of every card in cards_logic.json.
 *
 * @param {Record<string, any>} cardsLogic Parsed cards_logic dictionary.
 * @param {(card: any, sideName: string, ability: any) => void} visitor Callback per ability.
 */
function visitAbilities(cardsLogic, visitor) {
  for (const card of Object.values(cardsLogic)) {
    for (const [sideName, side] of Object.entries(card.sides || {})) {
      for (const ability of side?.abilities || []) {
        visitor(card, sideName, ability);
      }
    }
  }
}

/**
 * Prints matching card entries for --card lookup.
 *
 * @param {Record<string, any>} cardsLogic Parsed cards_logic dictionary.
 * @param {string} query Exact card_id or case-insensitive card_name substring.
 * @param {number} limit Maximum results.
 */
function printCardLookup(cardsLogic, query, limit) {
  const q = query.trim().toLowerCase();
  const exact = cardsLogic[query.trim()];
  const matches = exact
    ? [exact]
    : Object.values(cardsLogic).filter((c) => (c.card_name || "").toLowerCase().includes(q));
  console.log(JSON.stringify(matches.slice(0, Math.min(limit, 5)), null, 2));
}

/**
 * Prints sample occurrences for a specific --action or --condition query.
 *
 * @param {Record<string, any>} cardsLogic Parsed cards_logic dictionary.
 * @param {{ action: string|null, condition: string|null, limit: number }} opts CLI options.
 */
function printFilteredExamples(cardsLogic, opts) {
  const hits = [];
  const variantSignatures = new Set();
  let totalMatches = 0;

  visitAbilities(cardsLogic, (card, sideName, ability) => {
    const effects = ability.effects || [];
    if (opts.action) {
      for (const eff of effects) {
        if (eff.action === opts.action) {
          totalMatches++;
          if (hits.length < opts.limit) {
            hits.push({
              card_id: card.card_id,
              card_name: card.card_name,
              side: sideName,
              ability_id: ability.ability_id,
              effect: eff,
            });
          }
        }
      }
    }
    if (opts.condition) {
      const conds = [
        ...(ability.conditions || []),
        ...effects.flatMap((e) => e.conditions || []),
      ];
      for (const cond of conds) {
        if (cond.condition_type === opts.condition) {
          totalMatches++;
          variantSignatures.add(
            JSON.stringify({
              operator: cond.operator ?? null,
              valueType: typeof cond.value,
              valueSample: cond.value ?? null,
              hasSelector: Boolean(cond.selector),
            })
          );
          if (hits.length < opts.limit) {
            hits.push({
              card_id: card.card_id,
              card_name: card.card_name,
              side: sideName,
              ability_id: ability.ability_id,
              condition: cond,
            });
          }
        }
      }
    }
  });

  console.log(JSON.stringify({
    filter: opts.action ? { action: opts.action } : { condition: opts.condition },
    totalMatches,
    variants: [...variantSignatures].map((s) => JSON.parse(s)),
    samples: hits,
  }, null, 2));
}

/**
 * Prints a compact live coverage summary across cards_logic.json, ast_constants.json, and server AST modules.
 *
 * @param {Record<string, any>} cardsLogic Parsed cards_logic dictionary.
 * @param {any} astConstants Parsed ast_constants.json schema.
 * @param {number} limit Max unsupported actions to list.
 */
function printSummary(cardsLogic, astConstants, limit) {
  const implementedConditions = readImplementedConditions();
  const knownActions = new Set(astConstants.action_verbs || []);
  const knownConditions = new Set([...(astConstants.condition_types || []), "phase_check"]);

  let totalAbilities = 0;
  let multiEffectAbilities = 0;
  const actionCounts = {};
  const conditionCounts = {};
  const dependencyCounts = {};
  const selectionModeCounts = {};
  const unknownSchemaActions = new Set();
  const unknownSchemaConditions = new Set();

  visitAbilities(cardsLogic, (_card, _sideName, ability) => {
    totalAbilities++;
    const effects = ability.effects || [];
    if (effects.length > 1) multiEffectAbilities++;

    for (const cond of ability.conditions || []) {
      const t = cond?.condition_type;
      inc(conditionCounts, t);
      if (t && !knownConditions.has(t)) unknownSchemaConditions.add(t);
    }

    for (const eff of effects) {
      inc(actionCounts, eff.action);
      if (eff.action && !knownActions.has(eff.action)) unknownSchemaActions.add(eff.action);
      if (eff.dependency) inc(dependencyCounts, eff.dependency);
      if (eff.target?.selection_mode) inc(selectionModeCounts, eff.target.selection_mode);
      for (const cond of eff.conditions || []) {
        const t = cond?.condition_type;
        inc(conditionCounts, t);
        if (t && !knownConditions.has(t)) unknownSchemaConditions.add(t);
      }
    }
  });

  const supportedActions = [];
  const unsupportedActions = [];
  for (const [action, count] of sortDesc(actionCounts)) {
    if (AstEffectRunner.isActionSupported(action)) supportedActions.push([action, count]);
    else unsupportedActions.push([action, count]);
  }

  const conditions = sortDesc(conditionCounts).map(([type, count]) => ({
    type,
    count,
    implemented: implementedConditions.has(type),
  }));

  console.log(JSON.stringify({
    cards: Object.keys(cardsLogic).length,
    abilities: totalAbilities,
    multiEffectAbilities,
    supportedActionCount: supportedActions.length,
    unsupportedActionCount: unsupportedActions.length,
    supportedActions,
    unsupportedActionsTop: unsupportedActions.slice(0, limit),
    conditions,
    dependencies: sortDesc(dependencyCounts),
    selectionModes: sortDesc(selectionModeCounts),
    schemaDrift: {
      actionsNotInAstConstants: [...unknownSchemaActions],
      conditionsNotInAstConstants: [...unknownSchemaConditions],
    },
  }, null, 2));
}

/**
 * Entry point for AST audit script.
 */
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cardsLogic = readJson(CARDS_LOGIC_PATH);
  const astConstants = readJson(AST_CONSTANTS_PATH);

  if (opts.card) {
    printCardLookup(cardsLogic, opts.card, opts.limit);
    return;
  }
  if (opts.action || opts.condition) {
    printFilteredExamples(cardsLogic, opts);
    return;
  }
  printSummary(cardsLogic, astConstants, opts.limit);
}

main();
