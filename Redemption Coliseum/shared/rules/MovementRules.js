/**
 * @module shared/rules/MovementRules
 * Pure, deterministic zone and card movement validation rules for Redemption Coliseum.
 */

import { ZONES, PILE_ZONES } from "../zones.js";
import { CARD_TYPES, MAX_HAND_SIZE } from "../card-constants.js";

export class MovementRules {
  /**
   * Determines if a card is a Lost Soul.
   * @param {object} card
   * @returns {boolean}
   */
  static isLostSoul(card) {
    if (!card) return false;
    return card.Type === CARD_TYPES.LOST_SOUL || (Boolean(card.Type) && String(card.Type).includes("Lost Soul"));
  }

  /**
   * Enforces valid destinations for Lost Souls.
   * @param {object} ctx
   * @returns {{ valid: boolean, error?: string }}
   */
  static lostSoulMovementRule(ctx) {
    const card = ctx.card;
    if (!card || !MovementRules.isLostSoul(card)) return { valid: true };

    const toZone = ctx.toZone;
    const fromZone = ctx.fromZone;
    const targetPlayerId = ctx.targetPlayerId;
    const cardControllerId = ctx.cardControllerId ?? card.controllerId;

    const canMoveToAnyBondage = toZone === ZONES.LAND_OF_BONDAGE;
    const canMoveToOwnDeck = toZone === ZONES.DECK && targetPlayerId === card.originalOwnerId;
    const canMoveToOwnDiscard = toZone === ZONES.DISCARD && targetPlayerId === card.originalOwnerId;
    const canMoveToOpponentRedemption =
      toZone === ZONES.LAND_OF_REDEMPTION &&
      targetPlayerId !== card.originalOwnerId &&
      fromZone === ZONES.LAND_OF_BONDAGE &&
      cardControllerId === card.originalOwnerId;

    if (canMoveToAnyBondage || canMoveToOwnDeck || canMoveToOwnDiscard || canMoveToOpponentRedemption) {
      return { valid: true };
    }

    return { valid: false, error: "Invalid move for Lost Soul!" };
  }

  /**
   * Blocks cards from being placed into another player's private pile zones.
   * @param {object} ctx
   * @returns {{ valid: boolean, error?: string }}
   */
  static foreignPileRule(ctx) {
    const card = ctx.card;
    if (!card) return { valid: true };
    if (PILE_ZONES.includes(ctx.toZone) && card.originalOwnerId !== ctx.targetPlayerId) {
      return { valid: false, error: "Cannot move cards to opponent's pile!" };
    }
    return { valid: true };
  }

  /**
   * Prevents removing cards from Reserve in Round 1.
   * @param {object} ctx
   * @returns {{ valid: boolean, error?: string }}
   */
  static reserveFirstRoundRule(ctx) {
    if (ctx.fromZone === ZONES.RESERVE && ctx.toZone !== ZONES.RESERVE) {
      const state = ctx.state;
      const isFirstRound =
        state?.round !== undefined && state?.round !== null
          ? state.round <= 1
          : Array.from(state?.players?.values ? state.players.values() : Object.values(state?.players || {})).every(
              (p) => (p.turn !== undefined ? p.turn <= 1 : true)
            );
      if (isFirstRound) {
        return { valid: false, error: "Cannot take cards from Reserve in Round 1!" };
      }
    }
    return { valid: true };
  }

  /**
   * Enforces hand capacity limits.
   * @param {object} ctx
   * @returns {{ valid: boolean, error?: string }}
   */
  static handLimitRule(ctx) {
    if (ctx.toZone === ZONES.HAND) {
      const targetPlayer = ctx.state?.players?.get ? ctx.state.players.get(ctx.targetPlayerId) : ctx.state?.players?.[ctx.targetPlayerId];
      if (targetPlayer && targetPlayer[ZONES.HAND]?.length >= MAX_HAND_SIZE) {
        return { valid: false, error: `Hand limit reached (${MAX_HAND_SIZE}/${MAX_HAND_SIZE})!` };
      }
    }
    return { valid: true };
  }

  /**
   * Validates non-combat movement rules.
   * @param {object} ctx
   * @returns {{ valid: boolean, error?: string }}
   */
  static validate(ctx) {
    if (this.isLostSoul(ctx.card)) {
      return this.lostSoulMovementRule(ctx);
    }
    const foreignRes = this.foreignPileRule(ctx);
    if (!foreignRes.valid) return foreignRes;

    const reserveRes = this.reserveFirstRoundRule(ctx);
    if (!reserveRes.valid) return reserveRes;

    const handRes = this.handLimitRule(ctx);
    if (!handRes.valid) return handRes;

    return { valid: true };
  }
}

export const LostSoulMovementRule = MovementRules.lostSoulMovementRule.bind(MovementRules);
export const ForeignPileRule = MovementRules.foreignPileRule.bind(MovementRules);
export const ReserveFirstRoundRule = MovementRules.reserveFirstRoundRule.bind(MovementRules);
export const HandLimitRule = MovementRules.handLimitRule.bind(MovementRules);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MovementRules,
    LostSoulMovementRule,
    ForeignPileRule,
    ReserveFirstRoundRule,
    HandLimitRule,
  };
}
