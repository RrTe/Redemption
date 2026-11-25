/**
 * @module shared/rules/RelativeFilterEvaluator
 * Pure evaluator for AST TargetSelector `relative_filters` (`{ attribute, relation, reference }`).
 */
const { matchesCardType, resolveActiveSideIndex } = require("../cardHierarchy");
const { GenderEvaluator } = require("./GenderEvaluator");
const { SideAttributeEvaluator } = require("./SideAttributeEvaluator");
const { ZONES } = require("../zones");

const PRE_RESOLVED_DYNAMIC_REFS = new Set(["chained_target", "selected", "trigger_subject"]);

/**
 * Pure service evaluating relative comparisons between candidate cards and a reference entity.
 */
class RelativeFilterEvaluator {
  /**
   * Evaluates all `relative_filters` against a candidate card (logical AND).
   *
   * @param {object} card Candidate card instance.
   * @param {Array<object>} [relativeFilters=[]] Array of `{ attribute, relation, reference }`.
   * @param {object} [context={}] Runtime evaluation context.
   * @returns {boolean} True if all relative predicates match.
   */
  static matchesRelativeFilters(card, relativeFilters = [], context = {}) {
    if (!card) return false;
    if (!Array.isArray(relativeFilters) || relativeFilters.length === 0) return true;

    for (let i = 0; i < relativeFilters.length; i++) {
      if (!this.matchesSingleRelativeFilter(card, relativeFilters[i], context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolves the reference card entity referenced by a relative filter.
   *
   * @param {string|{ ref_step: number }} reference Reference identifier or `{ ref_step }`.
   * @param {object} [context={}] Runtime evaluation context.
   * @returns {object|null} Reference card object or null.
   */
  static resolveReferenceCard(reference, context = {}) {
    if (!reference) return null;
    const room = context.room;

    if (typeof reference === "object" && typeof reference.ref_step === "number") {
      const stepSnap = context.stepSnapshots?.[reference.ref_step] || context.previousSnapshot;
      const firstId = stepSnap?.movedCards?.[0]?.cardId || stepSnap?.movedCardIds?.[0];
      if (firstId && room?.cardLookup) {
        return room.cardLookup.get(firstId) || context.referenceCard || null;
      }
      return context.referenceCard || null;
    }

    const refKey = String(reference).trim().toLowerCase();
    switch (refKey) {
      case "self":
        return context.sourceCard || context.card || null;
      case "actor":
      case "bearer": {
        if (context.actorCard) return context.actorCard;
        if (context.bearerCard) return context.bearerCard;
        const src = context.sourceCard || context.card;
        if (src?.attachedTo && room?.cardLookup) {
          return room.cardLookup.get(src.attachedTo) || src;
        }
        return context.referenceCard || src || null;
      }
      case "chained_target": {
        if (context.chainedTargetCard) return context.chainedTargetCard;
        const firstId = context.previousSnapshot?.movedCards?.[0]?.cardId;
        if (firstId && room?.cardLookup) {
          return room.cardLookup.get(firstId) || context.referenceCard || null;
        }
        return context.referenceCard || null;
      }
      case "selected":
        return context.selectedCard || context.referenceCard || null;
      case "trigger_subject":
        return context.triggerSubjectCard || context.referenceCard || null;
      default:
        return context.referenceCard || context.sourceCard || null;
    }
  }

  /**
   * Evaluates a single `{ attribute, relation, reference }` filter against a candidate card.
   *
   * @param {object} card Candidate card instance.
   * @param {object} filter RelativeFilter node.
   * @param {object} [context={}] Evaluation context.
   * @returns {boolean} True if comparison holds.
   */
  static matchesSingleRelativeFilter(card, filter, context = {}) {
    if (!card || !filter || typeof filter !== "object") return true;
    const attr = String(filter.attribute || "").trim().toLowerCase();
    const rel = String(filter.relation || "same").trim().toLowerCase();
    const refCard = this.resolveReferenceCard(filter.reference, context);

    if (attr === "gender" && rel === "opposite") {
      return GenderEvaluator.matchesOppositeGender(card, refCard, context);
    }

    if (!refCard) {
      const refKey = typeof filter.reference === "string" ? filter.reference.trim().toLowerCase() : "";
      const isDynamicStepRef = typeof filter.reference === "object" || PRE_RESOLVED_DYNAMIC_REFS.has(refKey);
      return isDynamicStepRef && !context.strictRelativeReference;
    }

    switch (attr) {
      case "gender":
        return this._compareGender(card, refCard, rel, context);
      case "brigade":
        return this._compareSetAttribute(this._getBrigades(card), this._getBrigades(refCard), rel, { allowMultiWildcard: true });
      case "alignment":
        return this._compareAlignment(card, refCard, rel);
      case "strength":
      case "toughness":
        return this._compareNumericStat(card, refCard, attr, rel);
      case "testament":
        return this._compareTestament(card, refCard, rel);
      case "type":
        return this._compareType(card, refCard, rel);
      case "controller":
        return this._compareController(card, refCard, rel);
      case "title":
        return this._compareTitle(card, refCard, rel);
      case "book":
        return this._compareSetAttribute(this._getBooks(card), this._getBooks(refCard), rel);
      case "church":
        return this._compareSetAttribute(this._getChurches(card), this._getChurches(refCard), rel);
      default:
        return true;
    }
  }

  /** @private */
  static _compareGender(card, refCard, rel, context) {
    const gA = GenderEvaluator.resolveCardGender(card, context);
    const gB = GenderEvaluator.resolveCardGender(refCard, context);
    if (!gA || !gB || gA === "genderless" || gB === "genderless") return false;
    const sharesMale = (gA === "male" || gA === "both") && (gB === "male" || gB === "both");
    const sharesFemale = (gA === "female" || gA === "both") && (gB === "female" || gB === "both");
    const isSame = sharesMale || sharesFemale;
    if (rel === "same" || rel === "==") return isSame;
    if (rel === "different" || rel === "!=") return !isSame;
    return false;
  }

  /** @private */
  static _compareAlignment(card, refCard, rel) {
    const a = String(card.inGameAlignment || card.Alignment || "").toLowerCase();
    const b = String(refCard.inGameAlignment || refCard.Alignment || "").toLowerCase();
    if (!a || !b) return false;
    if (rel === "same" || rel === "==") return a === b;
    if (rel === "different" || rel === "!=") return a !== b;
    if (rel === "opposite") {
      return (a.includes("good") && b.includes("evil")) || (a.includes("evil") && b.includes("good"));
    }
    return false;
  }

  /** @private */
  static _compareNumericStat(card, refCard, attr, rel) {
    // Lazy-require to avoid circular dependency: BattleCalculator -> ProtectionService -> RelativeFilterEvaluator -> StatFilterEvaluator
    const { StatFilterEvaluator } = require("./StatFilterEvaluator");
    const a = StatFilterEvaluator.getCardStats(card)[attr];
    const b = StatFilterEvaluator.getCardStats(refCard)[attr];
    if (rel === "same" || rel === "==") return a === b;
    if (rel === "different" || rel === "!=") return a !== b;
    return StatFilterEvaluator.compare(a, rel, b);
  }

  /** @private */
  static _compareTestament(card, refCard, rel) {
    const getTest = (c) => {
      let t = String(c.Testament || SideAttributeEvaluator.lookupDbCard(c)?.Testament || "").toUpperCase();
      if (t.includes("OT") && t.includes("NT")) return "BOTH";
      if (t.includes("OT")) return "OT";
      if (t.includes("NT")) return "NT";
      return "";
    };
    const a = getTest(card);
    const b = getTest(refCard);
    if (!a || !b) return false;
    if (rel === "same" || rel === "==") return a === b || a === "BOTH" || b === "BOTH";
    if (rel === "different" || rel === "!=" || rel === "opposite") {
      return (a === "OT" && b === "NT") || (a === "NT" && b === "OT");
    }
    return false;
  }

  /** @private */
  static _compareType(card, refCard, rel) {
    const a = card.inGameType || card.Type || "";
    const b = refCard.inGameType || refCard.Type || "";
    if (!a || !b) return false;
    const isSame = matchesCardType(a, String(Array.isArray(b) ? b[0] : b));
    if (rel === "same" || rel === "==") return isSame;
    if (rel === "different" || rel === "!=") return !isSame;
    return false;
  }

  /** @private */
  static _compareController(card, refCard, rel) {
    const a = card.controllerId || card.ownerId || "";
    const b = refCard.controllerId || refCard.ownerId || "";
    if (!a || !b) return false;
    if (rel === "same" || rel === "==") return a === b;
    if (rel === "different" || rel === "!=" || rel === "opposite") return a !== b;
    return false;
  }

  /** @private */
  static _compareTitle(card, refCard, rel) {
    const cleanTitle = (c) =>
      String(c.Name || c.card_name || "").replace(/\s*(?:\([^)]+\)|\[[^\]]+\])\s*$/g, "").trim().toLowerCase();
    const a = cleanTitle(card);
    const b = cleanTitle(refCard);
    if (!a || !b) return false;
    if (rel === "same" || rel === "==") return a === b;
    if (rel === "different" || rel === "!=") return a !== b;
    return false;
  }

  /** @private */
  static _compareSetAttribute(setA, setB, rel, { allowMultiWildcard = false } = {}) {
    if (setA.length === 0 || setB.length === 0) return false;
    const overlap = allowMultiWildcard && (setA.includes("multi") || setB.includes("multi"))
      ? true
      : setA.some((item) => setB.includes(item));
    if (rel === "same" || rel === "==") return overlap;
    if (rel === "different" || rel === "!=") return !overlap;
    return false;
  }

  /** @private */
  static _getBrigades(card) {
    const dbCard = SideAttributeEvaluator.lookupDbCard(card);
    let raw = Array.isArray(card.Brigades) && card.Brigades.length > 0 ? card.Brigades : card.Brigade;
    if ((!raw || (Array.isArray(raw) && raw.length === 0)) && dbCard) {
      const isInPlay = card.zone === ZONES.BATTLEFIELD || card.zone === ZONES.TERRITORY;
      if (isInPlay && Array.isArray(dbCard.sides) && dbCard.sides.length > 1) {
        const activeSide = dbCard.sides[resolveActiveSideIndex(card, dbCard.sides)];
        raw = activeSide?.Brigade;
      } else {
        raw = dbCard.Brigade;
      }
    }
    const list = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("/") : []);
    return list
      .flatMap((b) => String(b || "").split("/"))
      .map((b) => b.trim().toLowerCase())
      .filter((b) => b && b !== "none" && b !== "neutral" && b !== "colorless");
  }

  /** @private */
  static _getBooks(card) {
    const dbCard = SideAttributeEvaluator.lookupDbCard(card);
    const refStr = String(card.Reference || dbCard?.Reference || "").trim();
    const books = new Set();
    if (refStr) {
      const match = refStr.match(/^((?:[123]|I{1,3})\s+)?[A-Za-z]+/);
      if (match) books.add(match[0].trim().toLowerCase());
    }
    const ordir = Array.isArray(card.ORDIR) && card.ORDIR.length > 0 ? card.ORDIR : (dbCard?.ORDIR || []);
    for (const tag of ordir) {
      const m = String(tag || "").match(/^(.+?)\s+Card$/i);
      if (m) books.add(m[1].trim().toLowerCase());
    }
    return Array.from(books);
  }

  /** @private */
  static _getChurches(card) {
    const dbCard = SideAttributeEvaluator.lookupDbCard(card);
    const ordir = Array.isArray(card.ORDIR) && card.ORDIR.length > 0 ? card.ORDIR : (dbCard?.ORDIR || []);
    return ordir
      .map((tag) => String(tag || "").trim().toLowerCase())
      .filter((tag) => tag.endsWith(" church"));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RelativeFilterEvaluator };
}
