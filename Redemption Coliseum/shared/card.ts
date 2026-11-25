export interface CardData {
  Name: string;
  Set: string;
  ImageFile: string;
  OfficialSet: string;
  Type: string;
  Brigade: string;
  Strength: string;
  Toughness: string;
  Class: string;
  Identifier: string;
  Gender?: string;
  IsGeneric?: boolean | null;
  IsHuman?: boolean | null;
  SpecialAbility: string;
  Rarity: string;
  Reference: string;
  Sound: string;
  Alignment: string;
  Legality: string;
  Id?: string;
  IsCharacter: boolean;
  IsEnhancement: boolean;
  IsGospel: boolean;
  IsStarCard?: boolean;
  IsCloud?: boolean;
  IsMeek?: boolean;
  Testament: string;
  CardSides?: {
    shared?: any;
    top?: any;
    bottom?: any;
  };
  sides?: any[];
}