// shared/cardHierarchy.d.ts

export interface CardHierarchyData {
  card_types: string[];
  type_groups: Record<string, string[]>;
  type_is_a: Record<string, string[]>;
}

export declare const cardHierarchy: CardHierarchyData;

/**
 * Expands a target group name into its constituent base types.
 *
 * @param groupName Target group name (e.g. "character", "enhancement", "city").
 * @returns List of base card types belonging to the group, or empty array.
 */
export declare function expandTypeGroup(groupName: string): string[];

/**
 * Evaluates whether a card type matches a target type according to REG taxonomy.
 *
 * @param cardTypes Single card type or list of card types.
 * @param targetType Canonical AST target type string.
 * @returns True if the card type satisfies the target requirement.
 */
export declare function matchesCardType(cardTypes: string | string[], targetType: string): boolean;

/**
 * Checks whether a target type string represents a known base card type or group.
 *
 * @param targetType Canonical AST target type string.
 * @returns True if targetType is a recognized base card type in the taxonomy.
 */
export declare function isBaseCardType(targetType: string): boolean;

/**
 * Evaluates whether a card satisfies a subtype, descriptor, classification, or identifier filter.
 *
 * @param card Card instance or card data object.
 * @param subtype Subtype / descriptor to test (e.g. "animal", "priest", "giant").
 * @returns True if the card possesses the subtype or identifier.
 */
export declare function matchesCardSubtype(card: any, subtype: string): boolean;

/**
 * Checks whether a card satisfies a target_type requirement.
 * Handles canonical base card types (Hero, Evil Character, etc.) via matchesCardType,
 * and character subtypes / descriptors (animal, priest, warrior, etc.) via matchesCardSubtype.
 *
 * @param card Card instance or card definition.
 * @param targetType Target type from AST (e.g. "animal", "hero", "priest").
 * @param activeType Active card type(s) if known.
 * @returns True if card satisfies the target type.
 */
export declare function matchesTargetType(card: any, targetType: string, activeType?: string | string[]): boolean;


