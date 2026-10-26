/**
 * @module shared/rules/CombatClassifier
 * Card classification and brigade matching utility for game rules.
 */

import { CARD_TYPES, ALIGNMENTS } from "../card-constants.js";

/**
 * Normalizes type or alignment values to lowercase string.
 * @param {string|string[]} val
 * @returns {string}
 */
function _normalize(val) {
  if (Array.isArray(val)) return val.join(" ").toLowerCase();
  return typeof val === "string" ? val.toLowerCase() : "";
}

export class CombatClassifier {
  static isDominant(card) {
    if (!card) return false;
    const inGameType = _normalize(card.inGameType || card.Type);
    const identifier = _normalize(card.Identifier);
    const cardClass = _normalize(card.Class);
    return inGameType.includes("dominant") || identifier.includes("dominant") || cardClass.includes("dominant");
  }

  static isGoodEnhancement(card) {
    if (!card) return false;
    const inGameType = _normalize(card.inGameType || card.Type);
    const inGameAlign = _normalize(card.inGameAlignment || card.Alignment);
    if (inGameType.includes("good enhancement") || inGameType === CARD_TYPES.GE.toLowerCase()) return true;
    return inGameAlign === ALIGNMENTS.GOOD.toLowerCase() && Boolean(card.IsEnhancement || inGameType.includes("enhancement"));
  }

  static isEvilEnhancement(card) {
    if (!card) return false;
    const inGameType = _normalize(card.inGameType || card.Type);
    const inGameAlign = _normalize(card.inGameAlignment || card.Alignment);
    if (inGameType.includes("evil enhancement") || inGameType === CARD_TYPES.EE.toLowerCase()) return true;
    return inGameAlign === ALIGNMENTS.EVIL.toLowerCase() && Boolean(card.IsEnhancement || inGameType.includes("enhancement"));
  }

  static isHero(card) {
    if (!card || this.isGoodEnhancement(card) || this.isEvilEnhancement(card)) return false;
    const inGameType = _normalize(card.inGameType || card.Type);
    const inGameAlign = _normalize(card.inGameAlignment || card.Alignment);
    if (inGameType.includes("hero")) return true;
    return inGameAlign === ALIGNMENTS.GOOD.toLowerCase() && Boolean(card.IsCharacter || inGameType.includes("character"));
  }

  static isEvilCharacter(card) {
    if (!card || this.isGoodEnhancement(card) || this.isEvilEnhancement(card)) return false;
    const inGameType = _normalize(card.inGameType || card.Type);
    const inGameAlign = _normalize(card.inGameAlignment || card.Alignment);
    if (inGameType.includes("evil character") || inGameType === CARD_TYPES.EC.toLowerCase() || inGameType === "ec") return true;
    return inGameAlign === ALIGNMENTS.EVIL.toLowerCase() && Boolean(card.IsCharacter || inGameType.includes("character"));
  }

  static getBrigades(card) {
    if (!card) return [];
    if (Array.isArray(card.sides) && card.sides.length > 0 && (card.inGameAlignment || card.inGameType)) {
      const activeSide = card.sides.find((s) => {
        const alignMatch = card.inGameAlignment && String(s.Alignment || "").toLowerCase() === card.inGameAlignment.toLowerCase();
        const typeMatch = card.inGameType && String(s.Type || "").toLowerCase() === card.inGameType.toLowerCase();
        return alignMatch || typeMatch;
      });
      if (activeSide && (activeSide.Brigade || activeSide.Brigades)) {
        const sideRaw = activeSide.Brigade || activeSide.Brigades;
        return (Array.isArray(sideRaw) ? sideRaw : [sideRaw])
          .flatMap((b) => (typeof b === "string" ? b.split("/") : []))
          .map((b) => b.trim().toLowerCase()).filter(Boolean);
      }
    }
    const raw = card.Brigade || card.Brigades || [];
    const list = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("/") : []);
    return list.flatMap((b) => (typeof b === "string" ? b.split("/") : [])).map((b) => b.trim().toLowerCase()).filter(Boolean);
  }

  static canEnhancementMatchCharacter(enhancementCard, characterCard) {
    if (!enhancementCard || !characterCard) return false;
    const enhBrigades = this.getBrigades(enhancementCard);
    const charBrigades = this.getBrigades(characterCard);
    if (enhBrigades.length === 0 || charBrigades.length === 0) return true;
    if (enhBrigades.includes("multi") || enhBrigades.length > 1) return true;
    return enhBrigades.some((b) => charBrigades.includes(b));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CombatClassifier };
}
