/**
 * @module shared/rules/SelectorComposer
 * Pure composition utilities for TargetSelector nodes and `any_of` disjunctive branches.
 */

const INHERITABLE_SCALAR_KEYS = [
  "selection_mode",
  "zone_owner",
  "target_type",
  "alignment",
  "testament",
  "gender",
  "is_generic",
  "is_human",
  "is_cloud",
  "is_meek",
  "is_star",
  "is_gospel",
  "exclude_self",
  "used_by",
  "targets_abilities",
  "count",
  "action",
  "ref_step",
  "prompt_text",
  "can_cancel",
];

const INHERITABLE_ARRAY_KEYS = [
  "scope",
  "brigades",
  "classes",
  "references",
  "identifiers",
  "card_titles",
  "target_card_ids",
  "stat_filters",
  "state_filters",
  "relative_filters",
  "ability_target_actions",
  "exclude_ability_actions",
];

/**
 * Pure helper for merging and expanding `any_of` branches on AST TargetSelectors.
 */
class SelectorComposer {
  /**
   * Merges a single `any_of` branch onto its parent TargetSelector context.
   * Branch-defined properties override inherited parent defaults; parent-level
   * `exclude` is intentionally left to top-level evaluation so it applies once.
   *
   * @param {object} [parentSelector={}] Parent TargetSelector.
   * @param {object} [branch={}] Branch filter overrides.
   * @returns {object} Effective merged TargetSelector for the branch.
   */
  static mergeBranch(parentSelector = {}, branch = {}) {
    const parent = parentSelector && typeof parentSelector === "object" ? parentSelector : {};
    const b = branch && typeof branch === "object" ? branch : {};
    const merged = {};

    for (const key of INHERITABLE_SCALAR_KEYS) {
      if (b[key] !== undefined && b[key] !== null) {
        merged[key] = b[key];
      } else if (parent[key] !== undefined && parent[key] !== null) {
        merged[key] = parent[key];
      }
    }

    for (const key of INHERITABLE_ARRAY_KEYS) {
      if (Array.isArray(b[key])) {
        merged[key] = [...b[key]];
      } else if (Array.isArray(parent[key]) && parent[key].length > 0) {
        merged[key] = [...parent[key]];
      } else {
        merged[key] = [];
      }
    }

    if (b.exclude && typeof b.exclude === "object") {
      merged.exclude = b.exclude;
    }

    merged.any_of = Array.isArray(b.any_of) ? b.any_of : [];
    return merged;
  }

  /**
   * Expands a TargetSelector into merged branch selectors (or `[selector]` when no `any_of` exists).
   *
   * @param {object} [selector={}] AST TargetSelector.
   * @returns {Array<object>} Effective selectors to evaluate disjunctively.
   */
  static expandBranches(selector = {}) {
    if (!selector || typeof selector !== "object") return [{}];
    if (Array.isArray(selector.any_of) && selector.any_of.length > 0) {
      return selector.any_of.map((branch) => this.mergeBranch(selector, branch));
    }
    return [selector];
  }

  /**
   * Collects the deduplicated union of scope strings across a selector and its `any_of` branches.
   *
   * @param {object} [selector={}] AST TargetSelector.
   * @param {string} [defaultScope="in_play"] Fallback scope when none is set.
   * @returns {string[]} Deduplicated normalized scope list.
   */
  static collectEffectiveScopes(selector = {}, defaultScope = "in_play") {
    const branches = this.expandBranches(selector);
    const scopes = new Set();

    for (const branch of branches) {
      const raw = branch.scope !== undefined ? branch.scope : selector?.scope;
      if (Array.isArray(raw) && raw.length > 0) {
        for (const s of raw) {
          const norm = String(s || "").trim().toLowerCase();
          if (norm) scopes.add(norm);
        }
      } else if (typeof raw === "string" && raw.trim()) {
        scopes.add(raw.trim().toLowerCase());
      } else if (defaultScope) {
        scopes.add(defaultScope);
      }
    }

    return Array.from(scopes);
  }

  /**
   * Resolves the unified zone_owner covering a selector and all of its `any_of` branches
   * for zone scanning (e.g. returns `"either"` if branches mix `"controller"` and `"opponent"`).
   *
   * @param {object} [selector={}] AST TargetSelector.
   * @returns {string} Effective scanning zone_owner.
   */
  static resolveScanZoneOwner(selector = {}) {
    const branches = this.expandBranches(selector);
    const owners = new Set();

    for (const branch of branches) {
      const owner = String(branch.zone_owner || selector?.zone_owner || "either").toLowerCase().trim();
      if (owner) owners.add(owner);
    }

    if (owners.size === 0) return "either";
    if (owners.has("either") || owners.has("both") || owners.has("target_player") || owners.size > 1) {
      return "either";
    }
    return Array.from(owners)[0];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SelectorComposer };
}
