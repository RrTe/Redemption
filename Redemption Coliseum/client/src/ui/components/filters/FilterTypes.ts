export type FilterOperator = "equals" | "includes_any" | "contains_text";
export type FilterCategory = "symbol" | "brigade" | "text";

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  values?: string[];
}

export interface FilterDefinition {
  id: string;
  category: FilterCategory;
  label: string;
  iconPath?: string;
  iconSelectedPath?: string;
  iconSmallPath?: string;
  rules: FilterRule[];
  relation?: "AND" | "OR";
  activeByDefault?: boolean;
}
