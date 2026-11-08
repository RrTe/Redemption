// server/src/ast/handlers/BandHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES } = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleCharacterClassifier } = require("../../services/BattleCharacterClassifier");
const { BattleService } = require("../../services/BattleService");
const { ActionTelegraphService } = require("../../services/ActionTelegraphService");
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
    let effectiveLeader = leaderCard;
    if (!effectiveLeader || (!BattleCharacterClassifier.isHero(effectiveLeader) && !BattleCharacterClassifier.isEvilCharacter(effectiveLeader))) {
      effectiveLeader = (room.state?.battlefield || []).find(
        (c) => c.controllerId === player.sessionId && (BattleCharacterClassifier.isHero(c) || BattleCharacterClassifier.isEvilCharacter(c))
      ) || leaderCard;
    }
    const targetDef = effect?.target || {};

    // 1. Resolve eligible target candidates
    const eligible = this._resolveEligibleCandidates(room, player, targetDef, effectiveLeader);

    // If selection is manual and no explicit targets submitted, request client selection
    const explicitIds = options.targetCardIds || [];
    if (explicitIds.length === 0 && eligible.requiresSelection) {
      const client = room.clients?.find((c) => c.sessionId === player.sessionId);
      if (client && typeof client.send === "function") {
        client.send(AST_MESSAGES.REQUEST_TARGET_SELECTION, {
          abilityId: item.abilityId || "band",
          itemId: item.id,
          sourceCardId: leaderCard?.id || item?.cardId,
          promptText: targetDef.prompt_text || "Select character(s) to band into battle",
          targetType: "card",
          eligibleCardIds: eligible.eligibleCardIds,
          eligiblePiles: [],
          minTargets: eligible.minTargets || 1,
          maxTargets: eligible.maxTargets || 1,
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

    const isAll =
      targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL ||
      targetDef.all === true;
    const targetIds = explicitIds.length > 0
      ? explicitIds
      : (isAll ? eligible.eligibleCardIds : (eligible.eligibleCardIds[0] ? [eligible.eligibleCardIds[0]] : []));

    const targetCards = targetIds
      .map((id) => room.cardLookup?.get(id))
      .filter(Boolean);

    if (targetCards.length === 0) {
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

    const movedBandedCards = [];
    const bandedRecords = [];
    const movedCardEntries = [];
    const logNames = [];

    for (const targetCard of targetCards) {
      const fromZone = targetCard.zone;
      const previousControllerId = targetCard.controllerId;
      const isAllyFromOpponent = previousControllerId !== player.sessionId;

      logger.info(
        `[BandHandler] Banding '${targetCard.Name}' (${targetCard.id}) with leader '${effectiveLeader?.Name || "leader"}' ` +
        `by player '${player.name}' (isAllyFromOpponent=${isAllyFromOpponent}).`
      );

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
      actualCard.bandedTo = effectiveLeader?.id || "";

      // REG lines 958-960: Temporary control if banding allied character of another player
      if (isAllyFromOpponent) {
        actualCard.controllerId = player.sessionId;
      }

      movedBandedCards.push(actualCard);
      bandedRecords.push({
        bandedCardId: actualCard.id,
        fromZone,
        previousControllerId,
        originalOwnerId: actualCard.originalOwnerId,
        isTemporaryControl: isAllyFromOpponent,
      });
      movedCardEntries.push({
        cardId: actualCard.id,
        fromZone,
        toZone: ZONES.BATTLEFIELD,
      });

      const allyText = isAllyFromOpponent ? " (allied character from opponent)" : "";
      logNames.push(`${actualCard.Name}${allyText}`);
    }

    // Broadcast action telegraph for all banded characters
    ActionTelegraphService.send(room, {
      sourceCardId: leaderCard?.id,
      targetCardIds: movedBandedCards.map((c) => c.id),
      action: AST_ACTIONS.BAND,
      durationMs: 500,
    });

    // Trigger battle entrance triggers in exact selected order (REG Ability Activation Order Step 5)
    const { BattleTriggerService } = require("../../services/BattleTriggerService");
    BattleTriggerService.onCardEnteredBattlefield(
      room,
      player,
      movedBandedCards,
      { from: bandedRecords[0].fromZone, to: ZONES.BATTLEFIELD }
    );

    // Trigger battle entrance & recalculation for each banded character
    for (const actualCard of movedBandedCards) {
      BattleService.onCardEnteredBattle(room, player, actualCard, ZONES.BATTLEFIELD);
    }

    const firstRecord = bandedRecords[0];
    const snapshot = {
      action: AST_ACTIONS.BAND,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      leaderCardId: leaderCard?.id || "",
      bandedCardId: firstRecord.bandedCardId,
      fromZone: firstRecord.fromZone,
      previousControllerId: firstRecord.previousControllerId,
      originalOwnerId: firstRecord.originalOwnerId,
      isTemporaryControl: firstRecord.isTemporaryControl,
      bandedCards: bandedRecords,
      movedCards: movedCardEntries,
    };

    return {
      success: true,
      snapshot,
      logEntry: `${player.name} bands ${logNames.join(", ")} into battle!`,
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
   * @returns {{ eligibleCardIds: string[], minTargets: number, maxTargets: number, requiresSelection: boolean }}
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
    const isAll =
      targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL ||
      targetDef.all === true;
    const hasCustomMin = targetDef.count && typeof targetDef.count.min_value === "number";
    const hasCustomMax = targetDef.count && typeof targetDef.count.max_value === "number";
    const count = typeof targetDef.count === "number"
      ? targetDef.count
      : (targetDef.count?.fixed_value || 1);

    const minTargets = isAll
      ? eligibleCardIds.length
      : (hasCustomMin ? Math.min(targetDef.count.min_value, eligibleCardIds.length) : Math.min(count, Math.max(1, eligibleCardIds.length)));
    const maxTargets = isAll
      ? Math.max(1, eligibleCardIds.length)
      : (hasCustomMax ? Math.max(1, Math.min(targetDef.count.max_value, eligibleCardIds.length || 1)) : Math.max(1, count));

    const isOptional = hasCustomMin && targetDef.count.min_value === 0 && eligibleCardIds.length > 0;
    const requiresSelection =
      (isManual && eligibleCardIds.length > 0) ||
      (isAll && eligibleCardIds.length > 1) ||
      isOptional;

    return {
      eligibleCardIds,
      minTargets,
      maxTargets,
      requiresSelection,
    };
  }
}

module.exports = { BandHandler };
