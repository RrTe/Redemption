// server/src/ast/DynamicValueResolver.js
const { ZONES } = require("../../../shared/zones");
const {
  AST_STAT_MOD_OPERATIONS,
  AST_DYNAMIC_VALUE_SOURCES,
} = require("../../../shared/astConstants");
const { matchesTargetType } = require("../../../shared/cardHierarchy");
const { StatFilterEvaluator } = require("../../../shared/rules/StatFilterEvaluator");

/**
 * Evaluates AST `DynamicValue` expressions for both target counts (`count.dynamic`)
 * and stat modifiers (`strength_mod` / `toughness_mod` with `dynamic`).
 */
class DynamicValueResolver {
  /**
   * Resolves a `DynamicValue` object (`count.dynamic`) to a non-negative integer count.
   *
   * @param {object} dynamicSpec AST DynamicValue descriptor.
   * @param {object} [context={}] Execution context (`room`, `player`, `sourceCard`, `eligibleCount`, `previousSnapshot`, etc.).
   * @returns {number} Non-negative integer count.
   */
  static resolveDynamicCount(dynamicSpec, context = {}) {
    if (!dynamicSpec || typeof dynamicSpec !== "object") return 1;
    const rawVal = this._computeExpression(dynamicSpec, "strength", context);
    return Math.max(0, Math.floor(rawVal));
  }

  /**
   * Resolves a stat modifier value (static integer or `DynamicValue` object) into
   * a signed additive delta relative to `currentStat`.
   *
   * @param {number|object} modSpec Signed integer or `{ dynamic: DynamicValue }`.
   * @param {"strength"|"toughness"} statKey Stat attribute being modified.
   * @param {number} currentStat Target card's current effective stat value.
   * @param {object} [context={}] Execution context.
   * @returns {number} Signed stat delta to apply to the counter.
   */
  static resolveStatDelta(modSpec, statKey, currentStat, context = {}) {
    if (typeof modSpec === "number") return modSpec;
    if (!modSpec || typeof modSpec !== "object" || !modSpec.dynamic) return 0;

    const dyn = modSpec.dynamic;
    const op = String(dyn.operation || AST_STAT_MOD_OPERATIONS.ADD).toLowerCase();
    const exprVal = this._computeExpression(dyn, statKey, context, currentStat);

    if (op === AST_STAT_MOD_OPERATIONS.SET) {
      return exprVal - currentStat;
    }
    if (op === AST_STAT_MOD_OPERATIONS.MULTIPLY) {
      const base = dyn.source ? this._resolveSourceBase(dyn, statKey, context, currentStat) : currentStat;
      const capped = typeof dyn.limit === "number" ? Math.min(base, dyn.limit) : base;
      const mult = typeof dyn.multiplier === "number" ? dyn.multiplier : 1;
      const offset = typeof dyn.offset === "number" ? dyn.offset : 0;
      const targetVal = (capped * mult) + offset;
      return targetVal - currentStat;
    }
    return exprVal;
  }

  /** @private */
  static _computeExpression(dyn, statKey, context, currentStat = 0) {
    let base = this._resolveSourceBase(dyn, statKey, context, currentStat);
    if (typeof dyn.limit === "number" && base > 0) {
      base = Math.min(base, dyn.limit);
    }
    const mult = typeof dyn.multiplier === "number" ? dyn.multiplier : 1;
    const offset = typeof dyn.offset === "number" ? dyn.offset : 0;
    return (base * mult) + offset;
  }

  /** @private */
  static _resolveSourceBase(dyn, statKey, context = {}, currentStat = 0) {
    const source = dyn.source;
    if (!source) {
      return typeof dyn.fixed_value === "number" ? dyn.fixed_value : 0;
    }

    const room = context.room;
    const actingPlayer = context.player || context.actingPlayer || null;

    switch (source) {
      case AST_DYNAMIC_VALUE_SOURCES.COUNT_CARDS: {
        if (dyn.selector && room) {
          return this._resolveMatchingCards(room, actingPlayer, dyn.selector, context).length;
        }
        if ((dyn.scope || dyn.target_type) && room) {
          const synthSelector = {
            selection_mode: "automatic_all",
            zone_owner: dyn.zone_owner || "either",
            scope: Array.isArray(dyn.scope) ? dyn.scope : (dyn.scope ? [dyn.scope] : ["in_play"]),
            ...(dyn.target_type ? { target_type: dyn.target_type } : {}),
          };
          return this._resolveMatchingCards(room, actingPlayer, synthSelector, context).length;
        }
        if (typeof context.eligibleCount === "number") {
          return context.eligibleCount;
        }
        return 0;
      }

      case AST_DYNAMIC_VALUE_SOURCES.COUNT_BRIGADES: {
        const selector = dyn.selector || { selection_mode: "automatic_all", zone_owner: "either", scope: ["in_play"] };
        const cards = room ? this._resolveMatchingCards(room, actingPlayer, selector, context) : [];
        const brigades = new Set();
        for (const c of cards) {
          const raw = Array.isArray(c.Brigades) && c.Brigades.length > 0 ? c.Brigades : c.Brigade;
          const list = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("/") : []);
          for (const b of list.flatMap((x) => String(x || "").split("/"))) {
            const norm = b.trim().toLowerCase();
            if (norm && norm !== "none" && norm !== "neutral" && norm !== "colorless") {
              brigades.add(norm);
            }
          }
        }
        return brigades.size;
      }

      case AST_DYNAMIC_VALUE_SOURCES.LOST_SOULS_IN_PLAY: {
        if (!room?.state) return 0;
        let count = 0;
        const countIfLS = (c) => {
          if (c && (c.isLostSoul || matchesTargetType(c, "lost_soul", c.inGameType || c.Type || ""))) {
            count++;
          }
        };
        if (room.state.players && typeof room.state.players.values === "function") {
          for (const p of room.state.players.values()) {
            (p[ZONES.LAND_OF_BONDAGE] || []).forEach(countIfLS);
            (p[ZONES.TERRITORY] || []).forEach(countIfLS);
          }
        }
        (room.state.battlefield || []).forEach(countIfLS);
        return count;
      }

      case AST_DYNAMIC_VALUE_SOURCES.CARDS_DRAWN:
        return Number(
          context.previousSnapshot?.movedCardIds?.length ??
          context.previousSnapshot?.count ??
          context.cardsDrawn ??
          0
        );

      case AST_DYNAMIC_VALUE_SOURCES.STAT_VALUE:
      case AST_DYNAMIC_VALUE_SOURCES.TARGET_STAT: {
        if (context.targetCard) {
          return StatFilterEvaluator.getCardStats(context.targetCard)[statKey] || 0;
        }
        return currentStat;
      }

      case AST_DYNAMIC_VALUE_SOURCES.SELF_STAT: {
        const selfCard = context.sourceCard || context.card;
        return selfCard ? (StatFilterEvaluator.getCardStats(selfCard)[statKey] || 0) : 0;
      }

      case AST_DYNAMIC_VALUE_SOURCES.CHAINED_TARGET_STATS: {
        const snap = (typeof dyn.ref_step === "number" && context.stepSnapshots?.[dyn.ref_step]) || context.previousSnapshot;
        return this._sumSnapshotCardStats(snap, statKey, room);
      }

      case AST_DYNAMIC_VALUE_SOURCES.COST_TARGET_STATS: {
        const snap = context.costSnapshot || context.previousSnapshot;
        return this._sumSnapshotCardStats(snap, statKey, room);
      }

      case AST_DYNAMIC_VALUE_SOURCES.CARD_X_IDENTIFIER:
        return Number(
          context.variables?.X ??
          context.options?.X ??
          context.sourceCard?.counters?.get?.("X") ??
          context.sourceCard?.counters?.X ??
          0
        );

      case AST_DYNAMIC_VALUE_SOURCES.PLAYER_CHOICE:
        return Number(context.options?.chosenNumber ?? context.variables?.X ?? 0);

      default:
        return typeof dyn.fixed_value === "number" ? dyn.fixed_value : 0;
    }
  }

  /** @private */
  static _sumSnapshotCardStats(snap, statKey, room) {
    if (!snap) return 0;
    const entries = snap.movedCards || snap.discardedCards || snap.transferredCards || [];
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    let total = 0;
    for (const entry of entries) {
      const card = (entry.cardId && room?.cardLookup?.get?.(entry.cardId)) || entry.cardSnapshot || null;
      if (card) {
        total += StatFilterEvaluator.getCardStats(card)[statKey] || 0;
      }
    }
    return total;
  }

  /** @private */
  static _resolveMatchingCards(room, actingPlayer, selector, context) {
    const { TargetSelectionService } = require("./TargetSelectionService");
    const playerFallback = actingPlayer || Array.from(room?.state?.players?.values?.() || [])[0] || null;
    if (!playerFallback) return [];
    const res = TargetSelectionService.resolveEligibleTargets(room, playerFallback, selector, {
      sourceCard: context.sourceCard,
      actionType: "dynamic_count",
      skipDynamicCount: true,
    });
    return (res.eligibleCardIds || [])
      .map((id) => room.cardLookup?.get?.(id) || this._findCardInRoomState(room, id))
      .filter(Boolean);
  }

  /** @private */
  static _findCardInRoomState(room, cardId) {
    if (!room?.state) return null;
    const bfMatch = (room.state.battlefield || []).find((c) => c?.id === cardId);
    if (bfMatch) return bfMatch;
    if (room.state.players && typeof room.state.players.values === "function") {
      for (const p of room.state.players.values()) {
        for (const z of Object.values(ZONES)) {
          const found = p[z] && typeof p[z].find === "function" ? p[z].find((c) => c?.id === cardId) : null;
          if (found) return found;
        }
      }
    }
    return null;
  }
}

module.exports = { DynamicValueResolver };
