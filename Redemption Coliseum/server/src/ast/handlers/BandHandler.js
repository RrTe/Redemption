// server/src/ast/handlers/BandHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleCharacterClassifier } = require("../../services/BattleCharacterClassifier");
const { BattleService } = require("../../services/BattleService");
const { ProtectionService } = require("../../../../shared/rules/ProtectionService");
const logger = require("../../utils/logger");

/**
 * Handler for executing BAND and ADD_TO_BATTLE ability primitives in accordance
 * with official Redemption REG v11.0.0 guidelines (page 27, line 948ff).
 */
class BandHandler {
  /**
   * Executes a band action effect.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters (e.g. explicit targetCardIds).
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string, awaitingTargetSelection?: boolean, eligible?: object }}
   */
  static execute(context) {
    const { room, player, effect, item, options = {} } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const leaderCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const targetDef = effect?.target || {};

    // 1. Resolve eligible target candidates
    const eligible = this._resolveEligibleCandidates(room, player, targetDef, leaderCard);

    // If selection is manual and no explicit targets submitted, request client selection
    const explicitIds = options.targetCardIds || [];
    if (explicitIds.length === 0 && eligible.requiresSelection) {
      const client = room.clients?.find((c) => c.sessionId === player.sessionId);
      if (client && typeof client.send === "function") {
        client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
          abilityId: item.abilityId || "band",
          itemId: item.id,
          sourceCardId: leaderCard?.id || item?.cardId,
          promptText: targetDef.prompt_text || "Select a character to band into battle",
          targetType: "card",
          eligibleCardIds: eligible.eligibleCardIds,
          eligiblePiles: [],
          minTargets: 1,
          maxTargets: 1,
          canCancel: Boolean(targetDef.can_cancel),
        });
      }
      return {
        success: true,
        handled: true,
        awaitingTargetSelection: true,
        eligible,
      };
    }

    const selectedTargetId = explicitIds[0] || eligible.eligibleCardIds[0];
    const targetCard = selectedTargetId ? room.cardLookup?.get(selectedTargetId) : null;

    if (!targetCard) {
      logger.info("[BandHandler] No valid target character found to band.");
      return {
        success: true,
        snapshot: {
          action: AST_ACTIONS.BAND,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          bandedCards: [],
        },
        logEntry: `${player.name} attempts to band, but no eligible character was found.`,
      };
    }

    const fromZone = targetCard.zone;
    const previousControllerId = targetCard.controllerId;
    const isAllyFromOpponent = previousControllerId !== player.sessionId;

    logger.info(
      `[BandHandler] Banding '${targetCard.Name}' (${targetCard.id}) with leader '${leaderCard?.Name || "leader"}' ` +
      `by player '${player.name}' (isAllyFromOpponent=${isAllyFromOpponent}).`
    );

    // Broadcast action telegraph
    if (typeof room.broadcast === "function" && leaderCard) {
      room.broadcast(AST_MESSAGES.ACTION_TELEGRAPH, {
        sourceCardId: leaderCard.id,
        targetCardIds: [targetCard.id],
        action: AST_ACTIONS.BAND,
        durationMs: 500,
      });
    }

    // Move character to battlefield
    const moveResult = moveCard(
      player,
      room.state,
      room.cardLookup,
      fromZone,
      ZONES.BATTLEFIELD,
      targetCard.id,
      1,
      {},
      "",
      "",
      { isAbilityAction: true, isBanded: true }
    );

    const actualCard = (moveResult?.movedCards && moveResult.movedCards[0]) || targetCard;

    // Set Banding flags
    actualCard.isBanded = true;
    actualCard.bandedTo = leaderCard?.id || "";

    // REG lines 958-960: Temporary control if banding allied character of another player
    if (isAllyFromOpponent) {
      actualCard.controllerId = player.sessionId;
    }

    // Trigger battle entrance & recalculation
    BattleService.onCardEnteredBattle(room, player, actualCard, ZONES.BATTLEFIELD);

    const snapshot = {
      action: AST_ACTIONS.BAND,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      leaderCardId: leaderCard?.id || "",
      bandedCardId: targetCard.id,
      fromZone,
      previousControllerId,
      originalOwnerId: targetCard.originalOwnerId,
      isTemporaryControl: isAllyFromOpponent,
    };

    const allyText = isAllyFromOpponent ? " (allied character from opponent)" : "";
    return {
      success: true,
      snapshot,
      logEntry: moveResult?.logEntry || `${player.name} bands ${targetCard.Name}${allyText} into battle!`,
    };
  }

  /**
   * Resolves eligible character targets for banding.
   *
   * @private
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {object} targetDef AST target definition.
   * @param {object} [leaderCard] Character leading the band.
   * @returns {{ eligibleCardIds: string[], requiresSelection: boolean }}
   */
  static _resolveEligibleCandidates(room, actingPlayer, targetDef, leaderCard) {
    const leaderAlignment = (leaderCard?.inGameAlignment || leaderCard?.Alignment || "").toString().toLowerCase();
    const isHeroLeader = BattleCharacterClassifier.isHero(leaderCard);
    const isEvilLeader = BattleCharacterClassifier.isEvilCharacter(leaderCard);

    const eligibleCardIds = [];

    // Eligible zones: territory and hand (REG line 961)
    for (const p of room.state.players.values()) {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      // Self: scan territory and hand. Opponent: scan territory for allied characters of matching alignment
      const zonesToScan = isSelf ? [p[ZONES.TERRITORY], p[ZONES.HAND]] : [p[ZONES.TERRITORY]];

      for (const zoneList of zonesToScan) {
        if (!zoneList) continue;
        for (const card of zoneList) {
          const isChar = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
          if (!isChar) continue;

          // REG line 957: matching alignment
          const cardAlign = (card.inGameAlignment || card.Alignment || "").toString().toLowerCase();
          if (isHeroLeader && !cardAlign.includes("good") && !BattleCharacterClassifier.isHero(card)) continue;
          if (isEvilLeader && !cardAlign.includes("evil") && !BattleCharacterClassifier.isEvilCharacter(card)) continue;

          // Target filter matching (e.g. identifiers, brigades)
          if (!TargetSelectionService.matchesFilter(card, targetDef, { sourceCard: leaderCard, actionType: AST_ACTIONS.BAND })) {
            continue;
          }

          // Protection check (cannot band card protected from band or opponent)
          if (ProtectionService.isProtected(card, leaderCard, AST_ACTIONS.BAND)) {
            continue;
          }

          eligibleCardIds.push(card.id);
        }
      }
    }

    const isManual = targetDef.selection_mode === AST_SELECTION_MODES.MANUAL_CONTROLLER;
    return {
      eligibleCardIds,
      requiresSelection: isManual && eligibleCardIds.length > 0,
    };
  }
}

module.exports = { BandHandler };
