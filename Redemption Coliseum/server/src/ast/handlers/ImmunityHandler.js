// server/src/ast/handlers/ImmunityHandler.js
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { ActionTelegraphService } = require("../../services/ActionTelegraphService");
const { BattleService } = require("../../services/BattleService");
const logger = require("../../utils/logger");

/**
 * Handler for executing IMMUNE, PROTECT, and SET_IMMUNITY ability primitives
 * in accordance with official Redemption REG v11.0.0 guidelines (page 52, line 1723ff).
 */
class ImmunityHandler {
  /**
   * Executes an immune/protect effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters.
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }}
   */
  static execute(context) {
    const { room, player, effect, item, options = {} } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const targetDef = effect?.target || {};
    const protectionDef = this._buildProtectionDef(effect);

    // 1. Resolve targets
    const targets = this._resolveTargets(room, player, targetDef, sourceCard, options);

    // Handle zone/pile protection on source card if scopes cover piles or discrete zones
    const scopes = Array.isArray(targetDef.scope) ? targetDef.scope : (targetDef.scope ? [targetDef.scope] : []);
    const hasPileOrZoneScope = scopes.some((s) => ["deck", "hand", "reserve_pile", "discard_pile", "banish_pile"].includes(s));
    if (sourceCard && hasPileOrZoneScope) {
      sourceCard._zoneProtection = {
        ...protectionDef,
        sourceCardId: item?.cardId || "",
        scope: scopes,
      };
    }

    if (targets.length === 0) {
      logger.info("[ImmunityHandler] No eligible targets found to grant individual immunity/protect.");
      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.SET_IMMUNITY,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          protectedCardIds: [],
          protectionDef,
        },
        logEntry: `${player.name} activates protection.`,
      };
    }

    // Broadcast action telegraph
    ActionTelegraphService.send(room, {
      sourceCardId: item?.cardId,
      targetCardIds: targets.map((t) => t.card.id),
      action: AST_ACTIONS.SET_IMMUNITY,
      durationMs: 500,
    });

    let battleRecalculateNeeded = false;
    const protectedCardIds = [];
    const logEntries = [];

    for (const { card } of targets) {
      card.isImmune = true;
      card.isProtected = true;
      card.protectionReason = effect.action || "immune";
      card._protection = {
        ...protectionDef,
        sourceCardId: item?.cardId || "",
      };

      protectedCardIds.push(card.id);
      logEntries.push(`${card.Name} gains immunity / protection.`);

      if (card.zone === ZONES.BATTLEFIELD) {
        battleRecalculateNeeded = true;
      }
    }

    if (battleRecalculateNeeded) {
      BattleService.recalculate(room);
    }

    const snapshot = {
      action: AST_ACTIONS.SET_IMMUNITY,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      protectedCardIds,
      protectionDef,
    };

    return {
      success: true,
      snapshot,
      logEntry: logEntries.join(" "),
    };
  }

  /**
   * Constructs the structured protection configuration from AST effect data.
   *
   * @private
   * @param {object} effect AST effect.
   * @returns {object} Structured protection definition.
   */
  static _buildProtectionDef(effect) {
    const filter = effect?.protection_filter || {};
    const rawProtectedFrom = effect?.protected_from || {};
    const targetDef = effect?.target || {};

    const actions = Array.isArray(filter.actions)
      ? [...filter.actions]
      : (Array.isArray(rawProtectedFrom.actions) ? [...rawProtectedFrom.actions] : []);

    const exceptActions = Array.isArray(filter.except_actions)
      ? [...filter.except_actions]
      : [];

    const cardSources = Array.isArray(filter.card_sources)
      ? [...filter.card_sources]
      : [];

    // Fallbacks from legacy target identifiers
    if (actions.length === 0 && Array.isArray(targetDef.identifiers)) {
      for (const id of targetDef.identifiers) {
        const lower = String(id).toLowerCase();
        if (lower.includes("discard") && !actions.includes("discard")) actions.push("discard");
        if (lower.includes("capture") && !actions.includes("capture")) actions.push("capture");
        if ((lower.includes("banish") || lower.includes("remove")) && !actions.includes("banish")) actions.push("banish");
        if ((lower.includes("convert") || lower.includes("conversion")) && !actions.includes("convert")) actions.push("convert");
        if (lower.includes("negat") && !actions.includes("negate")) actions.push("negate");
        if (lower.includes("interrupt") && !actions.includes("interrupt")) actions.push("interrupt");
        if (lower.includes("band") && !actions.includes("band")) actions.push("band");
      }
    }

    const brigades = [
      ...(Array.isArray(rawProtectedFrom.brigades) ? rawProtectedFrom.brigades : []),
      ...(Array.isArray(targetDef.identifiers) ? targetDef.identifiers.filter((id) => id.includes("Brigade")) : []),
    ];

    const alignments = [
      ...(Array.isArray(rawProtectedFrom.alignments) ? rawProtectedFrom.alignments : []),
      ...(targetDef.alignment ? [targetDef.alignment] : []),
    ];

    const fromHarm = Boolean(
      filter.from_harm ||
      rawProtectedFrom.harm ||
      (effect.action || "").includes("harm") ||
      (targetDef.target_type || "").includes("harm") ||
      (Array.isArray(targetDef.identifiers) && targetDef.identifiers.some((id) => String(id).toLowerCase().includes("harm")))
    );

    const opponent = Boolean(
      rawProtectedFrom.opponent === true ||
      (Array.isArray(targetDef.identifiers) && targetDef.identifiers.some((id) => String(id).toLowerCase().includes("opponent"))) ||
      cardSources.some((cs) => cs.zone_owner === "opponent")
    );

    return {
      brigades,
      alignments,
      actions,
      except_actions: exceptActions,
      card_sources: cardSources,
      harm: fromHarm,
      from_harm: fromHarm,
      opponent,
      qualifiers: filter.qualifiers || [],
      scope: targetDef.scope,
      duration: effect?.duration || "permanent",
    };
  }

  /**
   * Resolves target cards matching AST criteria.
   *
   * @private
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {object} targetDef AST target definition.
   * @param {object} [sourceCard] Source card executing the effect.
   * @param {object} [options] Execution options.
   * @returns {Array<{ card: object, owner: object }>}
   */
  static _resolveTargets(room, actingPlayer, targetDef, sourceCard, options) {
    if (targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_SELF && sourceCard) {
      const owner = room.state.players.get(sourceCard.controllerId || sourceCard.ownerId) || actingPlayer;
      return [{ card: sourceCard, owner }];
    }

    const explicitIds = options.targetCardIds || [];
    if (explicitIds.length > 0) {
      const explicit = [];
      for (const id of explicitIds) {
        const c = room.cardLookup?.get(id);
        if (c) {
          const owner = room.state.players.get(c.controllerId || c.ownerId) || actingPlayer;
          explicit.push({ card: c, owner });
        }
      }
      return explicit;
    }

    const eligible = TargetSelectionService.resolveEligibleTargets(
      room,
      actingPlayer,
      targetDef,
      { sourceCard, actionType: AST_ACTIONS.SET_IMMUNITY }
    );

    const candidates = [];
    const maxCount = targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL
      ? eligible.eligibleCardIds.length
      : (typeof targetDef.count?.fixed_value === "number" ? targetDef.count.fixed_value : 1);

    for (const cardId of eligible.eligibleCardIds) {
      const c = room.cardLookup?.get(cardId);
      if (c) {
        const owner = room.state.players.get(c.controllerId || c.ownerId) || actingPlayer;
        candidates.push({ card: c, owner });
        if (candidates.length >= maxCount) break;
      }
    }

    return candidates;
  }
}

module.exports = { ImmunityHandler };
