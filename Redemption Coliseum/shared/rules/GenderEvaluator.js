/**
 * @module shared/rules/GenderEvaluator
 * Pure evaluator for resolving character-side Gender (ORDIR 7.0.0) and evaluating
 * structured TargetSelector gender filters across single-sided, dual-sided, and
 * cloned runtime card instances.
 */
const { AST_GENDERS, CARD_GENDERS } = require("../astConstants");
const {
  isCharacterSideType,
  resolveActiveSideIndex,
  getValidCardGenders,
} = require("../cardHierarchy");
const { SideAttributeEvaluator } = require("./SideAttributeEvaluator");

const VALID_ENTITY_GENDERS = new Set(
  getValidCardGenders().length > 0 ? getValidCardGenders() : Object.values(CARD_GENDERS)
);

/**
 * Pure service for resolving card-side genders and evaluating TargetSelector gender criteria.
 */
class GenderEvaluator {
  /**
   * Looks up the normalized repository record for a card instance by templateId.
   *
   * @param {object} card Runtime card instance or mock.
   * @returns {object|null} Repository card record or null.
   */
  static _lookupDbCard(card) {
    return SideAttributeEvaluator.lookupDbCard(card);
  }

  /**
   * Extracts an ordered sides array from a normalized card, raw DB card, or AST map.
   *
   * @param {object} card Card object in any representation.
   * @returns {Array<object>} Ordered array of side descriptors.
   */
  static _extractSides(card) {
    return SideAttributeEvaluator.extractSides(card);
  }

  /**
   * Converts raw CardSides ({ shared, top, bottom }) into an ordered array.
   *
   * @param {object} cardSides Raw CardSides map.
   * @param {object} card Parent raw card object.
   * @returns {Array<object>} Ordered side array.
   */
  static _sidesFromCardSidesMap(cardSides, card) {
    return SideAttributeEvaluator.sidesFromCardSidesMap(cardSides, card);
  }

  /**
   * Converts raw AST sides map ({ shared, top, bottom }) into an ordered array.
   *
   * @param {object} astSides AST sides map from cards_logic.json.
   * @param {object} card Parent card object.
   * @returns {Array<object>} Ordered side array.
   */
  static _sidesFromAstMap(astSides, card) {
    return SideAttributeEvaluator.sidesFromAstMap(astSides, card);
  }

  /**
   * Validates and normalizes a raw gender string against cardHierarchy.json values,
   * returning null if the side type is non-character or gender is missing/invalid.
   *
   * @param {string|null|undefined} rawGender Raw gender attribute.
   * @param {string|string[]} [sideType] Side or active card type.
   * @returns {string|null} Valid lowercase gender ("male", "female", "both", "genderless") or null.
   */
  static _normalizeEntityGender(rawGender, sideType) {
    if (sideType && !isCharacterSideType(sideType)) {
      return null;
    }
    const norm = String(rawGender || "").trim().toLowerCase();
    return VALID_ENTITY_GENDERS.has(norm) ? norm : null;
  }

  /**
   * Resolves the effective character-side Gender of a card for its active/concrete side.
   * Non-character sides always evaluate to null, even if another physical side on the
   * same dual card is a character with a Gender.
   *
   * @param {object} card Card instance, normalized card, or raw DB card.
   * @param {object} [options={}] Resolution options.
   * @param {string} [options.side] Explicit side key ("top", "bottom", or "shared").
   * @returns {string|null} Resolved entity gender or null.
   */
  static resolveCardGender(card, options = {}) {
    if (!card || typeof card !== "object") return null;

    const sides = this._extractSides(card);

    // 1. Explicit side lookup (e.g. CardSides.top / CardSides.bottom / CardSides.shared)
    if (options.side) {
      const sideKey = String(options.side).toLowerCase();
      if (sideKey === "shared") {
        if (card.CardSides?.shared) {
          const shared = card.CardSides.shared;
          return this._normalizeEntityGender(shared.Gender ?? shared.gender, shared.Type || card.Type);
        }
        if (sides.length > 1 && sides.every((s) => s.Gender && s.Gender === sides[0].Gender)) {
          return this._normalizeEntityGender(sides[0].Gender, sides[0].Type);
        }
        return null;
      }
      const sideIdx = sideKey === "bottom" ? 1 : 0;
      const targetSide = sides[sideIdx];
      if (!targetSide) return null;
      return this._normalizeEntityGender(
        targetSide.Gender ?? targetSide.gender,
        targetSide.Type ?? targetSide.type
      );
    }

    const hasRuntimeSide = SideAttributeEvaluator.hasRuntimeSide(card);

    // 2. Side-resolved card instances and DB entries
    if (sides.length === 1) {
      const onlySide = sides[0];
      // If active runtime type was explicitly overridden to a non-character, it has no gender
      if (card.inGameType && !isCharacterSideType(card.inGameType)) {
        return null;
      }
      const effectiveType = onlySide.Type || onlySide.type || card.inGameType || card.Type || "";
      return this._normalizeEntityGender(
        onlySide.Gender ?? onlySide.gender ?? card.Gender ?? card.gender,
        effectiveType
      );
    }

    if (sides.length > 1) {
      if (hasRuntimeSide) {
        const activeIdx = resolveActiveSideIndex(card, sides);
        const activeSide = sides[activeIdx];
        if (!activeSide) return null;
        const effectiveType = card.inGameType || activeSide.Type || activeSide.type || "";
        if (!isCharacterSideType(effectiveType)) {
          return null;
        }
        return this._normalizeEntityGender(activeSide.Gender ?? activeSide.gender, effectiveType);
      }

      // Out-of-play dual card without an active side: only unambiguous if all sides share the same gender
      const firstGender = this._normalizeEntityGender(
        sides[0]?.Gender ?? sides[0]?.gender,
        sides[0]?.Type ?? sides[0]?.type
      );
      if (
        firstGender &&
        sides.every(
          (s) => this._normalizeEntityGender(s?.Gender ?? s?.gender, s?.Type ?? s?.type) === firstGender
        )
      ) {
        return firstGender;
      }
      return null;
    }

    // 3. Flat mock fallback when neither sides nor CardRepository entry exist
    const fallbackType = card.inGameType || card.Type || "";
    return this._normalizeEntityGender(card.Gender ?? card.gender, fallbackType);
  }

  /**
   * Evaluates a resolved entity gender against a TargetSelector.gender requirement
   * following ORDIR 7.0.0 matching semantics:
   * - Unset requirement matches all cards (including "both", "genderless", non-characters).
   * - "male" matches "male" or "both".
   * - "female" matches "female" or "both".
   * - "genderless" or null never matches a non-empty requirement.
   *
   * @param {string|null|undefined} entityGender Resolved side gender.
   * @param {string|null|undefined} requiredGender Required selector gender ("male" | "female").
   * @returns {boolean} True if entityGender fulfills requiredGender.
   */
  static matchesGenderValue(entityGender, requiredGender) {
    if (!requiredGender) return true;
    const req = String(requiredGender).trim().toLowerCase();
    if (!req) return true;

    const ent = String(entityGender || "").trim().toLowerCase();
    if (!ent || ent === CARD_GENDERS.GENDERLESS) {
      return false;
    }

    if (req === AST_GENDERS.MALE) {
      return ent === CARD_GENDERS.MALE || ent === CARD_GENDERS.BOTH;
    }
    if (req === AST_GENDERS.FEMALE) {
      return ent === CARD_GENDERS.FEMALE || ent === CARD_GENDERS.BOTH;
    }

    return ent === req;
  }

  /**
   * Evaluates whether a card satisfies a TargetSelector's gender requirement.
   * For out-of-play dual cards without an active side selected yet, ensures gender
   * matching holds consistently on the same side matching alignment and target_type.
   *
   * @param {object} card Candidate card instance or definition.
   * @param {string|null|undefined} requiredGender TargetSelector.gender value.
   * @param {object} [context={}] Optional evaluation context (e.g. targetDef, side).
   * @returns {boolean} True if the card matches the gender requirement.
   */
  static matchesGender(card, requiredGender, context = {}) {
    if (!requiredGender) return true;
    if (!card) return false;

    const sides = this._extractSides(card);
    const hasRuntimeSide = SideAttributeEvaluator.hasRuntimeSide(card, context);

    // Out-of-play dual card: match coherently per side against selector alignment/target_type
    if (sides.length > 1 && !hasRuntimeSide) {
      return sides.some((side) => {
        if (!SideAttributeEvaluator.sideMatchesTargetMeta(side, context.targetDef, true)) {
          return false;
        }
        const sideGender = this._normalizeEntityGender(side.Gender ?? side.gender, side.Type || side.type || "");
        return this.matchesGenderValue(sideGender, requiredGender);
      });
    }

    const entityGender = this.resolveCardGender(card, context);
    return this.matchesGenderValue(entityGender, requiredGender);
  }

  /**
   * Evaluates relational "opposite gender" matching (e.g. Sanctifying Faith).
   * - Target must be a character with resolved gender != "genderless".
   * - If referenceCard is provided with a resolved gender:
   *   - male <-> female|both, female <-> male|both, both <-> male|female|both.
   *   - genderless reference card cannot match any target of opposite gender.
   * - If no gendered referenceCard is in context (e.g. pre-selection on an Enhancement),
   *   requires the target to have a non-genderless character gender.
   *
   * @param {object} targetCard Candidate target card.
   * @param {object|null} referenceCard Reference character whose gender is inverted.
   * @param {object} [context={}] Additional resolution options.
   * @returns {boolean} True if targetCard qualifies as opposite gender.
   */
  static matchesOppositeGender(targetCard, referenceCard = null, context = {}) {
    if (!targetCard) return false;
    const targetGender = this.resolveCardGender(targetCard, context);
    if (!targetGender || targetGender === CARD_GENDERS.GENDERLESS) {
      return false;
    }

    if (!referenceCard) {
      return true;
    }

    const refGender = this.resolveCardGender(referenceCard, context);
    if (!refGender) {
      return true;
    }
    if (refGender === CARD_GENDERS.GENDERLESS) {
      return false;
    }
    if (refGender === CARD_GENDERS.MALE) {
      return this.matchesGenderValue(targetGender, AST_GENDERS.FEMALE);
    }
    if (refGender === CARD_GENDERS.FEMALE) {
      return this.matchesGenderValue(targetGender, AST_GENDERS.MALE);
    }
    if (refGender === CARD_GENDERS.BOTH) {
      return (
        this.matchesGenderValue(targetGender, AST_GENDERS.MALE) ||
        this.matchesGenderValue(targetGender, AST_GENDERS.FEMALE)
      );
    }

    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { GenderEvaluator };
}
