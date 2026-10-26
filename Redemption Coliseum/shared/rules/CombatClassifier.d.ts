export class CombatClassifier {
  static isDominant(card: any): boolean;
  static isGoodEnhancement(card: any): boolean;
  static isEvilEnhancement(card: any): boolean;
  static isHero(card: any): boolean;
  static isEvilCharacter(card: any): boolean;
  static getBrigades(card: any): string[];
  static canEnhancementMatchCharacter(enhancementCard: any, characterCard: any): boolean;
}
