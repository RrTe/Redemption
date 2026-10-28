// server/src/ast/handlers/DiscardHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { PHASES } = require("../../../../shared/phases");
const {
  AST_ACTIONS,
  AST_MESSAGES,
  AST_SELECTION_MODES,
  AST_SCOPES,
} = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleCharacterClassifier } = require("../../services/BattleCharacterClassifier");
const { SpecialInitiativeService } = require("../../services/SpecialInitiativeService");
const { ActionTelegraphService } = require("../../services/ActionTelegraphService");
const { BattleService } = require("../../services/BattleService");
const logger = require("../../utils/logger");

/**
 * Handler for executing generic DISCARD ability primitives.
 * Dynamically resolves target cards based on AST criteria without hardcoding.
 */
class DiscardHandler {
  /**
   * Executes a discard action effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters (e.g. explicit targetCardIds).
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }} Result.
   */
  static execute(context) {
    const { room, player, effect, item, options = {} } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const targetDef = effect?.target || {};
    const isAll = targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL || targetDef.all === true;
    const count = isAll
      ? Infinity
      : (typeof targetDef.count?.fixed_value === "number" ? targetDef.count.fixed_value : 1);

    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    // Resolve eligible target cards based on dynamic filter criteria
    const targets = this._resolveTargets(room, player, targetDef, options, count, sourceCard);

    if (targets.length === 0) {
      logger.info("[DiscardHandler] No eligible targets found for discard.");
      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.DISCARD,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          discardedCards: [],
        },
        logEntry: `${player.name} finds no eligible targets to discard.`,
      };
    }

    const discardedSnapshots = [];
    const logEntries = [];

    // Special Initiative Interception Check:
    const siResult = SpecialInitiativeService.checkAndTrigger(
      room,
      player,
      targets,
      item,
      options,
      "targeted for discard"
    );
    if (siResult) {
      return siResult;
    }

    // Broadcast action telegraph to both players for deterministic/resolved targets
    const explicitPileId =
      options.targetPileId ||
      (targets[0]?.card?.zone === ZONES.DECK ? `${targets[0].owner.sessionId}:${ZONES.DECK}` : undefined);
    ActionTelegraphService.send(room, {
      sourceCardId: item?.cardId,
      targetCardIds: targets.map((t) => t.card.id),
      targetPileId: explicitPileId,
      action: AST_ACTIONS.DISCARD,
      durationMs: 500,
    });

    // Execute discard moves for each resolved target
    for (const { card, owner } of targets) {
      const fromZone = card.zone;
      const trueOwnerId = card.originalOwnerId || card.ownerId;
      const trueOwner = (trueOwnerId && room.state.players.get(trueOwnerId)) || owner;
      const result = moveCard(
        trueOwner,
        room.state,
        room.cardLookup,
        fromZone,
        ZONES.DISCARD,
        card.id
      );

      const movedOrDiverted =
        (result?.movedCards && result.movedCards[0]) ||
        (result?.divertedCards && result.divertedCards[0]);

      if (movedOrDiverted) {
        discardedSnapshots.push({
          cardId: card.id,
          name: card.Name,
          fromZone,
          toZone: movedOrDiverted.zone || ZONES.DISCARD,
          ownerId: trueOwner.sessionId,
        });
        if (result.logEntry) logEntries.push(result.logEntry);
      }
    }

    if (discardedSnapshots.some((s) => s.fromZone === ZONES.BATTLEFIELD)) {
      BattleService.recalculate(room);
    }

    const snapshot = {
      action: AST_ACTIONS.DISCARD,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      movedCards: discardedSnapshots,
      discardedCards: discardedSnapshots,
    };

    return {
      success: true,
      snapshot,
      logEntry: logEntries.join(" ") || `${player.name} discards ${discardedSnapshots.length} card(s).`,
    };
  }

  /**
   * Resolves target cards matching AST filter criteria.
   *
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {object} targetDef AST target definition.
   * @param {object} options Options with explicit targetCardIds or targetPileId.
   * @param {number} count Maximum count to select.
   * @returns {Array<{ card: object, owner: object }>} Selected targets with owners.
   * @private
   */
  static _resolveTargets(room, actingPlayer, targetDef, options, count, sourceCard = null) {
    // 1. Explicit pile target (e.g. discard top card of targeted deck)
    if (options.targetPileId) {
      const [targetOwnerId, targetZone] = options.targetPileId.split(":");
      const targetPlayer = room.state.players.get(targetOwnerId);
      const zoneName = targetZone || ZONES.DECK;
      if (targetPlayer && targetPlayer[zoneName] && targetPlayer[zoneName].length > 0) {
        const topCard = targetPlayer[zoneName][0];
        return [{ card: topCard, owner: targetPlayer }];
      }
      return [];
    }

    const explicitIds = options.targetCardIds || [];
    const candidates = [];

    // Determine target player owners
    const zoneOwner = targetDef.zone_owner || "either";
    const playersToScan = [];

    for (const p of room.state.players.values()) {
      if (zoneOwner === "controller" && p.sessionId === actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "opponent" && p.sessionId !== actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "either" || zoneOwner === "both") {
        playersToScan.push(p);
      }
    }

    // Determine target zones based on scope
    const scope = (targetDef.scope || "in_play").toLowerCase();
    let zoneNames = [ZONES.TERRITORY, ZONES.BATTLEFIELD];
    if (scope === "hand") zoneNames = [ZONES.HAND];
    else if (scope === "deck") zoneNames = [ZONES.DECK];
    else if (scope === "battle" || scope === "battlefield" || scope === AST_SCOPES.BATTLE) zoneNames = [ZONES.BATTLEFIELD];
    else if (scope === "territory") zoneNames = [ZONES.TERRITORY];
    else if (scope === "in_play") zoneNames = [ZONES.TERRITORY, ZONES.BATTLEFIELD];

    for (const p of playersToScan) {
      for (const zName of zoneNames) {
        const zoneCards = zName === ZONES.BATTLEFIELD
          ? (room?.state?.battlefield || []).filter(c => (c.controllerId || c.ownerId) === p.sessionId)
          : (p[zName] || []);
        for (const card of zoneCards) {
          const filterContext = { sourceCard, actionType: AST_ACTIONS.DISCARD };
          if (explicitIds.length > 0) {
            if (explicitIds.includes(card.id) && TargetSelectionService.matchesFilter(card, targetDef, filterContext)) {
              candidates.push({ card, owner: p });
              if (candidates.length >= count) return candidates;
            }
          } else if (TargetSelectionService.matchesFilter(card, targetDef, filterContext)) {
            candidates.push({ card, owner: p });
            if (candidates.length >= count) return candidates;
          }
        }
      }
    }

    return candidates;
  }
}

module.exports = { DiscardHandler };
