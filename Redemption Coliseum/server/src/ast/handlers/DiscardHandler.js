// server/src/ast/handlers/DiscardHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS } = require("../../../../shared/astConstants");
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
    const count = typeof targetDef.count?.fixed_value === "number"
      ? targetDef.count.fixed_value
      : 1;

    // Resolve eligible target cards based on dynamic filter criteria
    const targets = this._resolveTargets(room, player, targetDef, options, count);

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

    // Execute discard moves for each resolved target
    for (const { card, owner } of targets) {
      const fromZone = card.zone;
      const result = moveCard(
        owner,
        room.state,
        room.cardLookup,
        fromZone,
        ZONES.DISCARD,
        card.id
      );

      if (result && result.movedCards && result.movedCards.length > 0) {
        discardedSnapshots.push({
          cardId: card.id,
          name: card.Name,
          fromZone,
          ownerId: owner.sessionId,
        });
        if (result.logEntry) logEntries.push(result.logEntry);
      }
    }

    const snapshot = {
      action: AST_ACTIONS.DISCARD,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
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
   * @param {object} options Options with explicit targetCardIds.
   * @param {number} count Maximum count to select.
   * @returns {Array<{ card: object, owner: object }>} Selected targets with owners.
   * @private
   */
  static _resolveTargets(room, actingPlayer, targetDef, options, count) {
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
    const scope = targetDef.scope || "in_play";
    let zoneNames = [ZONES.TERRITORY, ZONES.BATTLEFIELD];
    if (scope === "hand") zoneNames = [ZONES.HAND];
    else if (scope === "deck") zoneNames = [ZONES.DECK];
    else if (scope === "in_play") zoneNames = [ZONES.TERRITORY, ZONES.BATTLEFIELD];

    for (const p of playersToScan) {
      for (const zName of zoneNames) {
        const zoneCards = p[zName] || [];
        for (const card of zoneCards) {
          if (this._matchesFilter(card, targetDef, explicitIds)) {
            candidates.push({ card, owner: p });
            if (candidates.length >= count) return candidates;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Evaluates if a card matches AST target filters.
   *
   * @param {object} card Card instance.
   * @param {object} targetDef AST filter definition.
   * @param {string[]} explicitIds Explicit target IDs.
   * @returns {boolean} True if card matches.
   * @private
   */
  static _matchesFilter(card, targetDef, explicitIds) {
    if (explicitIds.length > 0) {
      return explicitIds.includes(card.id);
    }

    // Check alignment
    if (targetDef.alignment) {
      const cardAlign = (card.inGameAlignment || card.Alignment || "").toLowerCase();
      if (cardAlign !== targetDef.alignment.toLowerCase()) {
        return false;
      }
    }

    // Check target type
    if (targetDef.target_type === "character" && !card.IsCharacter) {
      return false;
    }

    return true;
  }
}

module.exports = { DiscardHandler };
