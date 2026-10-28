/**
 * @module shared/BattleCalculator
 * Pure rule engine module for calculating cumulative battle numbers and determining
 * regular initiative in accordance with official Redemption REG v11.0.0 guidelines.
 */

const { BATTLE_STATE_REASON } = require("./battleConstants");
const { PHASES } = require("./phases");
const { ProtectionService } = require("./rules/ProtectionService");

class BattleCalculator {
  /**
   * Parses a numeric strength or toughness attribute from a card.
   * Handles string digits, negative modifiers, and falls back to 0 for non-numeric/empty values.
   *
   * @param {string|number|undefined|null} val Raw stat value.
   * @returns {number} Parsed integer stat.
   */
  static parseStat(val) {
    if (typeof val === "number") return Math.round(val);
    if (!val || typeof val !== "string") return 0;
    const parsed = parseInt(val.trim(), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Retrieves any dynamic stat modifier stored in card counters (e.g. "strength", "toughness").
   *
   * @param {object} card Card object.
   * @param {string} statKey Name of the stat ("strength" or "toughness").
   * @returns {number} Counter bonus or penalty.
   */
  static getCounterModifier(card, statKey) {
    if (!card || !card.counters) return 0;
    const lookup = (key) => {
      if (typeof card.counters.get === "function") {
        return card.counters.get(key);
      }
      return card.counters[key];
    };

    const direct = lookup(statKey);
    const mod = lookup(`${statKey}_mod`);
    let sum = 0;
    if (typeof direct === "number") sum += direct;
    if (typeof mod === "number") sum += mod;
    return sum;
  }

  /**
   * Computes the effective strength and toughness for an individual card.
   *
   * @param {object} card Card instance.
   * @returns {{ strength: number, toughness: number }} Effective card stats.
   */
  static getCardStats(card) {
    if (!card) return { strength: 0, toughness: 0 };
    const baseStr = this.parseStat(card.Strength);
    const baseTough = this.parseStat(card.Toughness);
    const modStr = this.getCounterModifier(card, "strength");
    const modTough = this.getCounterModifier(card, "toughness");

    return {
      strength: baseStr + modStr,
      toughness: baseTough + modTough,
    };
  }

  /**
   * Determines if a card counts as a character in battle.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if card is a character.
   */
  static isCharacter(card) {
    if (!card) return false;
    if (card.IsCharacter) return true;
    const typeStr = (card.inGameType || card.Type || "").toString().toLowerCase();
    return typeStr.includes("character") || typeStr.includes("hero") || typeStr === "ec";
  }

  /**
   * Computes the cumulative strength, toughness, and categorized cards for one side of battle.
   *
   * @param {Array<object>} battlefield List of cards on the battlefield.
   * @param {string} sidePlayerId Session ID of the player controlling this side.
   * @returns {object} Side statistics.
   */
  static calculateSide(battlefield, sidePlayerId) {
    if (!Array.isArray(battlefield) || !sidePlayerId) {
      return { strength: 0, toughness: 0, characters: [], enhancements: [], totalCards: 0 };
    }

    const sideCards = battlefield.filter(
      (c) => (c.controllerId || c.originalOwnerId) === sidePlayerId
    );

    let totalStrength = 0;
    let totalToughness = 0;
    const characters = [];
    const enhancements = [];

    for (const card of sideCards) {
      const stats = this.getCardStats(card);
      totalStrength += stats.strength;
      totalToughness += stats.toughness;

      if (this.isCharacter(card)) {
        characters.push(card);
      } else {
        enhancements.push(card);
      }
    }

    return {
      strength: totalStrength,
      toughness: totalToughness,
      characters,
      enhancements,
      totalCards: sideCards.length,
    };
  }

  /**
   * Calculates effective offensive strength considering immunity/protect (REG line 1733).
   *
   * @param {object} attackSide Side attacking.
   * @param {object} defendSide Side defending.
   * @returns {number} Effective offensive strength.
   */
  static getEffectiveStrength(attackSide, defendSide) {
    let effective = 0;
    const allCards = [...attackSide.characters, ...attackSide.enhancements];
    for (const card of allCards) {
      const isBlocked = defendSide.characters.length > 0 &&
        defendSide.characters.every((def) => ProtectionService.isProtected(def, card));
      if (!isBlocked) {
        effective += this.getCardStats(card).strength;
      }
    }
    return effective;
  }

  /**
   * Evaluates the complete battle state, cumulative numbers, and regular initiative.
   *
   * @param {object} params Evaluation parameters.
   * @param {Array<object>} params.battlefield Array of cards on battlefield.
   * @param {string} params.activePlayerId Rescuer / attacker session ID.
   * @param {string} params.defenderPlayerId Blocker / defender session ID.
   * @param {string} [params.lastBattleCardPlayerId=""] Player who played the last card in battle.
   * @param {string} [params.currentPhase=PHASES.BATTLE] Current game phase.
   * @returns {object} Full battle evaluation result.
   */
  static evaluateBattle({
    battlefield,
    activePlayerId,
    defenderPlayerId,
    lastBattleCardPlayerId = "",
    currentPhase = PHASES.BATTLE,
    blockOccurred = false,
  }) {
    const emptyResult = (reason, description) => ({
      rescuer: { strength: 0, toughness: 0, characters: [], enhancements: [], totalCards: 0 },
      blocker: { strength: 0, toughness: 0, characters: [], enhancements: [], totalCards: 0 },
      initiativePlayerId: "",
      stateReason: reason,
      description,
    });

    if (currentPhase !== PHASES.BATTLE) {
      return emptyResult(BATTLE_STATE_REASON.NO_BATTLE, "Outside Battle Phase");
    }

    const rescuer = this.calculateSide(battlefield, activePlayerId);
    const blocker = this.calculateSide(battlefield, defenderPlayerId);

    // 1. Both sides empty (awaiting initial character entry in battle phase)
    if (rescuer.totalCards === 0 && blocker.totalCards === 0) {
      return emptyResult(BATTLE_STATE_REASON.NO_BATTLE, "Battle Phase: Awaiting Attacker");
    }

    // 2. Rescuer has characters, Blocker has none (unblocked attack or blocker was removed)
    if (rescuer.characters.length > 0 && blocker.characters.length === 0) {
      if (blockOccurred) {
        return {
          rescuer,
          blocker,
          initiativePlayerId: "",
          stateReason: BATTLE_STATE_REASON.RESCUER_UNOPPOSED,
          description: "Blocker Removed (Rescue Successful)",
        };
      }
      return {
        rescuer,
        blocker,
        initiativePlayerId: "",
        stateReason: BATTLE_STATE_REASON.UNBLOCKED,
        description: "Rescue Attempt Unblocked (Awaiting Blocker)",
      };
    }

    // 3. Blocker has characters, Rescuer has none (all heroes removed from battle)
    if (rescuer.characters.length === 0 && blocker.characters.length > 0) {
      return {
        rescuer,
        blocker,
        initiativePlayerId: "",
        stateReason: BATTLE_STATE_REASON.BLOCKER_UNOPPOSED,
        description: "Hero Removed (Rescue Failed)",
      };
    }

    // 4. Opposed battle: Both sides have characters! Evaluate numbers comparison
    if (rescuer.characters.length > 0 && blocker.characters.length > 0) {
      const rescuerOffensiveStrength = this.getEffectiveStrength(rescuer, blocker);
      const blockerOffensiveStrength = this.getEffectiveStrength(blocker, rescuer);

      const rescuerDefeatsBlocker = rescuerOffensiveStrength >= blocker.toughness;
      const blockerDefeatsRescuer = blockerOffensiveStrength >= rescuer.toughness;

      // 4a. Mutual Destruction (Both reach opposing toughness)
      if (rescuerDefeatsBlocker && blockerDefeatsRescuer) {
        const nonLastPlayerId =
          lastBattleCardPlayerId === activePlayerId
            ? defenderPlayerId
            : activePlayerId;

        return {
          rescuer,
          blocker,
          initiativePlayerId: nonLastPlayerId,
          stateReason: BATTLE_STATE_REASON.MUTUAL_DESTRUCTION,
          description: "Initiative: Mutual Destruction (Opponent played last card)",
        };
      }

      // 4b. Stalemate (Neither side reaches opposing toughness)
      if (!rescuerDefeatsBlocker && !blockerDefeatsRescuer) {
        const nonLastPlayerId =
          lastBattleCardPlayerId === activePlayerId
            ? defenderPlayerId
            : activePlayerId;

        return {
          rescuer,
          blocker,
          initiativePlayerId: nonLastPlayerId,
          stateReason: BATTLE_STATE_REASON.STALEMATE,
          description: "Initiative: Stalemate (Opponent played last card)",
        };
      }

      // 4c. Rescuer winning, Blocker losing -> Blocker receives initiative
      if (rescuerDefeatsBlocker && !blockerDefeatsRescuer) {
        return {
          rescuer,
          blocker,
          initiativePlayerId: defenderPlayerId,
          stateReason: BATTLE_STATE_REASON.LOSING_NUMBERS,
          description: "Initiative: Blocker losing by numbers",
        };
      }

      // 4d. Blocker winning, Rescuer losing -> Rescuer receives initiative
      return {
        rescuer,
        blocker,
        initiativePlayerId: activePlayerId,
        stateReason: BATTLE_STATE_REASON.LOSING_NUMBERS,
        description: "Initiative: Rescuer losing by numbers",
      };
    }

    // Fallback if cards exist without characters (e.g. lingering cards)
    return {
      rescuer,
      blocker,
      initiativePlayerId: "",
      stateReason: BATTLE_STATE_REASON.NO_BATTLE,
      description: "Battle Phase: Incomplete combatants",
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BattleCalculator };
}
