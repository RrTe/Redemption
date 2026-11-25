import { CARD_GENDERS } from "./astConstants.js";

const CHARACTER_SIDE_TYPES = new Set([
  "hero",
  "evil character",
  "character",
  "hero token",
  "evil character token",
  "dac",
]);
const VALID_CARD_GENDERS = new Set(Object.values(CARD_GENDERS));

/**
 * Resolves normalized Gender for a single card side when that side is a character type.
 *
 * @param {object} sideObj Concrete side object (`top` or `bottom`).
 * @param {object} sharedObj Shared side defaults (`CardSides.shared`).
 * @param {object|null} fallbackCard Optional top-level card fallback (for single-sided mocks).
 * @param {string} sideType Resolved type of this side.
 * @returns {string} Valid lowercase gender or empty string.
 */
function resolveSideGender(sideObj, sharedObj, fallbackCard, sideType) {
  const typeNorm = String(sideType || "").trim().toLowerCase();
  if (typeNorm && !CHARACTER_SIDE_TYPES.has(typeNorm)) {
    return "";
  }
  const raw =
    sideObj?.Gender ??
    sideObj?.gender ??
    sharedObj?.Gender ??
    sharedObj?.gender ??
    fallbackCard?.Gender ??
    fallbackCard?.gender ??
    "";
  const norm = String(raw || "").trim().toLowerCase();
  return VALID_CARD_GENDERS.has(norm) ? norm : "";
}

/**
 * Resolves a character-only boolean attribute (IsGeneric / IsHuman) for one card side.
 * Returns null for non-character side types or when unset.
 *
 * @param {object} sideObj Concrete side object (`top` or `bottom`).
 * @param {object} sharedObj Shared side defaults (`CardSides.shared`).
 * @param {object|null} fallbackCard Optional top-level card fallback (single-sided mocks).
 * @param {string} sideType Resolved type of this side.
 * @param {string} pascalKey PascalCase property key (e.g. "IsGeneric").
 * @param {string} snakeKey snake_case property key (e.g. "is_generic").
 * @returns {boolean|null} Boolean attribute value or null for non-character/unset sides.
 */
function resolveSideBooleanAttr(sideObj, sharedObj, fallbackCard, sideType, pascalKey, snakeKey) {
  const typeNorm = String(sideType || "").trim().toLowerCase();
  if (typeNorm && !CHARACTER_SIDE_TYPES.has(typeNorm)) {
    return null;
  }
  return resolveSideGeneralBooleanAttr(sideObj, sharedObj, fallbackCard, pascalKey, snakeKey);
}

/**
 * Resolves a side-level boolean attribute across all card types (e.g. IsCloud, IsMeek, IsGospel, IsStarCard).
 *
 * @param {object} sideObj Concrete side object (`top` or `bottom`).
 * @param {object} sharedObj Shared side defaults (`CardSides.shared`).
 * @param {object|null} fallbackCard Optional top-level card fallback.
 * @param {string} pascalKey PascalCase property key.
 * @param {string} snakeKey snake_case property key.
 * @returns {boolean|null} Boolean attribute value or null if unset.
 */
function resolveSideGeneralBooleanAttr(sideObj, sharedObj, fallbackCard, pascalKey, snakeKey) {
  const raw =
    sideObj?.[pascalKey] ??
    sideObj?.[snakeKey] ??
    sharedObj?.[pascalKey] ??
    sharedObj?.[snakeKey] ??
    fallbackCard?.[pascalKey] ??
    fallbackCard?.[snakeKey];
  return typeof raw === "boolean" ? raw : null;
}

/**
 * Resolves an unambiguous top-level value across normalized card sides.
 *
 * @param {Array<object>} sides Normalized side objects.
 * @param {string} key Boolean side field name.
 * @returns {boolean|null} Shared boolean value or null when ambiguous/unset.
 */
function resolveTopLevelBooleanAttr(sides, key) {
  if (!Array.isArray(sides) || sides.length === 0) return null;
  if (sides.length === 1) {
    return typeof sides[0][key] === "boolean" ? sides[0][key] : null;
  }
  const first = sides[0][key];
  if (typeof first !== "boolean") return null;
  return sides.every((s) => s[key] === first) ? first : null;
}

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
  const topType = top.Type || shared.Type || card.Type || "";
  const topSide = {
    Name: top.Name || shared.Name || card.Name || "",
    Type: topType,
    Alignment: top.Alignment || shared.Alignment || card.Alignment || "Good",
    Brigade: top.Brigades || shared.Brigades || [],
    Class: top.Classes || shared.Classes || [],
    Strength: String(top.Strength !== undefined && top.Strength !== null ? top.Strength : (shared.Strength !== undefined && shared.Strength !== null ? shared.Strength : (card.Strength || ""))),
    Toughness: String(top.Toughness !== undefined && top.Toughness !== null ? top.Toughness : (shared.Toughness !== undefined && shared.Toughness !== null ? shared.Toughness : (card.Toughness || ""))),
    SpecialAbility: top.SpecialAbility || shared.SpecialAbility || card.SpecialAbility || "",
    Identifier: top.Identifier || shared.Identifier || card.Identifier || "",
    Gender: resolveSideGender(top, shared, card, topType),
    IsGeneric: resolveSideBooleanAttr(top, shared, card, topType, "IsGeneric", "is_generic"),
    IsHuman: resolveSideBooleanAttr(top, shared, card, topType, "IsHuman", "is_human"),
    IsCloud: resolveSideGeneralBooleanAttr(top, shared, card, "IsCloud", "is_cloud"),
    IsMeek: resolveSideGeneralBooleanAttr(top, shared, card, "IsMeek", "is_meek"),
    IsGospel: resolveSideGeneralBooleanAttr(top, shared, card, "IsGospel", "is_gospel"),
    IsStarCard: resolveSideGeneralBooleanAttr(top, shared, card, "IsStarCard", "is_star"),
    ORDIR: top.ORDIR || card.ORDIR || []
  };
  sides.push(topSide);

  // 2. Process bottom side if present
  if (bottom) {
    const bottomType = bottom.Type || shared.Type || card.Type || "";
    const bottomSide = {
      Name: bottom.Name || shared.Name || card.Name || "",
      Type: bottomType,
      Alignment: bottom.Alignment || shared.Alignment || card.Alignment || "Evil",
      Brigade: bottom.Brigades || shared.Brigades || [],
      Class: bottom.Classes || shared.Classes || [],
      Strength: String(bottom.Strength !== undefined && bottom.Strength !== null ? bottom.Strength : (shared.Strength !== undefined && shared.Strength !== null ? shared.Strength : (card.Strength || ""))),
      Toughness: String(bottom.Toughness !== undefined && bottom.Toughness !== null ? bottom.Toughness : (shared.Toughness !== undefined && bottom.Toughness !== null ? shared.Toughness : (card.Toughness || ""))),
      SpecialAbility: bottom.SpecialAbility || shared.SpecialAbility || card.SpecialAbility || "",
      Identifier: bottom.Identifier || shared.Identifier || card.Identifier || "",
      Gender: resolveSideGender(bottom, shared, null, bottomType),
      IsGeneric: resolveSideBooleanAttr(bottom, shared, null, bottomType, "IsGeneric", "is_generic"),
      IsHuman: resolveSideBooleanAttr(bottom, shared, null, bottomType, "IsHuman", "is_human"),
      IsCloud: resolveSideGeneralBooleanAttr(bottom, shared, null, "IsCloud", "is_cloud"),
      IsMeek: resolveSideGeneralBooleanAttr(bottom, shared, null, "IsMeek", "is_meek"),
      IsGospel: resolveSideGeneralBooleanAttr(bottom, shared, null, "IsGospel", "is_gospel"),
      IsStarCard: resolveSideGeneralBooleanAttr(bottom, shared, null, "IsStarCard", "is_star"),
      ORDIR: bottom.ORDIR || card.ORDIR || []
    };
    sides.push(bottomSide);
  }

  // 3. Construct the normalized flat backward-compatible wrapper
  const allAlignments = Array.from(new Set(sides.map(s => s.Alignment).filter(Boolean)));
  const allTypes = Array.from(new Set(sides.map(s => s.Type).filter(Boolean)));
  const allBrigades = Array.from(new Set(sides.flatMap(s => s.Brigade).filter(Boolean)));
  const allClasses = Array.from(new Set(sides.flatMap(s => s.Class).filter(Boolean)));

  // Top-level character attributes are only populated when unambiguous across all card sides
  const topLevelGender =
    sides.length === 1
      ? (sides[0].Gender || "")
      : (sides.every((s) => s.Gender && s.Gender === sides[0].Gender) ? sides[0].Gender : "");
  const topLevelIsGeneric = resolveTopLevelBooleanAttr(sides, "IsGeneric");
  const topLevelIsHuman = resolveTopLevelBooleanAttr(sides, "IsHuman");

  const name = topSide.Name;
  const imageFile = card.ImageFile || "";
  const set = card.Set || "";
  const id = String(card.Id !== undefined && card.Id !== null ? card.Id : (card.id !== undefined && card.id !== null ? card.id : ""));

  return {
    id,
    Set: set,
    ImageFile: imageFile,
    OfficialSet: card.OfficialSet || "",
    Identifier: card.Identifier || "",
    Gender: topLevelGender,
    IsGeneric: topLevelIsGeneric,
    IsHuman: topLevelIsHuman,
    Rarity: card.Rarity || "",
    Reference: card.Reference || "",
    Legality: card.Legality || "",
    Testament: card.Testament || "",
    IsToken: !!card.IsToken,
    IsCharacter: !!card.IsCharacter,
    IsEnhancement: !!card.IsEnhancement,
    IsGospel: !!card.IsGospel,
    IsStarCard: !!card.IsStarCard,
    IsCloud: typeof card.IsCloud === "boolean" ? card.IsCloud : Boolean(resolveTopLevelBooleanAttr(sides, "IsCloud")),
    IsMeek: typeof card.IsMeek === "boolean" ? card.IsMeek : Boolean(resolveTopLevelBooleanAttr(sides, "IsMeek")),
    StarAbility: card.StarAbility || "",
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
