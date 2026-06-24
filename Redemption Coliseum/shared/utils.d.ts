export declare function hash(str: string): number;
export declare function generateCardId(imageFile: string | undefined, set: string | undefined, name: string | undefined): string;

export interface CardSide {
  Name: string;
  Type: string;
  Alignment: string;
  Brigade: string[];
  Class: string[];
  Strength: string;
  Toughness: string;
  SpecialAbility: string;
}

export interface NormalizedCard {
  id: string;
  Set: string;
  ImageFile: string;
  OfficialSet: string;
  Identifier: string;
  Rarity: string;
  Reference: string;
  Legality: string;
  Testament: string;
  IsToken: boolean;
  IsCharacter: boolean;
  IsEnhancement: boolean;
  IsGospel: boolean;
  Name: string;
  SpecialAbility: string;
  Alignment: string[];
  Type: string[];
  Brigade: string[];
  Class: string[];
  Strength: string;
  Toughness: string;
  sides: CardSide[];
  ORDIR?: string[];
}

export declare function normalizeCard(card: any): NormalizedCard;

