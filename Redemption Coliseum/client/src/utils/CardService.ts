import cardDataRaw from "../../../shared/cards_extended_with_ordir_fuzzy.json";

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

/**
 * Normalizes a raw card from the database to ensure flat field backward compatibility
 * and attaches fully resolved CardSide objects.
 *
 * Args:
 *   card: The raw card object from JSON.
 * Returns:
 *   The fully normalized card object.
 */
export function normalizeCard(card: any): NormalizedCard {
  const shared = card.CardSides?.shared || {};
  const top = card.CardSides?.top || {};
  const bottom = card.CardSides?.bottom;

  const sides: CardSide[] = [];

  // 1. Process top side
  const topSide: CardSide = {
    Name: top.Name || shared.Name || card.Name || "",
    Type: top.Type || shared.Type || card.Type || "",
    Alignment: top.Alignment || shared.Alignment || card.Alignment || "Good",
    Brigade: top.Brigades || shared.Brigades || [],
    Class: top.Classes || shared.Classes || [],
    Strength: String(top.Strength !== undefined && top.Strength !== null ? top.Strength : (shared.Strength !== undefined && shared.Strength !== null ? shared.Strength : (card.Strength || ""))),
    Toughness: String(top.Toughness !== undefined && top.Toughness !== null ? top.Toughness : (shared.Toughness !== undefined && shared.Toughness !== null ? shared.Toughness : (card.Toughness || ""))),
    SpecialAbility: top.SpecialAbility || shared.SpecialAbility || card.SpecialAbility || ""
  };
  sides.push(topSide);

  // 2. Process bottom side if present
  if (bottom) {
    const bottomSide: CardSide = {
      Name: bottom.Name || shared.Name || card.Name || "",
      Type: bottom.Type || shared.Type || card.Type || "",
      Alignment: bottom.Alignment || shared.Alignment || card.Alignment || "Evil",
      Brigade: bottom.Brigades || shared.Brigades || [],
      Class: bottom.Classes || shared.Classes || [],
      Strength: String(bottom.Strength !== undefined && bottom.Strength !== null ? bottom.Strength : (shared.Strength !== undefined && shared.Strength !== null ? shared.Strength : (card.Strength || ""))),
      Toughness: String(bottom.Toughness !== undefined && bottom.Toughness !== null ? bottom.Toughness : (shared.Toughness !== undefined && shared.Toughness !== null ? shared.Toughness : (card.Toughness || ""))),
      SpecialAbility: bottom.SpecialAbility || shared.SpecialAbility || card.SpecialAbility || ""
    };
    sides.push(bottomSide);
  }

  // 3. Construct the normalized flat backward-compatible wrapper
  const allAlignments = Array.from(new Set(sides.map(s => s.Alignment).filter(Boolean)));
  const allTypes = Array.from(new Set(sides.map(s => s.Type).filter(Boolean)));
  const allBrigades = Array.from(new Set(sides.flatMap(s => s.Brigade).filter(Boolean)));
  const allClasses = Array.from(new Set(sides.flatMap(s => s.Class).filter(Boolean)));

  return {
    Set: card.Set || "",
    ImageFile: card.ImageFile || "",
    OfficialSet: card.OfficialSet || "",
    Identifier: card.Identifier || "",
    Rarity: card.Rarity || "",
    Reference: card.Reference || "",
    Legality: card.Legality || "",
    Testament: card.Testament || "",
    IsToken: !!card.IsToken,
    IsCharacter: !!card.IsCharacter,
    IsEnhancement: !!card.IsEnhancement,
    IsGospel: !!card.IsGospel,
    Name: topSide.Name,
    SpecialAbility: topSide.SpecialAbility,
    Alignment: allAlignments,
    Type: allTypes,
    Brigade: allBrigades,
    Class: allClasses,
    Strength: topSide.Strength,
    Toughness: topSide.Toughness,
    sides,
    ORDIR: card.ORDIR
  };
}

export const cardData = {
  cards: cardDataRaw.cards.map((c: any) => normalizeCard(c))
};
