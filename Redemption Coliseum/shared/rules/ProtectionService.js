/**
 * @module shared/rules/ProtectionService
 * Evaluator for immune and protect rules in accordance with official
 * Redemption REG v11.0.0 guidelines (lines 1723ff and Harm line 3889ff).
 */

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
    const harm = this.isHarmful(targetCard, sourceCard);

    // 1. Protection from "harm" or "negative effect" (REG line 3889ff)
    const protectsFromHarm =
      prot.harm === true ||
      prot.negative_effect === true ||
      (targetCard.protectionReason || "").toLowerCase().includes("harm");
    if (protectsFromHarm && harm) {
      return true;
    }

    // 2. Protection from specific alignments
    if (Array.isArray(prot.alignments) && prot.alignments.length > 0) {
      const srcAlign = (sourceCard.inGameAlignment || sourceCard.Alignment || "").toString().toLowerCase();
      if (prot.alignments.some((a) => srcAlign.includes(String(a).toLowerCase()))) {
        return true;
      }
    }

    // 3. Protection from specific brigades
    if (Array.isArray(prot.brigades) && prot.brigades.length > 0) {
      const srcBrigades = Array.isArray(sourceCard.Brigades)
        ? sourceCard.Brigades.map((b) => b.toLowerCase())
        : (sourceCard.Brigade ? [sourceCard.Brigade.toLowerCase()] : []);
      if (prot.brigades.some((b) => srcBrigades.includes(String(b).toLowerCase()))) {
        return true;
      }
    }

    // 4. Protection from opponent's cards in general
    const targetController = targetCard.controllerId || targetCard.ownerId;
    const sourceController = sourceCard.controllerId || sourceCard.ownerId;
    if (prot.opponent === true && targetController && sourceController && targetController !== sourceController) {
      return true;
    }

    // 5. Protection from specific actions (e.g. "band", "discard", "conversion")
    if (Array.isArray(prot.actions) && actionType && prot.actions.includes(actionType)) {
      return true;
    }

    // 6. Generic immunity / protection defaults to protecting against opponent's harm
    if ((isImmune || isProtected) && harm) {
      return true;
    }

    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ProtectionService };
}
