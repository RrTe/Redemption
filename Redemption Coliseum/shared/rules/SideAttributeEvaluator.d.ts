export declare const CANONICAL_CLASSES: string[];

export declare class SideAttributeEvaluator {
  static lookupDbCard(card: any): any | null;
  static normalizeClassList(rawClasses: string | string[] | undefined | null): string[];
  static hasRuntimeSide(card: any, context?: { side?: string }): boolean;
  static extractSides(card: any): any[];
  static sidesFromCardSidesMap(cardSides: any, card: any): any[];
  static sidesFromAstMap(astSides: any, card: any): any[];
  static sideMatchesTargetMeta(side: any, targetDef?: any, requireCharacter?: boolean): boolean;
  static resolveIsGeneric(card: any, options?: { side?: string }): boolean | null;
  static resolveIsHuman(card: any, options?: { side?: string }): boolean | null;
  static matchesIsGeneric(card: any, requiredIsGeneric: boolean | null | undefined, context?: any): boolean;
  static matchesIsHuman(card: any, requiredIsHuman: boolean | null | undefined, context?: any): boolean;
  static resolveClasses(card: any, options?: { side?: string }): string[];
  static matchesClasses(card: any, requiredClasses: string[] | undefined | null, context?: any): boolean;
}
