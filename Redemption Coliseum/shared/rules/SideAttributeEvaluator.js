/**
 * @module shared/rules/SideAttributeEvaluator
 * Pure evaluator for character-side attributes (`IsGeneric`/`is_generic`,
 * `IsHuman`/`is_human`) and canonical `Classes`/`classes` across single-sided,
 * dual-sided, and cloned runtime card instances.
 */
const {
  matchesCardType,
  isBaseCardType,
  isCharacterSideType,
  resolveActiveSideIndex,
} = require("../cardHierarchy");
const astConstantsJson = require("../ast_constants.json");
const { ZONES } = require("../zones");

const CANONICAL_CLASSES = Array.isArray(astConstantsJson.card_classes)
  ? astConstantsJson.card_classes
  : ["Warrior", "Weapon", "Territory"];

const IN_PLAY_ZONES = new Set([
  ZONES.BATTLEFIELD,
  ZONES.TERRITORY,
  ZONES.LAND_OF_BONDAGE,
  "battle",
]);

const NON_HUMAN_DESCRIPTOR_REGEX = /\b(angel|demon|animal|beast|non-human)\b/i;
const GENERIC_DESCRIPTOR_REGEX = /(^|[^a-zA-Z0-9])generic([^a-zA-Z0-9]|$)/i;
// Card Colyseus Schema initializes IsGospel/IsStarCard to false; allow metadata inference unless explicit side data says false.
const SCHEMA_DEFAULTED_BOOL_KEYS = new Set(["IsGospel", "IsStarCard"]);

/**
 * Pure service for shared side extraction and attribute/class matching.
 */
class SideAttributeEvaluator {
  /**
   * Looks up the normalized repository record for a card instance by templateId.
   * Restores side metadata stripped by Colyseus Schema.clone() on zone moves.
   *
   * @param {object} card Runtime card instance or mock.
   * @returns {object|null} Repository card record or null.
   */
  static lookupDbCard(card) {
    const lookupKey = card?.templateId || card?.id;
    if (!lookupKey) return null;
    try {
      const { CardRepository } = require("../CardRepository");
      if (!CardRepository || !CardRepository.isInitialized) return null;
      return (
        (typeof CardRepository.getById === "function" && CardRepository.getById(lookupKey)) ||
        (typeof CardRepository.get === "function" && CardRepository.get(lookupKey)) ||
        null
      );
    } catch (_err) {
      return null;
    }
  }

  /**
   * Normalizes raw card class values into canonical strings ("Warrior", "Weapon", "Territory").
   *
   * @param {string|string[]} rawClasses Raw class array or delimiter-separated string.
   * @returns {string[]} Canonical deduplicated class names.
   */
  static normalizeClassList(rawClasses) {
    const tokens = Array.isArray(rawClasses)
      ? rawClasses
      : (typeof rawClasses === "string" ? rawClasses.split(/[\/,]/) : []);
    const seen = new Set();
    const out = [];
    for (const raw of tokens) {
      const cleaned = String(raw || "").trim();
      if (!cleaned) continue;
      const stripped = cleaned.replace(/[-\s]+class$/i, "").trim().toLowerCase();
      let matched = CANONICAL_CLASSES.find((c) => {
        const cl = c.toLowerCase();
        return stripped === cl || new RegExp(`\\b${cl}\\b`, "i").test(cleaned);
      });
      const canonical = matched || cleaned;
      const key = canonical.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(canonical);
      }
    }
    return out;
  }

  /**
   * Indicates whether card already carries an active side selection in runtime state.
   *
   * @param {object} card Card object.
   * @param {object} [context={}] Optional evaluation context.
   * @returns {boolean} True when runtime side state applies.
   */
  static hasRuntimeSide(card, context = {}) {
    const isInPlay = IN_PLAY_ZONES.has(String(card?.zone || "").toLowerCase());
    return Boolean(
      isInPlay ||
      card?.inGameType ||
      card?.inGameAlignment ||
      card?.isFlipped ||
      context?.side
    );
  }

  /**
   * Extracts an ordered sides array from a normalized card, raw DB card, or AST map.
   *
   * @param {object} card Card object in any representation.
   * @returns {Array<object>} Ordered array of side descriptors.
   */
  static extractSides(card) {
    if (!card || typeof card !== "object") return [];
    if (Array.isArray(card.sides) && card.sides.length > 0) {
      return card.sides;
    }
    if (card.CardSides && typeof card.CardSides === "object") {
      return this.sidesFromCardSidesMap(card.CardSides, card);
    }
    const dbCard = this.lookupDbCard(card);
    if (dbCard) {
      if (Array.isArray(dbCard.sides) && dbCard.sides.length > 0) return dbCard.sides;
      if (dbCard.CardSides && typeof dbCard.CardSides === "object") {
        return this.sidesFromCardSidesMap(dbCard.CardSides, dbCard);
      }
    }
    if (card.sides && typeof card.sides === "object" && !Array.isArray(card.sides)) {
      return this.sidesFromAstMap(card.sides, card);
    }
    return [];
  }

  /**
   * Converts raw CardSides ({ shared, top, bottom }) or token side maps into ordered entries.
   *
   * @param {object} cardSides Raw CardSides map.
   * @param {object} card Parent raw card object.
   * @returns {Array<object>} Ordered side array.
   */
  static sidesFromCardSidesMap(cardSides, card) {
    const shared = cardSides.shared || {};
    const result = [];
    const buildEntry = (concrete, fallbackCard) => {
      const sideType = concrete?.Type || shared.Type || fallbackCard?.Type || "";
      const isChar = !sideType || isCharacterSideType(sideType);
      const pickBool = (pascalKey, snakeKey) => {
        if (!isChar) return null;
        const val = concrete?.[pascalKey] ?? concrete?.[snakeKey] ??
          shared[pascalKey] ?? shared[snakeKey] ??
          fallbackCard?.[pascalKey] ?? fallbackCard?.[snakeKey];
        return typeof val === "boolean" ? val : null;
      };
      const pickGeneralBool = (pascalKey, snakeKey) => {
        const val = concrete?.[pascalKey] ?? concrete?.[snakeKey] ??
          shared[pascalKey] ?? shared[snakeKey] ??
          fallbackCard?.[pascalKey] ?? fallbackCard?.[snakeKey];
        return typeof val === "boolean" ? val : null;
      };
      return {
        Name: concrete?.Name || shared.Name || fallbackCard?.Name || "",
        Type: sideType,
        Alignment: concrete?.Alignment || shared.Alignment || fallbackCard?.Alignment || "",
        Class: this.normalizeClassList(concrete?.Classes ?? concrete?.classes ?? concrete?.Class ?? shared.Classes ?? shared.classes ?? shared.Class ?? fallbackCard?.Class),
        Identifier: concrete?.Identifier ?? shared.Identifier ?? fallbackCard?.Identifier ?? "",
        ORDIR: concrete?.ORDIR ?? shared.ORDIR ?? fallbackCard?.ORDIR ?? [],
        Gender: !isChar ? "" : (concrete?.Gender ?? concrete?.gender ?? shared.Gender ?? shared.gender ?? fallbackCard?.Gender ?? fallbackCard?.gender ?? ""),
        IsGeneric: pickBool("IsGeneric", "is_generic"),
        IsHuman: pickBool("IsHuman", "is_human"),
        IsCloud: pickGeneralBool("IsCloud", "is_cloud"),
        IsMeek: pickGeneralBool("IsMeek", "is_meek"),
        IsGospel: pickGeneralBool("IsGospel", "is_gospel"),
        IsStarCard: pickGeneralBool("IsStarCard", "is_star"),
      };
    };

    if (cardSides.top || cardSides.bottom) {
      if (cardSides.top || cardSides.shared) result.push(buildEntry(cardSides.top || {}, card));
      if (cardSides.bottom) result.push(buildEntry(cardSides.bottom, null));
      return result;
    }

    const namedSides = Object.entries(cardSides).filter(([k]) => k !== "shared").map(([, s]) => s);
    if (namedSides.length > 0) {
      for (let i = 0; i < namedSides.length; i++) {
        result.push(buildEntry(namedSides[i] || {}, i === 0 ? card : null));
      }
    } else if (cardSides.shared) {
      result.push(buildEntry({}, card));
    }
    return result;
  }

  /**
   * Converts raw AST sides map ({ shared, top, bottom }) into an ordered array.
   *
   * @param {object} astSides AST sides map from cards_logic.json.
   * @param {object} card Parent card object.
   * @returns {Array<object>} Ordered side array.
   */
  static sidesFromAstMap(astSides, card) {
    const shared = astSides.shared || {};
    const toEntry = (side, fallback) => ({
      Type: side.type || shared.type || fallback?.Type || "",
      Alignment: side.alignment || shared.alignment || fallback?.Alignment || "",
      Class: this.normalizeClassList(side.classes ?? shared.classes ?? fallback?.Class),
      Identifier: fallback?.Identifier || "",
      ORDIR: fallback?.ORDIR || [],
      Gender: side.gender ?? shared.gender ?? "",
      IsGeneric: typeof (side.is_generic ?? shared.is_generic) === "boolean" ? (side.is_generic ?? shared.is_generic) : null,
      IsHuman: typeof (side.is_human ?? shared.is_human) === "boolean" ? (side.is_human ?? shared.is_human) : null,
      IsCloud: typeof (side.is_cloud ?? shared.is_cloud) === "boolean" ? (side.is_cloud ?? shared.is_cloud) : null,
      IsMeek: typeof (side.is_meek ?? shared.is_meek) === "boolean" ? (side.is_meek ?? shared.is_meek) : null,
      IsGospel: typeof (side.is_gospel ?? shared.is_gospel) === "boolean" ? (side.is_gospel ?? shared.is_gospel) : null,
      IsStarCard: typeof (side.is_star ?? shared.is_star) === "boolean" ? (side.is_star ?? shared.is_star) : null,
    });
    const result = [];
    if (astSides.top || astSides.shared) result.push(toEntry(astSides.top || {}, card));
    if (astSides.bottom) result.push(toEntry(astSides.bottom, null));
    return result;
  }

  /**
   * Validates whether a dual-card side entry matches selector alignment and target_type.
   *
   * @param {object} side Normalized side object.
   * @param {object} [targetDef={}] Selector definition.
   * @param {boolean} [requireCharacter=false] Require character side type.
   * @returns {boolean} True if side is coherent with selector criteria.
   */
  static sideMatchesTargetMeta(side, targetDef = {}, requireCharacter = false) {
    if (!side) return false;
    const sideType = side.Type || side.type || "";
    if (requireCharacter && !isCharacterSideType(sideType)) return false;

    const reqAlign = String(targetDef?.alignment || "").trim().toLowerCase();
    if (reqAlign && reqAlign !== "either" && reqAlign !== "any") {
      const sideAlign = String(side.Alignment || side.alignment || "").toLowerCase();
      if (!sideAlign.includes(reqAlign)) return false;
    }

    const reqType = String(targetDef?.target_type || "").trim().toLowerCase();
    if (reqType && reqType !== "card" && reqType !== "any" && reqType !== "all") {
      const allowsWeaponEnh = reqType === "character" &&
        Array.isArray(targetDef?.classes) &&
        targetDef.classes.some((c) => /^weapon$/i.test(String(c || "")));
      if (!matchesCardType(sideType, reqType) && !(allowsWeaponEnh && matchesCardType(sideType, "enhancement"))) {
        if (isBaseCardType(reqType)) return false;
      }
    }
    return true;
  }

  static _inferGeneric(sideObj, cardObj) {
    const ident = String(sideObj?.Identifier ?? cardObj?.Identifier ?? "");
    const ordir = Array.isArray(sideObj?.ORDIR) ? sideObj.ORDIR : (Array.isArray(cardObj?.ORDIR) ? cardObj.ORDIR : []);
    return GENERIC_DESCRIPTOR_REGEX.test(ident) || ordir.some((o) => GENERIC_DESCRIPTOR_REGEX.test(String(o || "")));
  }

  static _inferHuman(sideObj, cardObj) {
    const ident = String(sideObj?.Identifier ?? cardObj?.Identifier ?? "");
    const cls = Array.isArray(sideObj?.Class) ? sideObj.Class.join(" ") : String(sideObj?.Class ?? cardObj?.Class ?? "");
    const ordir = Array.isArray(sideObj?.ORDIR) ? sideObj.ORDIR.join(" ") : (Array.isArray(cardObj?.ORDIR) ? cardObj.ORDIR.join(" ") : "");
    return !(NON_HUMAN_DESCRIPTOR_REGEX.test(ident) || NON_HUMAN_DESCRIPTOR_REGEX.test(cls) || NON_HUMAN_DESCRIPTOR_REGEX.test(ordir));
  }

  static _hasOrdirMatch(sideObj, cardObj, regex) {
    const sideOrdir = Array.isArray(sideObj?.ORDIR) ? sideObj.ORDIR : [];
    const cardOrdir = Array.isArray(cardObj?.ORDIR) ? cardObj.ORDIR : [];
    return sideOrdir.some((o) => regex.test(String(o || ""))) || cardOrdir.some((o) => regex.test(String(o || "")));
  }

  static _inferCloud(sideObj, cardObj) {
    return this._hasOrdirMatch(sideObj, cardObj, /^(?:cloud(?:\s+card)?)$/i);
  }

  static _inferMeek(sideObj, cardObj) {
    return this._hasOrdirMatch(sideObj, cardObj, /^(?:meek(?:\s+card)?)$/i);
  }

  static _inferStar(sideObj, cardObj) {
    const cls = Array.isArray(sideObj?.Class) ? sideObj.Class.join(" ") : String(sideObj?.Class ?? cardObj?.Class ?? "");
    return /\bstar\b/i.test(cls) || this._hasOrdirMatch(sideObj, cardObj, /^(?:star(?:\s+card)?)$/i);
  }

  static _inferGospel(sideObj, cardObj) {
    const ident = String(sideObj?.Identifier ?? cardObj?.Identifier ?? "");
    return /\bgospel\b/i.test(ident) || this._hasOrdirMatch(sideObj, cardObj, /^(?:gospel(?:\s+card)?)$/i);
  }

  static _readSideBool(sideObj, cardObj, pascalKey, snakeKey, inferFn) {
    const sideExplicit = sideObj?.[pascalKey] ?? sideObj?.[snakeKey];
    if (typeof sideExplicit === "boolean") return sideExplicit;
    const cardExplicit = cardObj?.[pascalKey] ?? cardObj?.[snakeKey];
    if (SCHEMA_DEFAULTED_BOOL_KEYS.has(pascalKey)) {
      if (cardExplicit === true) return true;
      const inferred = inferFn.call(this, sideObj, cardObj);
      if (inferred === true) return true;
      return typeof cardExplicit === "boolean" ? cardExplicit : inferred;
    }
    if (typeof cardExplicit === "boolean") return cardExplicit;
    return inferFn.call(this, sideObj, cardObj);
  }

  static _resolveCharacterBoolean(card, pascalKey, snakeKey, inferFn, options = {}) {
    if (!card || typeof card !== "object") return null;
    const sides = this.extractSides(card);

    if (options.side) {
      const sideKey = String(options.side).toLowerCase();
      if (sideKey === "shared") {
        if (card.CardSides?.shared) {
          const s = card.CardSides.shared;
          const t = s.Type || card.Type || "";
          return (!t || isCharacterSideType(t)) ? this._readSideBool(s, card, pascalKey, snakeKey, inferFn) : null;
        }
        if (sides.length > 1) {
          const vals = sides.map((s) => isCharacterSideType(s.Type || s.type) ? this._readSideBool(s, null, pascalKey, snakeKey, inferFn) : null);
          return typeof vals[0] === "boolean" && vals.every((v) => v === vals[0]) ? vals[0] : null;
        }
        return null;
      }
      const targetSide = sides[sideKey === "bottom" ? 1 : 0];
      if (!targetSide) return null;
      const sType = targetSide.Type || targetSide.type || "";
      return (!sType || isCharacterSideType(sType)) ? this._readSideBool(targetSide, null, pascalKey, snakeKey, inferFn) : null;
    }

    if (sides.length === 1) {
      if (card.inGameType && !isCharacterSideType(card.inGameType)) return null;
      const only = sides[0];
      const effType = only.Type || only.type || card.inGameType || card.Type || "";
      if (effType && !isCharacterSideType(effType)) return null;
      return this._readSideBool(only, card, pascalKey, snakeKey, inferFn);
    }

    if (sides.length > 1) {
      if (this.hasRuntimeSide(card, options)) {
        const activeSide = sides[resolveActiveSideIndex(card, sides)];
        if (!activeSide) return null;
        const effType = card.inGameType || activeSide.Type || activeSide.type || "";
        return isCharacterSideType(effType) ? this._readSideBool(activeSide, null, pascalKey, snakeKey, inferFn) : null;
      }
      const firstType = sides[0]?.Type || sides[0]?.type || "";
      if (!isCharacterSideType(firstType)) return null;
      const firstVal = this._readSideBool(sides[0], null, pascalKey, snakeKey, inferFn);
      return sides.every((s) => isCharacterSideType(s?.Type || s?.type) && this._readSideBool(s, null, pascalKey, snakeKey, inferFn) === firstVal)
        ? firstVal
        : null;
    }

    const fallbackType = card.inGameType || card.Type || "";
    if (fallbackType) {
      return isCharacterSideType(fallbackType) ? this._readSideBool(null, card, pascalKey, snakeKey, inferFn) : null;
    }
    const explicitTop = card[pascalKey] ?? card[snakeKey];
    return typeof explicitTop === "boolean" ? explicitTop : null;
  }

  /**
   * Resolves character `IsGeneric` for the card's active side (or null if non-character/ambiguous).
   *
   * @param {object} card Card instance, normalized card, or raw DB card.
   * @param {object} [options={}] Resolution options (`side`).
   * @returns {boolean|null}
   */
  static resolveIsGeneric(card, options = {}) {
    return this._resolveCharacterBoolean(card, "IsGeneric", "is_generic", this._inferGeneric, options);
  }

  /**
   * Resolves character `IsHuman` for the card's active side (or null if non-character/ambiguous).
   *
   * @param {object} card Card instance, normalized card, or raw DB card.
   * @param {object} [options={}] Resolution options (`side`).
   * @returns {boolean|null}
   */
  static resolveIsHuman(card, options = {}) {
    return this._resolveCharacterBoolean(card, "IsHuman", "is_human", this._inferHuman, options);
  }

  static _matchesCharacterBoolean(card, requiredVal, context, singleResolver, pascalKey, snakeKey, inferFn) {
    if (typeof requiredVal !== "boolean") return true;
    if (!card) return false;
    const sides = this.extractSides(card);
    if (sides.length > 1 && !this.hasRuntimeSide(card, context)) {
      return sides.some((side) =>
        this.sideMatchesTargetMeta(side, context?.targetDef, true) &&
        this._readSideBool(side, null, pascalKey, snakeKey, inferFn) === requiredVal
      );
    }
    return singleResolver.call(this, card, context) === requiredVal;
  }

  /** Evaluates a TargetSelector `is_generic` filter against a card. */
  static matchesIsGeneric(card, requiredIsGeneric, context = {}) {
    return this._matchesCharacterBoolean(card, requiredIsGeneric, context, this.resolveIsGeneric, "IsGeneric", "is_generic", this._inferGeneric);
  }

  /** Evaluates a TargetSelector `is_human` filter against a card. */
  static matchesIsHuman(card, requiredIsHuman, context = {}) {
    return this._matchesCharacterBoolean(card, requiredIsHuman, context, this.resolveIsHuman, "IsHuman", "is_human", this._inferHuman);
  }

  static _resolveGeneralBoolean(card, pascalKey, snakeKey, inferFn, options = {}) {
    if (!card || typeof card !== "object") return null;
    const sides = this.extractSides(card);

    if (options.side) {
      const sideKey = String(options.side).toLowerCase();
      if (sideKey === "shared") {
        if (card.CardSides?.shared) {
          return this._readSideBool(card.CardSides.shared, card, pascalKey, snakeKey, inferFn);
        }
        if (sides.length > 1) {
          const vals = sides.map((s) => this._readSideBool(s, null, pascalKey, snakeKey, inferFn));
          return typeof vals[0] === "boolean" && vals.every((v) => v === vals[0]) ? vals[0] : null;
        }
        return null;
      }
      const targetSide = sides[sideKey === "bottom" ? 1 : 0];
      return targetSide ? this._readSideBool(targetSide, null, pascalKey, snakeKey, inferFn) : null;
    }

    if (sides.length === 1) {
      return this._readSideBool(sides[0], card, pascalKey, snakeKey, inferFn);
    }

    if (sides.length > 1) {
      if (this.hasRuntimeSide(card, options)) {
        const activeSide = sides[resolveActiveSideIndex(card, sides)];
        return activeSide ? this._readSideBool(activeSide, null, pascalKey, snakeKey, inferFn) : null;
      }
      const firstVal = this._readSideBool(sides[0], null, pascalKey, snakeKey, inferFn);
      return sides.every((s) => this._readSideBool(s, null, pascalKey, snakeKey, inferFn) === firstVal) ? firstVal : null;
    }

    const explicitTop = card[pascalKey] ?? card[snakeKey];
    if (SCHEMA_DEFAULTED_BOOL_KEYS.has(pascalKey)) {
      if (explicitTop === true) return true;
      const inferred = inferFn.call(this, null, card);
      if (inferred === true) return true;
      return typeof explicitTop === "boolean" ? explicitTop : inferred;
    }
    if (typeof explicitTop === "boolean") return explicitTop;
    return inferFn.call(this, null, card);
  }

  static _matchesGeneralBoolean(card, requiredVal, context, singleResolver, pascalKey, snakeKey, inferFn) {
    if (typeof requiredVal !== "boolean") return true;
    if (!card) return false;
    const sides = this.extractSides(card);
    if (sides.length > 1 && !this.hasRuntimeSide(card, context)) {
      return sides.some((side) =>
        this.sideMatchesTargetMeta(side, context?.targetDef, false) &&
        this._readSideBool(side, null, pascalKey, snakeKey, inferFn) === requiredVal
      );
    }
    return singleResolver.call(this, card, context) === requiredVal;
  }

  /** Resolves `IsCloud` for the card's active side across all card types. */
  static resolveIsCloud(card, options = {}) {
    return this._resolveGeneralBoolean(card, "IsCloud", "is_cloud", this._inferCloud, options);
  }

  /** Evaluates a TargetSelector `is_cloud` filter against a card. */
  static matchesIsCloud(card, requiredIsCloud, context = {}) {
    return this._matchesGeneralBoolean(card, requiredIsCloud, context, this.resolveIsCloud, "IsCloud", "is_cloud", this._inferCloud);
  }

  /** Resolves `IsMeek` for the card's active side across all card types. */
  static resolveIsMeek(card, options = {}) {
    return this._resolveGeneralBoolean(card, "IsMeek", "is_meek", this._inferMeek, options);
  }

  /** Evaluates a TargetSelector `is_meek` filter against a card. */
  static matchesIsMeek(card, requiredIsMeek, context = {}) {
    return this._matchesGeneralBoolean(card, requiredIsMeek, context, this.resolveIsMeek, "IsMeek", "is_meek", this._inferMeek);
  }

  /** Resolves `IsStarCard` / `is_star` for the card's active side across all card types. */
  static resolveIsStar(card, options = {}) {
    return this._resolveGeneralBoolean(card, "IsStarCard", "is_star", this._inferStar, options);
  }

  /** Evaluates a TargetSelector `is_star` filter against a card. */
  static matchesIsStar(card, requiredIsStar, context = {}) {
    return this._matchesGeneralBoolean(card, requiredIsStar, context, this.resolveIsStar, "IsStarCard", "is_star", this._inferStar);
  }

  /** Resolves `IsGospel` / `is_gospel` for the card's active side across all card types. */
  static resolveIsGospel(card, options = {}) {
    return this._resolveGeneralBoolean(card, "IsGospel", "is_gospel", this._inferGospel, options);
  }

  /** Evaluates a TargetSelector `is_gospel` filter against a card. */
  static matchesIsGospel(card, requiredIsGospel, context = {}) {
    return this._matchesGeneralBoolean(card, requiredIsGospel, context, this.resolveIsGospel, "IsGospel", "is_gospel", this._inferGospel);
  }

  /**
   * Resolves canonical card classes for the card's active side (or combined sides if unflipped/flat).
   *
   * @param {object} card Card instance or normalized card.
   * @param {object} [options={}] Resolution options (`side`).
   * @returns {string[]} Canonical class list.
   */
  static resolveClasses(card, options = {}) {
    if (!card || typeof card !== "object") return [];
    const sides = this.extractSides(card);
    if (options.side && sides.length > 0) {
      const idx = String(options.side).toLowerCase() === "bottom" ? 1 : 0;
      const sideClasses = this.normalizeClassList(sides[idx]?.Class);
      if (sideClasses.length > 0) return sideClasses;
    }
    if (sides.length > 1 && this.hasRuntimeSide(card, options)) {
      const activeSide = sides[resolveActiveSideIndex(card, sides)];
      return this.normalizeClassList(activeSide?.Class ?? activeSide?.Classes);
    }
    if (sides.length >= 1) {
      const all = sides.flatMap((s) => this.normalizeClassList(s?.Class ?? s?.Classes));
      if (all.length > 0) return Array.from(new Set(all));
    }
    return this.normalizeClassList(card.Class ?? card.Classes ?? card.classes);
  }

  /**
   * Evaluates a TargetSelector `classes` filter against a card (disjunctive across array elements).
   *
   * @param {object} card Candidate card.
   * @param {string[]} requiredClasses Required canonical classes list.
   * @param {object} [context={}] Optional evaluation context (`targetDef`, `side`).
   * @returns {boolean}
   */
  static matchesClasses(card, requiredClasses, context = {}) {
    if (!Array.isArray(requiredClasses) || requiredClasses.length === 0) return true;
    if (!card) return false;
    const reqLower = this.normalizeClassList(requiredClasses).map((c) => c.toLowerCase());
    if (reqLower.length === 0) return true;

    const sides = this.extractSides(card);
    if (sides.length > 1 && !this.hasRuntimeSide(card, context)) {
      return sides.some((side) => {
        if (!this.sideMatchesTargetMeta(side, context?.targetDef, false)) return false;
        const sideClasses = this.normalizeClassList(side?.Class ?? side?.Classes).map((c) => c.toLowerCase());
        return reqLower.some((r) => sideClasses.includes(r));
      });
    }
    const cardClasses = this.resolveClasses(card, context).map((c) => c.toLowerCase());
    return reqLower.some((r) => cardClasses.includes(r));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SideAttributeEvaluator, CANONICAL_CLASSES };
}
