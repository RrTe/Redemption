export interface RuleValidationResult {
  valid: boolean;
  error?: string;
}

export interface RuleContext {
  card?: any;
  effectiveCard?: any;
  fromZone?: string;
  toZone?: string;
  state?: any;
  targetPlayerId?: string;
  cardControllerId?: string;
  isArena?: boolean;
  options?: {
    isUndo?: boolean;
    isAbilityAction?: boolean;
    inGameType?: string;
    inGameAlignment?: string;
    [key: string]: any;
  };
}

export type RuleFunction = (ctx: RuleContext) => RuleValidationResult;

export class CombatRules {
  static isDominant(card: any): boolean;
  static isGoodEnhancement(card: any): boolean;
  static isEvilEnhancement(card: any): boolean;
  static isHero(card: any): boolean;
  static isEvilCharacter(card: any): boolean;
  static getBrigades(card: any): string[];
  static canEnhancementMatchCharacter(enhancementCard: any, characterCard: any): boolean;

  static specialInitiativeRule(ctx: RuleContext): RuleValidationResult;
  static chronicleLockRule(ctx: RuleContext): RuleValidationResult;
  static phaseLockRule(ctx: RuleContext): RuleValidationResult;
  static conditionGuardRule(ctx: RuleContext): RuleValidationResult;
  static alignmentRoleRule(ctx: RuleContext): RuleValidationResult;
  static blockerGateRule(ctx: RuleContext): RuleValidationResult;
  static brigadeMatchRule(ctx: RuleContext): RuleValidationResult;
  static initiativeRule(ctx: RuleContext): RuleValidationResult;

  static validate(ctx: RuleContext): RuleValidationResult;
}

export const PhaseLockRule: RuleFunction;
export const SpecialInitiativeRule: RuleFunction;
export const ChronicleLockRule: RuleFunction;
export const ConditionGuardRule: RuleFunction;
export const AlignmentRoleRule: RuleFunction;
export const BlockerGateRule: RuleFunction;
export const BrigadeMatchRule: RuleFunction;
export const InitiativeRule: RuleFunction;
