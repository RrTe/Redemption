/**
 * @module shared/rules/ProtectionService
 * Evaluator for immune and protect rules in accordance with official
 * Redemption REG v11.0.0 guidelines (lines 1723ff and Harm line 3889ff).
 */
const { matchesCardType, matchesTargetType } = require("../cardHierarchy");

class ProtectionService {
  /**
   * Determines if a targeting action from sourceCard against targetCard constitutes Harm.
   * REG line 3889ff: A card is harmed when targeted by an ability on a card of opposite alignment
   * (good vs. evil) or by a neutral card an opponent controls.
   *
   * @param {object} targetCard The card being targeted.
   * @param {object} sourceCard The card performing the ability or effect.
   * @returns {boolean} True if the action is harmful under REG definitions.
   */
  static isHarmful(targetCard, sourceCard) {
    if (!targetCard || !sourceCard) return false;

    const targetAlign = (targetCard.inGameAlignment || targetCard.Alignment || "").toString().toLowerCase();
    const sourceAlign = (sourceCard.inGameAlignment || sourceCard.Alignment || "").toString().toLowerCase();

    // Opposite alignment: Good vs. Evil
    const isGoodEvil =
      (targetAlign.includes("good") && sourceAlign.includes("evil")) ||
      (targetAlign.includes("evil") && sourceAlign.includes("good"));
    if (isGoodEvil) {
      return true;
    }

    // Neutral card controlled by opponent
    const targetController = targetCard.controllerId || targetCard.ownerId;
    const sourceController = sourceCard.controllerId || sourceCard.ownerId;
    if (sourceAlign.includes("neutral") && targetController && sourceController && targetController !== sourceController) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates whether a sourceCard matches a TargetSelector filter specified in card_sources.
   *
   * @param {object} sourceCard Source card attempting the action.
   * @param {object} sourceDef TargetSelector definition from card_sources.
   * @param {object} [targetCard] Card being protected (for controller comparison).
   * @returns {boolean} True if sourceCard qualifies as a blocked source.
   */
  static matchesSource(sourceCard, sourceDef = {}, targetCard = null) {
    if (!sourceCard || !sourceDef) return false;

    // Fast-Path: target_card_ids check
    if (Array.isArray(sourceDef.target_card_ids) && sourceDef.target_card_ids.length > 0) {
      const srcId = String(sourceCard.templateId || sourceCard.id || "");
      if (!sourceDef.target_card_ids.some((id) => String(id) === srcId)) {
        return false;
      }
    }

    // 1. Controller check: opponent or controller
    const targetController = targetCard?.controllerId || targetCard?.ownerId;
    const sourceController = sourceCard?.controllerId || sourceCard?.ownerId;
    if (sourceDef.zone_owner === "opponent") {
      if (!targetController || !sourceController || targetController === sourceController) {
        return false;
      }
    } else if (sourceDef.zone_owner === "controller") {
      if (!targetController || !sourceController || targetController !== sourceController) {
        return false;
      }
    }

    // 2. Alignment check
    if (sourceDef.alignment) {
      const srcAlign = (sourceCard.inGameAlignment || sourceCard.Alignment || "").toString().toLowerCase();
      if (!srcAlign.includes(sourceDef.alignment.toLowerCase())) {
        return false;
      }
    }

    // 3. Testament check (Bucket 3)
    if (sourceDef.testament) {
      const reqTest = String(sourceDef.testament).trim().toUpperCase();
      const srcTest = String(sourceCard.Testament || "").toUpperCase();
      const srcOrdir = Array.isArray(sourceCard.ORDIR) ? sourceCard.ORDIR.join(" ").toUpperCase() : "";
      const matchesDirect = srcTest !== "UNKNOWN" && srcTest.includes(reqTest);
      const matchesOrdir = srcOrdir.includes(`${reqTest} CARD`) || srcOrdir.includes(`${reqTest} CHARACTER`) || srcOrdir.includes(reqTest);
      if (!matchesDirect && !matchesOrdir) {
        return false;
      }
    }

    // 4. References check (Bucket 4)
    if (Array.isArray(sourceDef.references) && sourceDef.references.length > 0) {
      const srcRef = String(sourceCard.Reference || "").toLowerCase();
      const srcOrdir = Array.isArray(sourceCard.ORDIR) ? sourceCard.ORDIR.join(" ").toLowerCase() : "";
      const hasRefMatch = sourceDef.references.some((ref) => {
        const needle = String(ref || "").trim().toLowerCase();
        if (!needle) return false;
        if (srcOrdir.includes(needle)) return true;
        const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i");
        return regex.test(srcRef) || srcRef.startsWith(needle);
      });
      if (!hasRefMatch) {
        return false;
      }
    }

    // 5. Target type check (Bucket 1: canonical base card types)
    if (sourceDef.target_type) {
      const srcType = sourceCard.inGameType || sourceCard.Type || "";
      if (!matchesTargetType(sourceCard, sourceDef.target_type, srcType)) {
        return false;
      }
    }

    // 6. Brigades check (Bucket 5)
    if (Array.isArray(sourceDef.brigades) && sourceDef.brigades.length > 0) {
      const srcBrigades = Array.isArray(sourceCard.Brigades)
        ? sourceCard.Brigades.map((b) => b.toLowerCase())
        : (sourceCard.Brigade ? [sourceCard.Brigade.toLowerCase()] : []);
      if (!sourceDef.brigades.some((b) => srcBrigades.includes(String(b).toLowerCase()))) {
        return false;
      }
    }

    // 7. Card titles check (Bucket 6)
    if (Array.isArray(sourceDef.card_titles) && sourceDef.card_titles.length > 0) {
      const cardName = String(sourceCard.Name || sourceCard.card_name || "").toLowerCase();
      const hasTitleMatch = sourceDef.card_titles.some((t) => {
        const titleLower = String(t).toLowerCase().trim();
        return cardName.includes(titleLower) || titleLower.includes(cardName);
      });
      if (!hasTitleMatch) return false;
    }

    // 8. Identifiers & ORDIR descriptors check (Bucket 2: Subtypes, Nationalities, Roles)
    if (Array.isArray(sourceDef.identifiers) && sourceDef.identifiers.length > 0) {
      const srcIdent = String(sourceCard.Identifier || "").toLowerCase();
      const srcOrdirList = Array.isArray(sourceCard.ORDIR) ? sourceCard.ORDIR : [];
      const srcOrdir = srcOrdirList.join(" ").toLowerCase();
      const srcClass = String(sourceCard.Class || "").toLowerCase();
      const hasMatch = sourceDef.identifiers.some((id) => {
        const needle = String(id).trim().toLowerCase();
        if (!needle) return false;

        // Official REG Rule: All Characters are Human unless identified as an Angel, Demon, or Animal
        if (needle === "human") {
          const srcType = String(sourceCard.Type || sourceCard.inGameType || "").toLowerCase();
          const isChar = srcType.includes("hero") || srcType.includes("character") || srcType.includes("ec") ||
            Boolean(sourceCard.IsCharacter) || Boolean(sourceCard.IsHero);
          if (!isChar) return false;
          const nonHuman = ["angel", "demon", "animal"];
          return !nonHuman.some((nh) => srcIdent.includes(nh) || srcOrdir.includes(nh) || srcClass.includes(nh));
        }

        const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i");
        return regex.test(srcIdent) || regex.test(srcOrdir) || regex.test(srcClass) ||
          srcOrdirList.some((item) => String(item).trim().toLowerCase() === needle);
      });
      if (!hasMatch) return false;
    }

    // 9. Stat filters check on source card
    if (Array.isArray(sourceDef.stat_filters) && sourceDef.stat_filters.length > 0) {
      const { StatFilterEvaluator } = require("./StatFilterEvaluator");
      if (!StatFilterEvaluator.matchesStatFilters(sourceCard, sourceDef.stat_filters, { targetCard })) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks whether targetCard is immune to or protected from sourceCard and/or an action type.
   *
   * @param {object} targetCard Card being targeted or affected.
   * @param {object} [sourceCard] Source card executing the ability or attack.
   * @param {string} [actionType=""] Action type being executed (e.g. "discard", "band", "modify_numbers").
   * @returns {boolean} True if targetCard is protected or immune.
   */
  static isProtected(targetCard, sourceCard, actionType = "") {
    if (!targetCard) return false;

    const isImmune = Boolean(targetCard.isImmune);
    const isProtected = Boolean(targetCard.isProtected);

    if (!isImmune && !isProtected && !targetCard._protection) {
      return false;
    }

    // If no specific sourceCard is provided, general immune/protected flag holds
    if (!sourceCard) {
      return true;
    }

    const prot = targetCard._protection || {};

    // 1. Exception actions override protection (e.g. "except discard")
    if (actionType && Array.isArray(prot.except_actions) && prot.except_actions.includes(actionType)) {
      return false;
    }

    const harm = this.isHarmful(targetCard, sourceCard);
    const targetController = targetCard.controllerId || targetCard.ownerId;
    const sourceController = sourceCard.controllerId || sourceCard.ownerId;
    const isOpponent = Boolean(targetController && sourceController && targetController !== sourceController);

    // 2. Complete card immunity (all_cards: true)
    if (prot.all_cards === true && (isOpponent || harm)) {
      return true;
    }

    // 3. Complete ability immunity (all_abilities: true)
    if (prot.all_abilities === true && (isOpponent || harm)) {
      return true;
    }

    // 4. Card sources matching (structured TargetSelector[] filter)
    if (Array.isArray(prot.card_sources) && prot.card_sources.length > 0) {
      const matchesAnySource = prot.card_sources.some((cs) => this.matchesSource(sourceCard, cs, targetCard));
      if (!matchesAnySource) {
        return false;
      }
      // If specific actions are defined alongside card_sources, also verify action
      if (Array.isArray(prot.actions) && prot.actions.length > 0 && actionType) {
        return prot.actions.includes(actionType) || (prot.actions.includes("harm") && harm);
      }
      return true;
    }

    // 5. Action-specific protection (e.g. protect from discard, capture, negate, harm)
    const hasSpecificActions = Array.isArray(prot.actions) && prot.actions.length > 0;
    if (hasSpecificActions) {
      const actionMatches = Boolean(
        actionType && (prot.actions.includes(actionType) || (prot.actions.includes("harm") && harm))
      );
      if (actionMatches) {
        if (prot.opponent || prot.from_harm || prot.harm) {
          if (isOpponent || harm) return true;
        } else {
          return true;
        }
      }
      if (!prot.harm && !prot.from_harm && (!prot.alignments || prot.alignments.length === 0) && (!prot.brigades || prot.brigades.length === 0) && !prot.opponent) {
        return false;
      }
    }

    // 6. Protection from "harm" or "negative effect" (REG line 3889ff)
    const protectsFromHarm =
      prot.from_harm === true ||
      prot.harm === true ||
      prot.negative_effect === true ||
      (targetCard.protectionReason || "").toLowerCase().includes("harm");
    if (protectsFromHarm && harm) {
      return true;
    }

    // 7. Protection from specific alignments
    if (Array.isArray(prot.alignments) && prot.alignments.length > 0) {
      const srcAlign = (sourceCard.inGameAlignment || sourceCard.Alignment || "").toString().toLowerCase();
      if (prot.alignments.some((a) => srcAlign.includes(String(a).toLowerCase()))) {
        return true;
      }
    }

    // 8. Protection from specific brigades
    if (Array.isArray(prot.brigades) && prot.brigades.length > 0) {
      const srcBrigades = Array.isArray(sourceCard.Brigades)
        ? sourceCard.Brigades.map((b) => b.toLowerCase())
        : (sourceCard.Brigade ? [sourceCard.Brigade.toLowerCase()] : []);
      if (prot.brigades.some((b) => srcBrigades.includes(String(b).toLowerCase()))) {
        return true;
      }
    }

    // 9. Protection from opponent's cards in general
    if (prot.opponent === true && isOpponent) {
      return true;
    }

    // 10. Generic immunity / protection defaults to protecting against opponent's harm
    if (!hasSpecificActions && (isImmune || isProtected) && harm) {
      return true;
    }

    return false;
  }

  /**
   * Checks whether a whole player zone or pile is protected from actions executed by sourceCard.
   *
   * @param {object} room Active room instance.
   * @param {object} targetPlayer Player owning the zone.
   * @param {string} zone Zone name (e.g. "deck", "hand", "reserve", "discard").
   * @param {object} [sourceCard] Card attempting the action.
   * @param {string} [actionType=""] Action being performed.
   * @returns {boolean} True if the zone/pile is protected.
   */
  static isZoneProtected(room, targetPlayer, zone, sourceCard, actionType = "") {
    if (!targetPlayer || !zone || !sourceCard) return false;

    // Opponent check
    const isOpponent = (sourceCard.controllerId || sourceCard.ownerId) !== targetPlayer.sessionId;
    if (!isOpponent) return false;

    const normalizedZone = zone.toLowerCase().replace(/_pile$/, "");
    const inPlayCards = [
      ...(targetPlayer.territory || []),
      ...((room?.state?.battlefield || []).filter((c) => (c.controllerId || c.ownerId) === targetPlayer.sessionId)),
    ];

    for (const card of inPlayCards) {
      const prot = card._zoneProtection || card._protection;
      if (!prot) continue;

      const scopes = Array.isArray(prot.scope) ? prot.scope : (prot.scope ? [prot.scope] : []);
      const matchesZone = scopes.some((s) => {
        const norm = String(s).toLowerCase().replace(/_pile$/, "");
        return norm === normalizedZone || (norm === "in_play" && (normalizedZone === "territory" || normalizedZone === "battlefield"));
      });

      if (matchesZone) {
        if (this.isProtected(card, sourceCard, actionType)) {
          return true;
        }
      }
    }

    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ProtectionService };
}
