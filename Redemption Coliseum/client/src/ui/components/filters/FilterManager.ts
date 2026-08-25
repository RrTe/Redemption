import { type FilterDefinition, type FilterRule } from "./FilterTypes";

/**
 * Manages the active state of filters and applies filter logic to cards.
 */
export class FilterManager {
  private filters: FilterDefinition[] = [];
  private activeFilters: Map<string, boolean> = new Map();
  private filterText: string = "";

  /**
   * Constructs a new FilterManager instance.
   * @param configData The loaded filter configuration JSON.
   */
  constructor(configData: { filters: FilterDefinition[] }) {
    this.filters = configData.filters;
    this.filters.forEach((f) => {
      this.activeFilters.set(f.id, f.activeByDefault ?? false);
    });
  }

  /**
   * Returns all filters.
   */
  public getFilters(): FilterDefinition[] {
    return this.filters;
  }

  /**
   * Returns filters belonging to a specific category.
   * @param category The category to select.
   */
  public getFiltersByCategory(category: string): FilterDefinition[] {
    return this.filters.filter((f) => f.category === category);
  }

  /**
   * Sets a filter's active state.
   * @param id The filter's unique identifier.
   * @param active True if active, false otherwise.
   */
  public setFilterActive(id: string, active: boolean) {
    this.activeFilters.set(id, active);
  }

  /**
   * Gets a filter's active state.
   * @param id The filter's unique identifier.
   */
  public isFilterActive(id: string): boolean {
    return this.activeFilters.get(id) ?? false;
  }

  /**
   * Sets the text search query.
   * @param text The search string.
   */
  public setFilterText(text: string) {
    this.filterText = text;
  }

  /**
   * Gets the text search query.
   */
  public getFilterText(): string {
    return this.filterText;
  }

  /**
   * Counts how many filters in a category (or globally) are active.
   * @param category Optional category to filter.
   */
  public hasActiveFiltersCount(category?: string): number {
    let count = 0;
    this.activeFilters.forEach((active, id) => {
      if (active) {
        const filter = this.filters.find((f) => f.id === id);
        if (!category || (filter && filter.category === category)) {
          count++;
        }
      }
    });
    return count;
  }

  /**
   * Evaluates if a card matches the currently active filters and search query.
   * @param card The card data to check.
   */
  public evaluateCard(card: any): boolean {
    const isAndRelation = this.isFilterActive("AndFilter");

    // 1. Evaluate Symbol and Brigade Filters
    const activeSymbolsAndBrigades = this.filters.filter(
      (f) => (f.category === "symbol" || f.category === "brigade") && f.id !== "AndFilter" && this.isFilterActive(f.id)
    );

    if (activeSymbolsAndBrigades.length > 0) {
      if (isAndRelation) {
        // AND relation: all active filters must match
        for (const filter of activeSymbolsAndBrigades) {
          if (!this.evaluateFilter(card, filter)) {
            return false;
          }
        }
      } else {
        // OR relation: at least one active filter must match
        let matchAny = false;
        for (const filter of activeSymbolsAndBrigades) {
          if (this.evaluateFilter(card, filter)) {
            matchAny = true;
            break;
          }
        }
        if (!matchAny) {
          return false;
        }
      }
    }

    // 2. Evaluate Text Search Filters (OR relationship between active text filters)
    const activeTextFilters = this.filters.filter(
      (f) => f.category === "text" && this.isFilterActive(f.id)
    );

    if (this.filterText && this.filterText.trim() !== "" && activeTextFilters.length > 0) {
      let textMatch = false;
      for (const filter of activeTextFilters) {
        if (this.evaluateFilter(card, filter, this.filterText)) {
          textMatch = true;
          break;
        }
      }
      if (!textMatch) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a single filter's rules against a card.
   * @param card The card data to check.
   * @param filter The filter definition.
   * @param query Optional search query.
   */
  public evaluateFilter(card: any, filter: FilterDefinition, query?: string): boolean {
    if (!filter.rules || filter.rules.length === 0) {
      return true;
    }

    // If the card has multiple sides, check if ANY side matches the entire filter!
    if (card.sides && card.sides.length > 0) {
      return card.sides.some((side: any) => {
        const sideCard = { ...card, ...side };
        return this.evaluateFilterSingle(sideCard, filter, query);
      });
    }

    return this.evaluateFilterSingle(card, filter, query);
  }

  private evaluateFilterSingle(card: any, filter: FilterDefinition, query?: string): boolean {
    const relation = filter.relation ?? "AND";
    const results = filter.rules.map((rule) => this.evaluateRule(card, rule, query));

    if (relation === "OR") {
      return results.some((r) => r);
    }
    return results.every((r) => r);
  }

  /**
   * Evaluates a single filter rule.
   * @param card The card object to inspect.
   * @param rule The rule definition to match.
   * @param query Optional search query text.
   * @returns True if the rule conditions are met, false otherwise.
   */
  private evaluateRule(card: any, rule: FilterRule, query?: string): boolean {
    const rawVal = card[rule.field];

    switch (rule.operator) {
      case "equals":
      case "includes_any": {
        const cardValues = this.extractNormalizedValues(rawVal);
        return rule.values?.some((val) => cardValues.some((cv) => cv === val)) ?? false;
      }

      case "contains_text": {
        if (!query) return false;
        const textVal = Array.isArray(rawVal) ? rawVal.join(" ") : String(rawVal || "");
        return textVal.toLowerCase().includes(query.toLowerCase());
      }

      default:
        return false;
    }
  }

  /**
   * Extracts normalized value tokens from a card property value.
   * Handles pre-split arrays as well as strings delimited by '/', ',', parentheses, or 'and'.
   * @param rawVal The raw property value.
   * @returns An array of trimmed, non-empty string tokens.
   */
  private extractNormalizedValues(rawVal: any): string[] {
    if (rawVal == null) return [];
    const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
    const result: string[] = [];

    for (const item of arr) {
      if (typeof item === "string") {
        item
          .split(/[\/,\(\)]|\s+and\s+/i)
          .map((s) => s.trim())
          .filter((s) => s !== "")
          .forEach((s) => result.push(s));
      } else if (item != null) {
        result.push(String(item));
      }
    }

    return result;
  }
}
