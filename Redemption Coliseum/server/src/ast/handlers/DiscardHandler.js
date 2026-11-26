// server/src/ast/handlers/DiscardHandler.js
const { moveCard, getZoneCollection } = require("../../services/cardService");
const { MoveCardSnapshotHelper } = require("../../commands/MoveCardSnapshotHelper");
const { ZONES } = require("../../../../shared/zones");
const { PHASES } = require("../../../../shared/phases");
const {
  AST_ACTIONS,
  AST_MESSAGES,
  AST_SELECTION_MODES,
  AST_SCOPES,
} = require("../../../../shared/astConstants");
const { SelectorComposer } = require("../../../../shared/rules/SelectorComposer");
const { TargetSelectionService } = require("../TargetSelectionService");
const { parseTargetCount } = require("../TargetCountResolver");
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
    const { room, player, effect, item, options = {}, previousSnapshot = null } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const targetDef = effect?.target || {};
    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const initialCountInfo = parseTargetCount(targetDef, effect?.count, {
      room,
      player,
      sourceCard,
      previousSnapshot,
      options,
    });

    // Resolve eligible target cards based on dynamic filter criteria
    const targets = this._resolveTargets(
      room,
      player,
      targetDef,
      options,
      initialCountInfo,
      sourceCard,
      previousSnapshot,
      options.actorCard || context.actorCard
    );

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

    if (options.specialInitiativeDeclined && room.state?.battle) {
      room.state.battle.specialInitiativePlayerId = "";
    }

    // Execute discard moves for each resolved target
    for (const { card, owner } of targets) {
      const fromZone = card.zone;
      const previousControllerId = card.controllerId || owner?.sessionId;
      const currentCollection = getZoneCollection(owner, room.state, fromZone);
      const fromIndex = currentCollection?.findIndex
        ? currentCollection.findIndex((c) => c.id === card.id)
        : -1;
      const cardSnapshot = MoveCardSnapshotHelper.createSnapshot(card, fromZone, owner, fromIndex);

      const trueOwnerId = card.originalOwnerId || card.ownerId;
      const trueOwner = (trueOwnerId && room.state.players.get(trueOwnerId)) || owner;
      const result = moveCard(
        trueOwner,
        room.state,
        room.cardLookup,
        fromZone,
        ZONES.DISCARD,
        card.id,
        1,
        {},
        "",
        "",
        { isAbilityAction: true }
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
          previousControllerId,
          fromIndex,
          cardSnapshot,
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
  static _resolveTargets(room, actingPlayer, targetDef, options, countInfo, sourceCard = null, previousSnapshot = null, actorCard = null) {
    const count = typeof countInfo === "number" ? countInfo : countInfo.count;
    const hasDynamic = Boolean(typeof countInfo === "object" && countInfo?.hasDynamic);

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

    let explicitIds = options.targetCardIds || [];
    if (
      explicitIds.length === 0 &&
      targetDef.selection_mode === AST_SELECTION_MODES.CHAINED_TARGET &&
      previousSnapshot?.movedCards
    ) {
      explicitIds = previousSnapshot.movedCards.map((c) => c.cardId);
    }

    const candidates = [];
    const hasAnyOf = Array.isArray(targetDef.any_of) && targetDef.any_of.length > 0;
    const zoneOwner = hasAnyOf
      ? SelectorComposer.resolveScanZoneOwner(targetDef)
      : (targetDef.zone_owner || "either");
    const playersToScan = [];

    for (const p of room.state.players.values()) {
      if (zoneOwner === "controller" && p.sessionId === actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "opponent" && p.sessionId !== actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "either" || zoneOwner === "both" || zoneOwner === "target_player") {
        playersToScan.push(p);
      }
    }

    const effectiveScope = hasAnyOf
      ? SelectorComposer.collectEffectiveScopes(targetDef, AST_SCOPES.IN_PLAY)
      : targetDef.scope;
    const zoneNames = TargetSelectionService._resolveTargetZones(effectiveScope);

    for (const p of playersToScan) {
      for (const zName of zoneNames) {
        const zoneCards = zName === ZONES.BATTLEFIELD
          ? (room?.state?.battlefield || []).filter(c => (c.controllerId || c.ownerId) === p.sessionId)
          : (p[zName] || []);
        for (const card of zoneCards) {
          const filterContext = {
            room,
            actingPlayer,
            sourceCard,
            actorCard,
            actionType: AST_ACTIONS.DISCARD,
            candidateZone: zName,
            candidateOwnerId: p.sessionId,
            previousSnapshot,
          };
          if (explicitIds.length > 0) {
            if (explicitIds.includes(card.id) && TargetSelectionService.matchesFilter(card, targetDef, filterContext)) {
              candidates.push({ card, owner: p });
              if (!hasDynamic && candidates.length >= count) return candidates;
            }
          } else if (TargetSelectionService.matchesFilter(card, targetDef, filterContext)) {
            candidates.push({ card, owner: p });
            if (!hasDynamic && candidates.length >= count) return candidates;
          }
        }
      }
    }

    if (hasDynamic && explicitIds.length === 0) {
      const resolved = parseTargetCount(targetDef, undefined, {
        room,
        player: actingPlayer,
        sourceCard,
        eligibleCount: candidates.length,
        previousSnapshot,
        options,
      });
      return candidates.slice(0, resolved.count);
    }

    return candidates;
  }
}

module.exports = { DiscardHandler };
