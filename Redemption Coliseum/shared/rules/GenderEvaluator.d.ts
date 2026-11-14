export interface GenderResolutionOptions {
  side?: "top" | "bottom" | "shared";
  targetDef?: Record<string, any>;
}

export declare class GenderEvaluator {
  static resolveCardGender(card: any, options?: GenderResolutionOptions): string | null;
  static matchesGenderValue(entityGender: string | null | undefined, requiredGender: string | null | undefined): boolean;
  static matchesGender(card: any, requiredGender: string | null | undefined, context?: GenderResolutionOptions): boolean;
  static matchesOppositeGender(targetCard: any, referenceCard?: any, context?: GenderResolutionOptions): boolean;
}
