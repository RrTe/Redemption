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

    // Special Initiative Interception Check:
    // If an opponent's card ability would remove the last remaining character(s) of a player in battle during Battle Phase,
    // suspend the discard and prompt the defending player to declare Special Initiative.
    if (
      room.state?.currentPhase === PHASES.BATTLE &&
      !options.specialInitiativeDeclined
    ) {
      // Group battle targets by combatant controller to detect if all characters of that player are being removed
      const opponentBattleTargetsByController = new Map();
      for (const { card, owner } of targets) {
        const combatantControllerId = card.controllerId || owner.sessionId;
        const isCharacter = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
        if (isCharacter && card.zone === ZONES.BATTLEFIELD && combatantControllerId !== player.sessionId) {
          if (!opponentBattleTargetsByController.has(combatantControllerId)) {
            opponentBattleTargetsByController.set(combatantControllerId, []);
          }
          opponentBattleTargetsByController.get(combatantControllerId).push(card);
        }
      }

      let siControllerId = null;
      let siTargetCards = null;

      for (const [cId, cardsBeingRemoved] of opponentBattleTargetsByController.entries()) {
        if (BattleCharacterClassifier.isLastCharacterInBattle(room.state.battlefield, cardsBeingRemoved, cId)) {
          siControllerId = cId;
          siTargetCards = cardsBeingRemoved;
          break;
        }
      }

      if (siTargetCards && siTargetCards.length > 0) {
        const primaryTarget = siTargetCards[0];
        const targetController = room.state.players.get(siControllerId) || primaryTarget.owner;
        const targetCard = primaryTarget;
        const isMultiple = siTargetCards.length > 1;
        const promptTargetText = isMultiple
          ? `All characters (${siTargetCards.length})`
          : targetCard.Name;

        logger.info(
          `[DiscardHandler] Special Initiative triggered: Opponent '${player.name}' targets ${promptTargetText} of '${targetController.name}'.`
        );

        const chronicle = room.state.effectChronicle;
        if (chronicle) {
          chronicle.priorityPlayerId = targetController.sessionId;
        }

        if (item) {
          item.pendingSpecialInitiative = {
            targetCardId: targetCard.id,
            targetCardIds: siTargetCards.map((c) => c.id),
            targetOwnerId: targetController.sessionId,
            initiatorId: player.sessionId,
            options,
          };
        }

        const targetClient = room.clients?.find((c) => c.sessionId === targetController.sessionId);
        if (targetClient && typeof targetClient.send === "function") {
          targetClient.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
            abilityId: "special_initiative",
            itemId: item?.id || "",
            cardId: targetCard.id,
            cardTitle: targetCard.Name,
            promptText: `${promptTargetText} in battle targeted for discard! Declare Special Initiative?`,
            action: "special_initiative",
            cardImageFile: targetCard.ImageFile || "",
            templateId: targetCard.templateId || "",
          });
        }

        return {
          success: true,
          handled: true,
          awaitingSpecialInitiative: true,
          targetCard,
          targetCards: siTargetCards,
          targetOwner: targetController,
        };
      }
    }

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

      if (result && result.movedCards && result.movedCards.length > 0) {
        discardedSnapshots.push({
          cardId: card.id,
          name: card.Name,
          fromZone,
          toZone: ZONES.DISCARD,
          ownerId: trueOwner.sessionId,
        });
        if (result.logEntry) logEntries.push(result.logEntry);
      }
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
  static _resolveTargets(room, actingPlayer, targetDef, options, count) {
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
          if (explicitIds.length > 0) {
            if (explicitIds.includes(card.id)) {
              candidates.push({ card, owner: p });
              if (candidates.length >= count) return candidates;
            }
          } else if (TargetSelectionService.matchesFilter(card, targetDef)) {
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
