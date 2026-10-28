/**
 * @module shared/rules/CombatRules
 * Pure, deterministic combat and battlefield rules engine for Redemption Coliseum.
 */

import { ZONES } from "../zones.js";
import { PHASES } from "../phases.js";
import { CombatClassifier } from "./CombatClassifier.js";

/**
 * Retrieves counter value safely from card schema or plain object.
 * @param {object} card
 * @param {string} key
 * @returns {number}
 */
function _getCounter(card, key) {
  if (!card || !card.counters) return 0;
  if (typeof card.counters.get === "function") return card.counters.get(key) || 0;
  return card.counters[key] || 0;
}

export class CombatRules {
  static isDominant(card) { return CombatClassifier.isDominant(card); }
  static isGoodEnhancement(card) { return CombatClassifier.isGoodEnhancement(card); }
  static isEvilEnhancement(card) { return CombatClassifier.isEvilEnhancement(card); }
  static isHero(card) { return CombatClassifier.isHero(card); }
  static isEvilCharacter(card) { return CombatClassifier.isEvilCharacter(card); }
  static getBrigades(card) { return CombatClassifier.getBrigades(card); }
  static canEnhancementMatchCharacter(enh, char) { return CombatClassifier.canEnhancementMatchCharacter(enh, char); }

  static specialInitiativeRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    const targetPlayerId = ctx.targetPlayerId;
    const isSpecialInitiativeActive = Boolean(
      ctx.state?.battle?.specialInitiativePlayerId && ctx.state.battle.specialInitiativePlayerId === targetPlayerId
    );
    if (isSpecialInitiativeActive && !isArena) {
      const card = ctx.effectiveCard || ctx.card;
      const isEnhancement = CombatClassifier.isGoodEnhancement(card) || CombatClassifier.isEvilEnhancement(card);
      const isDom = CombatClassifier.isDominant(card);
      if (!isEnhancement || isDom || ctx.toZone !== ZONES.BATTLEFIELD) {
        return { valid: false, error: "Only Enhancements in Special Initiative!" };
      }
    }
    return { valid: true };
  }

  static chronicleLockRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    const isPlayingCard = ctx.toZone === ZONES.BATTLEFIELD || (ctx.fromZone === ZONES.HAND && ctx.toZone !== ZONES.DISCARD);
    const isSpecialInitiativeActive = Boolean(
      ctx.state?.battle?.specialInitiativePlayerId && ctx.state.battle.specialInitiativePlayerId === ctx.targetPlayerId
    );
    if (isPlayingCard && ctx.state?.currentPhase === PHASES.BATTLE && !isArena && !ctx.options?.isAbilityAction && !isSpecialInitiativeActive) {
      const chronicleItems = ctx.state?.effectChronicle?.items || [];
      if (chronicleItems.length > 0) {
        return { valid: false, error: "Abilities must resolve first!" };
      }
    }
    return { valid: true };
  }

  static phaseLockRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      if (ctx.state?.currentPhase !== PHASES.BATTLE) {
        return { valid: false, error: "Only allowed during Battle!" };
      }
    }
    return { valid: true };
  }

  static conditionGuardRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      const card = ctx.card;
      if (!card) return { valid: true };
      if (Boolean(card.isParalyzed || _getCounter(card, "paralyze") > 0)) {
        return { valid: false, error: "Paralyzed cards cannot enter the Field of Battle!" };
      }
      if (Boolean(card.isSetAside || _getCounter(card, "setaside") > 0)) {
        return { valid: false, error: "Cards in Set Aside cannot enter the Field of Battle!" };
      }
    }
    return { valid: true };
  }

  static alignmentRoleRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      const card = ctx.effectiveCard || ctx.card;
      const isHero = CombatClassifier.isHero(card);
      const isEvilChar = CombatClassifier.isEvilCharacter(card);
      const isGoodEnh = CombatClassifier.isGoodEnhancement(card);
      const isEvilEnh = CombatClassifier.isEvilEnhancement(card);
      const isAttacker = ctx.targetPlayerId === ctx.state?.activePlayer;

      if (isAttacker) {
        if (isEvilEnh || isEvilChar) return { valid: false, error: "Evil cards cannot attack!" };
        if (!isHero && !isGoodEnh) return { valid: false, error: "Invalid card for battle!" };
      } else {
        if (isGoodEnh || isHero) return { valid: false, error: "Good cards cannot block!" };
        if (!isEvilChar && !isEvilEnh) return { valid: false, error: "Invalid card for battle!" };
      }
    }
    return { valid: true };
  }

  static blockerGateRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      const isAttacker = ctx.targetPlayerId === ctx.state?.activePlayer;
      const card = ctx.effectiveCard || ctx.card;
      if (!isAttacker && CombatClassifier.isEvilCharacter(card) && ctx.fromZone !== ZONES.BATTLEFIELD) {
        const heroesInBattle = (ctx.state?.battlefield || []).filter(
          (c) => c.controllerId === ctx.state?.activePlayer && CombatClassifier.isHero(c)
        );
        if (heroesInBattle.length === 0) {
          return { valid: false, error: "No Hero in battle to block!" };
        }
      }
    }
    return { valid: true };
  }

  static brigadeMatchRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      const isAttacker = ctx.targetPlayerId === ctx.state?.activePlayer;
      const card = ctx.effectiveCard || ctx.card;
      if (isAttacker && CombatClassifier.isGoodEnhancement(card) && ctx.fromZone !== ZONES.BATTLEFIELD) {
        const heroes = (ctx.state?.battlefield || []).filter((c) => c.controllerId === ctx.state?.activePlayer && CombatClassifier.isHero(c));
        if (heroes.length === 0) return { valid: false, error: "No Hero in battle!" };
        if (!heroes.some((h) => CombatClassifier.canEnhancementMatchCharacter(card, h))) {
          return { valid: false, error: "Brigade mismatch!" };
        }
      }
      if (!isAttacker && CombatClassifier.isEvilEnhancement(card) && ctx.fromZone !== ZONES.BATTLEFIELD) {
        const ecs = (ctx.state?.battlefield || []).filter((c) => c.controllerId !== ctx.state?.activePlayer && CombatClassifier.isEvilCharacter(c));
        if (ecs.length === 0) return { valid: false, error: "No Evil Character in battle!" };
        if (!ecs.some((ec) => CombatClassifier.canEnhancementMatchCharacter(card, ec))) {
          return { valid: false, error: "Brigade mismatch!" };
        }
      }
    }
    return { valid: true };
  }

  static initiativeRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena) {
      const card = ctx.effectiveCard || ctx.card;
      if (CombatClassifier.isDominant(card) || ctx.fromZone === ZONES.BATTLEFIELD) return { valid: true };

      const isAttacker = ctx.targetPlayerId === ctx.state?.activePlayer;
      const isSpecialInit = Boolean(ctx.state?.battle?.specialInitiativePlayerId === ctx.targetPlayerId);
      const hasActiveEffect = Boolean(
        ctx.options?.isAbilityAction ||
        card.isBanded ||
        ctx.options?.isBanded ||
        (ctx.state?.effectChronicle?.isResolving && ctx.state.effectChronicle.priorityPlayerId === ctx.targetPlayerId)
      );
      const hasRegInit = ctx.state?.battle?.initiativePlayerId === ctx.targetPlayerId;

      if (isAttacker) {
        const heroes = (ctx.state?.battlefield || []).filter((c) => c.controllerId === ctx.state?.activePlayer && CombatClassifier.isHero(c));
        const isInitialHero = CombatClassifier.isHero(card) && heroes.length === 0;
        if (!isInitialHero && !hasRegInit && !isSpecialInit && !hasActiveEffect) {
          return { valid: false, error: "You do not have initiative!" };
        }
      } else {
        const ecs = (ctx.state?.battlefield || []).filter((c) => c.controllerId !== ctx.state?.activePlayer && CombatClassifier.isEvilCharacter(c));
        const isInitialBlocker = CombatClassifier.isEvilCharacter(card) && ecs.length === 0;
        if (!isInitialBlocker && !hasRegInit && !isSpecialInit && !hasActiveEffect) {
          return { valid: false, error: "You do not have initiative!" };
        }
      }
    }
    return { valid: true };
  }

  static bandingRule(ctx) {
    const isArena = Boolean(ctx.isArena ?? (ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode));
    if (ctx.toZone === ZONES.BATTLEFIELD && !isArena && ctx.fromZone !== ZONES.BATTLEFIELD) {
      const card = ctx.effectiveCard || ctx.card;
      const isChar = CombatClassifier.isHero(card) || CombatClassifier.isEvilCharacter(card);

      if (isChar) {
        const isAttacker = ctx.targetPlayerId === ctx.state?.activePlayer;
        const currentBattleChars = (ctx.state?.battlefield || []).filter((c) =>
          isAttacker
            ? c.controllerId === ctx.state?.activePlayer && CombatClassifier.isHero(c)
            : c.controllerId !== ctx.state?.activePlayer && CombatClassifier.isEvilCharacter(c)
        );

        if (currentBattleChars.length > 0) {
          const isBandedMove = Boolean(
            card.isBanded || ctx.options?.isBanded || ctx.options?.isAbilityAction
          );
          if (!isBandedMove) {
            return { valid: false, error: "Additional characters in battle must be banded!" };
          }
        }
      }
    }
    return { valid: true };
  }

  static validate(ctx) {
    const rules = [
      this.specialInitiativeRule,
      this.chronicleLockRule,
      this.phaseLockRule,
      this.conditionGuardRule,
      this.alignmentRoleRule,
      this.blockerGateRule,
      this.brigadeMatchRule,
      this.initiativeRule,
    ];
    for (const rule of rules) {
      const res = rule.call(this, ctx);
      if (!res.valid) return res;
    }
    return { valid: true };
  }
}

export const BandingRule = CombatRules.bandingRule.bind(CombatRules);

export const PhaseLockRule = CombatRules.phaseLockRule.bind(CombatRules);
export const SpecialInitiativeRule = CombatRules.specialInitiativeRule.bind(CombatRules);
export const ChronicleLockRule = CombatRules.chronicleLockRule.bind(CombatRules);
export const ConditionGuardRule = CombatRules.conditionGuardRule.bind(CombatRules);
export const AlignmentRoleRule = CombatRules.alignmentRoleRule.bind(CombatRules);
export const BlockerGateRule = CombatRules.blockerGateRule.bind(CombatRules);
export const BrigadeMatchRule = CombatRules.brigadeMatchRule.bind(CombatRules);
export const InitiativeRule = CombatRules.initiativeRule.bind(CombatRules);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CombatRules,
    BandingRule,
    PhaseLockRule,
    SpecialInitiativeRule,
    ChronicleLockRule,
    ConditionGuardRule,
    AlignmentRoleRule,
    BlockerGateRule,
    BrigadeMatchRule,
    InitiativeRule,
  };
}
