/**
 * @module shared/rules/MoveValidator
 * Central rule engine orchestrator validating card moves against all game rules.
 */

import { CombatRules } from "./CombatRules.js";
import { MovementRules } from "./MovementRules.js";

export class MoveValidator {
  /**
   * Validates a card movement action.
   *
   * Supports both context object:
   *   MoveValidator.validate({ card, fromZone, toZone, state, targetPlayerId, cardControllerId, options })
   * and positional arguments:
   *   MoveValidator.validate(card, state, cardControllerId, targetPlayerId, fromZone, toZone, options)
   *
   * @param {object|any} arg1 Context object or card instance.
   * @param {object} [state] Colyseus room state (when using positional arguments).
   * @param {string} [cardControllerId] Current controller sessionId.
   * @param {string} [targetPlayerId] Destination player sessionId.
   * @param {string} [fromZone] Source zone name.
   * @param {string} [toZone] Target zone name.
   * @param {object} [options={}] Additional move flags.
   * @returns {{ valid: boolean, error?: string }}
   */
  static validate(arg1, state, cardControllerId, targetPlayerId, fromZone, toZone, options = {}) {
    let ctx;
    if (arg1 && typeof arg1 === "object" && !state && ("card" in arg1 || "toZone" in arg1 || "fromZone" in arg1)) {
      ctx = { ...arg1 };
      ctx.options = ctx.options || {};
    } else {
      ctx = {
        card: arg1,
        state,
        cardControllerId,
        targetPlayerId,
        fromZone,
        toZone,
        options: options || {},
      };
    }

    // 1. Undo operations bypass all game rule restrictions
    if (ctx.options && ctx.options.isUndo) {
      return { valid: true };
    }

    const card = ctx.card;
    if (!card) {
      return { valid: false, error: "No card provided!" };
    }

    // 2. Dual Card resolution: resolve active side if inGameType or inGameAlignment is set
    const effectiveInGameType = ctx.options.inGameType || card.inGameType || "";
    const effectiveInGameAlignment = ctx.options.inGameAlignment || card.inGameAlignment || "";
    const effectiveCard = (effectiveInGameType || effectiveInGameAlignment)
      ? Object.assign(Object.create(card), {
          inGameType: effectiveInGameType,
          inGameAlignment: effectiveInGameAlignment,
        })
      : card;

    const fullCtx = {
      ...ctx,
      effectiveCard,
      cardControllerId: ctx.cardControllerId ?? card.controllerId,
      isArena: Boolean(ctx.state?.isArenaMode ?? ctx.state?.isSandboxMode),
    };

    // 3. Combat & Battlefield Rules
    const combatResult = CombatRules.validate(fullCtx);
    if (!combatResult.valid) {
      return combatResult;
    }

    // 4. Movement & Zone Rules
    const movementResult = MovementRules.validate(fullCtx);
    if (!movementResult.valid) {
      return movementResult;
    }

    return { valid: true };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MoveValidator };
}
