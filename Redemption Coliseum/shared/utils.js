/**
 * Generiert einen eindeutigen Hash-Code für einen String (z.B. Kartennamen).
 * Dieser Algorithmus muss im DeckEditor und im Spiel identisch sein.
 */
export function hash(str) {
  return str
    .normalize("NFC")
    .split("")
    .reduce((prev, curr) => (Math.imul(31, prev) + curr.charCodeAt(0)) | 0, 0);
}

/**
 * Generates a consistent, unique card ID from its image, set, and name.
 * Used as the single source of truth for card IDs on both client and server.
 * 
 * @param {string} imageFile 
 * @param {string} set 
 * @param {string} name 
 * @returns {string} The card ID hash as a string
 */
export function generateCardId(imageFile, set, name) {
  const key = (imageFile || "") + (set || "") + (name || "");
  return String(hash(key));
}

/**
 * Normalizes a raw card from the database to ensure flat field backward compatibility,
 * attaches fully resolved CardSide objects, and generates a consistent card ID.
 * 
 * @param {object} card The raw card object from JSON database.
 * @returns {object} The normalized card object.
 */
export function normalizeCard(card) {
  const shared = (card.CardSides && card.CardSides.shared) || {};
  const top = (card.CardSides && card.CardSides.top) || {};
  const bottom = card.CardSides && card.CardSides.bottom;

  const sides = [];

  // 1. Process top side
  const topSide = {
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
    const bottomSide = {
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

  const name = topSide.Name;
  const imageFile = card.ImageFile || "";
  const set = card.Set || "";
  const id = generateCardId(imageFile, set, name);

  return {
    id,
    Set: set,
    ImageFile: imageFile,
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
    Name: name,
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
