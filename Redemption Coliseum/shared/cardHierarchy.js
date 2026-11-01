// shared/cardHierarchy.js
let hierarchyData;
try {
  hierarchyData = require("./cardHierarchy.json");
} catch (_e) {
  // ESM or web fallback
  hierarchyData = { card_types: [], type_groups: {}, type_is_a: {} };
}

/**
 * Normalizes a type string for case- and whitespace-insensitive comparison.
 *
 * @param {string} val Raw type name.
 * @returns {string} Normalized lowercase string without underscores or spaces.
 */
function normalizeTypeName(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/**
 * Expands a target group name into its constituent base types.
 *
 * @param {string} groupName Target group name (e.g. "character", "enhancement", "city").
 * @returns {string[]} List of base card types belonging to the group, or empty array.
 */
function expandTypeGroup(groupName) {
  const norm = normalizeTypeName(groupName);
  for (const [key, members] of Object.entries(hierarchyData.type_groups || {})) {
    if (normalizeTypeName(key) === norm) {
      return members;
    }
  }
  return [];
}

/**
 * Evaluates whether a card type matches a target type according to REG taxonomy.
 *
 * @param {string|string[]} cardTypes Single card type or list of card types.
 * @param {string} targetType Canonical AST target type string.
 * @returns {boolean} True if the card type satisfies the target requirement.
 */
function matchesCardType(cardTypes, targetType) {
  if (!targetType) return true;
  const targetNorm = normalizeTypeName(targetType);
  if (targetNorm === "card" || targetNorm === "any" || targetNorm === "all") {
    return true;
  }

  const types = Array.isArray(cardTypes)
    ? cardTypes
    : String(cardTypes || "").split("/").map((t) => t.trim()).filter(Boolean);

  const groupMembers = expandTypeGroup(targetType).map(normalizeTypeName);

  for (const rawType of types) {
    const cardNorm = normalizeTypeName(rawType);
    if (!cardNorm) continue;

    // 1. Direct match
    if (cardNorm === targetNorm) {
      return true;
    }

    // 2. Target is a group term (e.g. target is "character" and card is "Hero")
    if (groupMembers.includes(cardNorm)) {
      return true;
    }

    // 3. Card type inherits secondary types via type_is_a (e.g. Covenant is an Artifact and GE)
    for (const [subType, parents] of Object.entries(hierarchyData.type_is_a || {})) {
      if (normalizeTypeName(subType) === cardNorm) {
        for (const parent of parents) {
          const parentNorm = normalizeTypeName(parent);
          if (parentNorm === targetNorm || groupMembers.includes(parentNorm)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Checks whether a target type string represents a known base card type or group.
 *
 * @param {string} targetType Canonical AST target type string.
 * @returns {boolean} True if targetType is a recognized base card type in the taxonomy.
 */
function isBaseCardType(targetType) {
  if (!targetType) return false;
  const targetNorm = normalizeTypeName(targetType);
  if (targetNorm === "card" || targetNorm === "any" || targetNorm === "all") return true;
  if ((hierarchyData.card_types || []).some((t) => normalizeTypeName(t) === targetNorm)) return true;
  if (Object.keys(hierarchyData.type_groups || {}).some((k) => normalizeTypeName(k) === targetNorm)) return true;
  if (Object.keys(hierarchyData.type_is_a || {}).some((k) => normalizeTypeName(k) === targetNorm)) return true;
  return false;
}

/**
 * Evaluates whether a card satisfies a subtype, descriptor, classification, or identifier filter.
 *
 * @param {object} card Card instance or card data object.
 * @param {string} subtype Subtype / descriptor to test (e.g. "animal", "priest", "giant").
 * @returns {boolean} True if the card possesses the subtype or identifier.
 */
function matchesCardSubtype(card, subtype) {
  if (!card || !subtype) return false;
  const needle = String(subtype).toLowerCase().trim();
  if (!needle) return false;

  let ordirList = card.ORDIR;
  let cardIdent = card.Identifier;
  let cardClass = card.Class;

  if (card.templateId) {
    try {
      const { CardRepository } = require("./CardRepository");
      const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
      if (dbCard) {
        if (!ordirList || ordirList.length === 0) ordirList = dbCard.ORDIR;
        if (!cardIdent) cardIdent = dbCard.Identifier;
        if (!cardClass) cardClass = dbCard.Class;
      }
    } catch (_e) {}
  }

  // Dual card in play: use active side ORDIR/Identifier/Class if available
  const isInPlay = card.zone === "battle" || card.zone === "territory" || card.zone === "battlefield";
  if (isInPlay && Array.isArray(card.sides) && card.sides.length > 1) {
    const activeSideIndex = (card.inGameAlignment || "").toLowerCase().includes("evil") ? 1 : 0;
    const side = card.sides[activeSideIndex];
    if (side) {
      if (Array.isArray(side.ORDIR) && side.ORDIR.length > 0) ordirList = side.ORDIR;
      if (side.Identifier) cardIdent = side.Identifier;
      if (side.Class) cardClass = side.Class;
    }
  }

  // 1. Regex word boundary matching on Identifier and Class
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i");

  if (cardIdent && regex.test(String(cardIdent))) return true;
  if (cardClass && regex.test(String(cardClass))) return true;

  // 2. ORDIR array matching (exact match or word boundary regex)
  if (Array.isArray(ordirList)) {
    for (const item of ordirList) {
      const itemStr = String(item || "").trim().toLowerCase();
      if (itemStr === needle || regex.test(itemStr)) {
        return true;
      }
    }
  }

  // 3. Card Name matching (fallback if name explicitly includes the descriptor or vice versa)
  const cardName = String(card.Name || card.card_name || "").toLowerCase();
  if (cardName && (regex.test(cardName) || cardName.includes(needle) || needle.includes(cardName))) {
    return true;
  }

  return false;
}

/**
 * Checks whether a card satisfies a target_type requirement.
 * Handles canonical base card types (Hero, Evil Character, etc.) via matchesCardType,
 * and character subtypes / descriptors (animal, priest, warrior, etc.) via matchesCardSubtype.
 *
 * @param {object} card Card instance or card definition.
 * @param {string} targetType Target type from AST (e.g. "animal", "hero", "priest").
 * @param {string|string[]} [activeType] Active card type(s) if known.
 * @returns {boolean} True if card satisfies the target type.
 */
function matchesTargetType(card, targetType, activeType) {
  if (!targetType) return true;
  const rawType = String(targetType).toLowerCase().trim();
  if (!rawType) return true;

  const currentType = activeType !== undefined && activeType !== null
    ? activeType
    : (card.inGameType || card.Type || "");

  // 1. Direct or hierarchical base type match
  if (matchesCardType(currentType, rawType)) {
    return true;
  }

  // 2. If targetType is a known base card type or group, do not fall back to descriptor/name matching
  if (isBaseCardType(rawType)) {
    return false;
  }

  // 3. Match as a subtype, descriptor, classification, or identifier
  return matchesCardSubtype(card, rawType);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    cardHierarchy: hierarchyData,
    expandTypeGroup,
    matchesCardType,
    isBaseCardType,
    matchesCardSubtype,
    matchesTargetType,
  };
}

