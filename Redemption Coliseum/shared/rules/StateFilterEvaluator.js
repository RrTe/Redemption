/**
 * @module shared/rules/StateFilterEvaluator
 * Pure evaluator for AST TargetSelector `state_filters` (REG v11.1.0).
 */
const { ZONES } = require("../zones");
const { isCharacterSideType } = require("../cardHierarchy");
const { SideAttributeEvaluator } = require("./SideAttributeEvaluator");

const TURN_RUNTIME_FLAG_KEYS = {
  played_this_turn: "playedThisTurn",
  played_this_battle: "playedThisBattle",
  drawn_this_turn: "drawnThisTurn",
  entered_battle_this_turn: "enteredBattleThisTurn",
  first_played_this_battle: "firstPlayedThisBattle",
  first_played_this_turn: "firstPlayedThisTurn",
  next_played: "nextPlayed",
  last_played: "lastPlayed",
};

/**
 * Pure service evaluating structured `state_filters` on TargetSelector nodes.
 */
class StateFilterEvaluator {
  /**
   * Evaluates all `state_filters` against a card (logical AND).
   *
   * @param {object} card Candidate card instance.
   * @param {string[]} [stateFilters=[]] Array of canonical state_filter tokens.
   * @param {object} [context={}] Runtime evaluation context (`room`, `sourceCard`, `actingPlayer`).
   * @returns {boolean} True if all state predicates hold (or list is empty).
   */
  static matchesStateFilters(card, stateFilters = [], context = {}) {
    if (!card) return false;
    if (!Array.isArray(stateFilters) || stateFilters.length === 0) return true;

    for (let i = 0; i < stateFilters.length; i++) {
      if (!this.matchesSingleState(card, stateFilters[i], context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluates a single canonical state_filter token against a card.
   *
   * @param {object} card Candidate card instance.
   * @param {string} stateToken Canonical state_filter identifier.
   * @param {object} [context={}] Runtime evaluation context.
   * @returns {boolean} True if the state predicate is satisfied.
   */
  static matchesSingleState(card, stateToken, context = {}) {
    if (!card || !stateToken) return true;
    const token = String(stateToken).trim().toLowerCase();
    const room = context.room;
    const rawBattlefield = room?.state?.battlefield;
    const battlefield = rawBattlefield && typeof rawBattlefield.filter === "function" ? Array.from(rawBattlefield) : null;
    const isInBattle = card.zone === ZONES.BATTLEFIELD || Boolean(battlefield?.some((c) => c.id === card.id));
    const controllerId = card.controllerId || card.ownerId || "";
    const activePlayer = room?.state?.activePlayer || "";

    switch (token) {
      case "in_battle":
        return isInBattle;
      case "not_in_battle":
        return !isInBattle;
      case "attacking":
      case "rescuing":
        if (!isInBattle) return false;
        return activePlayer ? Boolean(controllerId && controllerId === activePlayer) : this._isGoodCharacterLike(card);
      case "blocking":
        if (!isInBattle) return false;
        return activePlayer ? Boolean(controllerId && controllerId !== activePlayer) : this._isEvilCharacterLike(card);
      case "banded":
        return Boolean(card.isBanded || card.bandedTo);
      case "lone":
        return this._isLoneInBattle(card, controllerId, battlefield, isInBattle, context);
      case "opposed":
      case "blocked":
        if (!isInBattle) return false;
        if (battlefield && controllerId) {
          return battlefield.some((c) => (c.controllerId || c.ownerId) !== controllerId && this._isCharacterLike(c));
        }
        return Boolean(card.isBlocked ?? card.isOpposed ?? room?.state?.battle?.blockOccurred);
      case "unblocked":
        if (!isInBattle) return false;
        if (battlefield && controllerId) {
          return !battlefield.some((c) => (c.controllerId || c.ownerId) !== controllerId && this._isCharacterLike(c));
        }
        if (typeof card.isUnblocked === "boolean") return card.isUnblocked;
        return room?.state?.battle?.blockOccurred === false;
      case "captured":
        return card.zone === ZONES.LAND_OF_BONDAGE || Boolean(card.isCaptured);
      case "set_aside":
        return card.zone === ZONES.SET_ASIDE;
      case "face_down":
        return Boolean(card.isFaceDown);
      case "face_up":
        return !card.isFaceDown;
      case "attached_to_self":
      case "held_by_self":
        return Boolean(context.sourceCard?.id && card.attachedTo && card.attachedTo === context.sourceCard.id);
      case "equipped":
        return Boolean(card.isEquipped) || this._getAttachedCards(card, room).length > 0;
      case "holding_weapon":
        return Boolean(card.holdingWeapon) || this._getAttachedCards(card, room).some((c) =>
          SideAttributeEvaluator.matchesClasses(c, ["Weapon"])
        );
      case "occupied":
        return this._isOccupied(card, room);
      case "unoccupied":
        return !this._isOccupied(card, room);
      case "in_same_zone":
        return Boolean(context.sourceCard?.zone && card.zone && card.zone === context.sourceCard.zone);
      case "single_brigade": {
        const brigades = this._extractBrigades(card);
        return brigades.length === 1 && !brigades.includes("multi");
      }
      case "multi_brigade": {
        const brigades = this._extractBrigades(card);
        return brigades.length > 1 || brigades.includes("multi");
      }
      case "protected":
        return Boolean(card.isProtected || card._protection);
      case "immune":
        return Boolean(card.isImmune);
      case "activated":
        return typeof card.isActivated === "boolean"
          ? card.isActivated
          : (card.zone === ZONES.TERRITORY || card.zone === ZONES.BATTLEFIELD);
      case "inactive":
        return typeof card.isActivated === "boolean"
          ? !card.isActivated
          : card.zone === ZONES.ARTIFACT;
      case "converted":
        return Boolean(card.isConverted);
      case "poisoned":
        return Boolean(card.isPoisoned);
      case "diseased":
        return Boolean(card.isDiseased);
      case "revealed":
        return Boolean(card.isRevealed || card.zone === "revealed") ||
          Boolean(room?.state?.revealedCards?.some?.((c) => c.id === card.id));
      case "about_to_be_discarded":
        return Boolean(card.aboutToBeDiscarded || (context.aboutToBeDiscardedCardId && context.aboutToBeDiscardedCardId === card.id));
      default: {
        const camelKey = TURN_RUNTIME_FLAG_KEYS[token];
        if (camelKey) {
          return Boolean(card[camelKey] ?? card[token] ?? context[camelKey]?.includes?.(card.id));
        }
        return Boolean(card[token]);
      }
    }
  }

  /** @private */
  static _isLoneInBattle(card, controllerId, battlefield, isInBattle, context) {
    if (!battlefield) {
      return Boolean(card.isLone ?? context.isLone);
    }
    if (!isInBattle) return false;
    const controlledChars = battlefield.filter(
      (c) => (c.controllerId || c.ownerId) === controllerId && this._isCharacterLike(c)
    );
    return controlledChars.length === 1 && controlledChars.some((c) => c.id === card.id);
  }

  /** @private */
  static _isOccupied(card, room) {
    if (card.isOccupied) return true;
    if (Array.isArray(card.ORDIR) && card.ORDIR.some((o) => String(o || "").trim().toLowerCase() === "occupied")) {
      return true;
    }
    return this._getAttachedCards(card, room).length > 0;
  }

  /** @private */
  static _getAttachedCards(card, room) {
    if (!card?.id || !room?.state) return [];
    const attached = [];
    const pushMatch = (list) => {
      if (!list) return;
      for (const c of list) {
        if (c && c.attachedTo === card.id) attached.push(c);
      }
    };
    pushMatch(room.state.battlefield);
    if (room.state.players && typeof room.state.players.values === "function") {
      for (const p of room.state.players.values()) {
        pushMatch(p.territory);
        pushMatch(p.land_of_bondage);
        pushMatch(p.set_aside);
      }
    }
    return attached;
  }

  /** @private */
  static _extractBrigades(card) {
    let raw = Array.isArray(card.Brigades) && card.Brigades.length > 0
      ? card.Brigades
      : card.Brigade;
    if ((!raw || (Array.isArray(raw) && raw.length === 0)) && card.templateId) {
      const dbCard = SideAttributeEvaluator.lookupDbCard(card);
      if (dbCard) {
        raw = Array.isArray(dbCard.Brigades) && dbCard.Brigades.length > 0 ? dbCard.Brigades : dbCard.Brigade;
      }
    }
    const list = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("/") : []);
    return Array.from(
      new Set(
        list
          .flatMap((b) => String(b || "").split("/"))
          .map((b) => b.trim().toLowerCase())
          .filter((b) => b && b !== "none" && b !== "neutral" && b !== "colorless")
      )
    );
  }

  /** @private */
  static _isCharacterLike(card) {
    if (!card) return false;
    if (card.IsEnhancement) return false;
    const t = card.inGameType || card.Type || "";
    if (t) return isCharacterSideType(t);
    return Boolean(card.IsCharacter);
  }

  /** @private */
  static _isGoodCharacterLike(card) {
    const t = String(card.inGameType || card.Type || "").toLowerCase();
    const a = String(card.inGameAlignment || card.Alignment || "").toLowerCase();
    return t.includes("hero") || (a.includes("good") && this._isCharacterLike(card));
  }

  /** @private */
  static _isEvilCharacterLike(card) {
    const t = String(card.inGameType || card.Type || "").toLowerCase();
    const a = String(card.inGameAlignment || card.Alignment || "").toLowerCase();
    return t.includes("evil character") || t === "ec" || (a.includes("evil") && this._isCharacterLike(card));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { StateFilterEvaluator };
}
