// server/src/ast/AdvantageEvaluator.js
const { ZONES } = require("../../../shared/zones");
const { matchesTargetType } = require("../../../shared/cardHierarchy");
const { SideAttributeEvaluator } = require("../../../shared/rules/SideAttributeEvaluator");
const { BattleCharacterClassifier } = require("../services/BattleCharacterClassifier");
const { TargetSelectionService } = require("./TargetSelectionService");

/**
 * Shared rule evaluator for Redemption card-advantage comparisons:
 * board_advantage, play_advantage, redeemed_soul_advantage, and lost_soul_advantage.
 */
class AdvantageEvaluator {
  /**
   * Determines whether a card currently counts as an unrescued Lost Soul
   * (including captured humans in Land of Bondage, excluding Redeemed Souls in LoR).
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if card counts as a Lost Soul.
   */
  static isLostSoulCard(card) {
    if (!card || card.zone === ZONES.LAND_OF_REDEMPTION) {
      return false;
    }
    const activeType = card.inGameType || card.Type || "";
    if (
      card.isLostSoul ||
      matchesTargetType(card, "lost_soul", activeType) ||
      /lost\s*soul/i.test(String(activeType))
    ) {
      return true;
    }
    if (card.zone === ZONES.LAND_OF_BONDAGE) {
      // REG line 3504: Captured non-humans are not Lost Souls in any location
      return SideAttributeEvaluator.resolveIsHuman(card) !== false;
    }
    return false;
  }

  /**
   * Determines whether a card is a Lost Soul or Redeemed Soul (excluded from non-soul advantages).
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if card is a Lost Soul or Redeemed Soul.
   */
  static isSoulCard(card) {
    return Boolean(card && (card.zone === ZONES.LAND_OF_REDEMPTION || this.isLostSoulCard(card)));
  }

  /**
   * Counts cards belonging to a player across REG board or in-play zones, optionally filtered by selector.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} player Target player state.
   * @param {object} [options={}] Counting options.
   * @param {boolean} [options.includeOutOfPlayBoard=true] Include set_aside and land_of_redemption (Board Advantage).
   * @param {object|null} [options.selector=null] Optional AST selector filter.
   * @returns {number} Matching card count.
   */
  static countPlayerCards(room, player, { includeOutOfPlayBoard = true, selector = null } = {}) {
    if (!player) return 0;
    const pid = player.sessionId || player.id;
    const targetTypeNorm = String(selector?.target_type || "").toLowerCase();
    const excludeSouls = !["lost_soul", "redeemed_soul"].includes(targetTypeNorm);

    const hasSelectorScopes = Array.isArray(selector?.scope) && selector.scope.length > 0;
    const zoneNames = this._resolveZoneList(selector?.scope, includeOutOfPlayBoard);
    const seenIds = new Set();
    let count = 0;

    const inspectCard = (card) => {
      if (!card) return;
      if (card.id) {
        if (seenIds.has(card.id)) return;
        seenIds.add(card.id);
      }
      if (excludeSouls && this.isSoulCard(card)) return;
      if (selector && !TargetSelectionService.matchesFilter(card, { ...selector, zone_owner: "controller" }, { room, actionType: "condition_check" })) {
        return;
      }
      count++;
    };

    for (const zName of zoneNames) {
      if (zName === ZONES.BATTLEFIELD) {
        const bfCards = (room?.state?.battlefield || []).filter(
          (c) => (c?.controllerId || c?.ownerId) === pid
        );
        bfCards.forEach(inspectCard);
      } else {
        const zoneArr = player[zName];
        if (zoneArr && typeof zoneArr.forEach === "function") {
          zoneArr.forEach(inspectCard);
        } else if (Array.isArray(zoneArr)) {
          zoneArr.forEach(inspectCard);
        }
      }
    }

    // When explicit selector omits artifact_pile from "in_play", include player.artifact if any non-soul artifacts exist
    if (
      hasSelectorScopes &&
      selector.scope.some((s) => String(s).toLowerCase() === "in_play") &&
      !zoneNames.includes(ZONES.ARTIFACT) &&
      player[ZONES.ARTIFACT]
    ) {
      const artArr = Array.from(player[ZONES.ARTIFACT]);
      artArr.forEach(inspectCard);
    }

    return count;
  }

  /**
   * Resolves concrete zone names for board or play advantage counting.
   *
   * @private
   */
  static _resolveZoneList(scopeInput, includeOutOfPlayBoard) {
    if (Array.isArray(scopeInput) && scopeInput.length > 0) {
      const resolved = new Set(TargetSelectionService._resolveTargetZones(scopeInput));
      if (scopeInput.some((s) => String(s).toLowerCase() === "in_play")) {
        resolved.add(ZONES.ARTIFACT);
      }
      return Array.from(resolved);
    }
    const zones = [ZONES.TERRITORY, ZONES.BATTLEFIELD, ZONES.ARTIFACT];
    if (includeOutOfPlayBoard) {
      zones.push(ZONES.SET_ASIDE, ZONES.LAND_OF_REDEMPTION);
    }
    return zones;
  }

  /**
   * Counts Redeemed Souls for a player using both the numeric counter and Land of Redemption zone.
   *
   * @param {object} player Target player state.
   * @returns {number} Redeemed Soul count.
   */
  static countRedeemedSouls(player) {
    if (!player) return 0;
    const numericSouls = Number(player.redeemedSouls || 0);
    const zoneSouls = player[ZONES.LAND_OF_REDEMPTION]?.length || 0;
    return Math.max(numericSouls, zoneSouls);
  }

  /**
   * Counts unrescued Lost Souls controlled by a player across Land of Bondage and play/set-aside zones.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} player Target player state.
   * @returns {number} Lost Soul count.
   */
  static countLostSouls(room, player) {
    if (!player) return 0;
    const pid = player.sessionId || player.id;
    const seenIds = new Set();
    let count = 0;

    const inspect = (card) => {
      if (!card) return;
      if (card.id) {
        if (seenIds.has(card.id)) return;
        seenIds.add(card.id);
      }
      if (this.isLostSoulCard(card)) {
        count++;
      }
    };

    if (player[ZONES.LAND_OF_BONDAGE]) {
      Array.from(player[ZONES.LAND_OF_BONDAGE]).forEach(inspect);
    }
    if (player[ZONES.TERRITORY]) {
      Array.from(player[ZONES.TERRITORY]).forEach(inspect);
    }
    if (player[ZONES.SET_ASIDE]) {
      Array.from(player[ZONES.SET_ASIDE]).forEach(inspect);
    }
    if (room?.state?.battlefield) {
      Array.from(room.state.battlefield)
        .filter((c) => (c?.controllerId || c?.ownerId) === pid)
        .forEach(inspect);
    }

    return count;
  }

  /**
   * Counts Enhancements played by a player during the current turn (tracked plays + active battlefield enhancements).
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} player Target player state.
   * @returns {number} Enhancements played this turn.
   */
  static countEnhancementsPlayedThisTurn(room, player) {
    if (!player) return 0;
    const pid = player.sessionId || player.id;
    const trackedCount = Number(room?._turnPlayedEnhancements?.[pid] || 0);
    const bfEnhCount = room?.state?.battlefield
      ? Array.from(room.state.battlefield).filter((c) => {
          if ((c?.controllerId || c?.ownerId) !== pid) return false;
          const activeType = c.inGameType || c.Type || "";
          return (
            BattleCharacterClassifier.isGoodEnhancement(c) ||
            BattleCharacterClassifier.isEvilEnhancement(c) ||
            matchesTargetType(c, "enhancement", activeType)
          );
        }).length
      : 0;
    return Math.max(trackedCount, bfEnhCount);
  }

  /**
   * Evaluates controller vs. opponent count across AST advantage condition variants.
   *
   * @param {number} controllerCount Count for acting player.
   * @param {number} opponentCount Count for opponent player.
   * @param {object} condition AST condition node.
   * @param {Function} compareNumbers Numeric comparison callback.
   * @param {object} [options={}] Evaluation options.
   * @param {boolean} [options.allowUndefinedAsOpponent=false] Treat bare `==` without value/selector as opponent advantage.
   * @returns {boolean} Whether advantage condition is satisfied.
   */
  static evaluateAdvantageComparison(
    controllerCount,
    opponentCount,
    condition,
    compareNumbers,
    { allowUndefinedAsOpponent = false } = {}
  ) {
    const { operator, value, selector } = condition || {};
    const owner = selector?.zone_owner;

    if (value === "opponent") {
      const oppHasMore = opponentCount > controllerCount;
      return operator === "!=" ? !oppHasMore : oppHasMore;
    }
    if (value === "controller") {
      const ctrlHasMore = controllerCount > opponentCount;
      return operator === "!=" ? !ctrlHasMore : ctrlHasMore;
    }
    if (typeof value === "boolean") {
      const hasAdv = owner === "opponent"
        ? opponentCount > controllerCount
        : controllerCount > opponentCount;
      const expected = operator === "!=" ? !value : value;
      return hasAdv === expected;
    }
    if (typeof value === "number") {
      if (owner === "opponent" && (operator === ">" || operator === ">=")) {
        return compareNumbers(opponentCount - controllerCount, operator, value);
      }
      return compareNumbers(controllerCount - opponentCount, operator || "==", value);
    }

    // Undefined value variants
    if (owner === "both" && operator === ">") {
      return controllerCount !== opponentCount;
    }
    if (owner === "opponent" && (!operator || operator === "==" || operator === ">")) {
      return opponentCount > controllerCount;
    }
    if (owner === "controller" && (!operator || operator === "==" || operator === ">")) {
      return controllerCount > opponentCount;
    }
    if (!selector && operator === "==" && allowUndefinedAsOpponent) {
      return opponentCount > controllerCount;
    }
    if (operator === ">") return controllerCount > opponentCount;
    if (operator === "<") return controllerCount < opponentCount;
    if (operator === ">=") return controllerCount >= opponentCount;
    if (operator === "<=") return controllerCount <= opponentCount;
    if (operator === "!=") return controllerCount !== opponentCount;
    return controllerCount === opponentCount;
  }
}

module.exports = { AdvantageEvaluator };
