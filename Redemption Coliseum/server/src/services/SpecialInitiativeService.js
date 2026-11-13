// server/src/services/SpecialInitiativeService.js
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");
const { ActionTelegraphService } = require("./ActionTelegraphService");
const { BattleCharacterClassifier } = require("./BattleCharacterClassifier");
const { ChronicleHistoryService } = require("./ChronicleHistoryService");
const { EffectChronicleService } = require("./EffectChronicleService");
const { BattleService } = require("./BattleService");
const { formatCardLink } = require("../utils/gameLogFormatter");
const logger = require("../utils/logger");

/**
 * Service orchestrating Special Initiative checks and non-modal BattleHUD state per official REG guidelines.
 * Triggers whenever an opponent's card ability would remove the only/all characters a player controls in battle.
 */
class SpecialInitiativeService {
  /**
   * Checks whether removing cards triggers Special Initiative for an opponent in battle.
   * If triggered, pauses execution, stores pendingSpecialInitiative, activates BattleState.specialInitiativePlayerId,
   * and returns result object without opening a modal dialog.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Player executing the effect.
   * @param {Array<object>} removingCandidates List of card objects or { card, owner } being removed.
   * @param {object} item Active chronicle item.
   * @param {object} [options={}] Execution options.
   * @param {string} [reasonText="targeted for discard"] Context text for prompt.
   * @returns {{ success: boolean, handled: boolean, awaitingSpecialInitiative: boolean, targetCard: object, targetCards: object[], targetOwner: object } | null}
   */
  static checkAndTrigger(room, actingPlayer, removingCandidates, item, options = {}, reasonText = "targeted for discard") {
    if (
      !room ||
      !actingPlayer ||
      room.state?.currentPhase !== PHASES.BATTLE ||
      options.specialInitiativeDeclined ||
      !Array.isArray(removingCandidates) ||
      removingCandidates.length === 0
    ) {
      return null;
    }

    const opponentBattleTargetsByController = new Map();
    for (const cand of removingCandidates) {
      const card = cand.card || cand;
      const owner = cand.owner || room.state.players.get(card.controllerId || card.ownerId);
      const combatantControllerId = card.controllerId || owner?.sessionId;
      const isCharacter = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);

      if (isCharacter && card.zone === ZONES.BATTLEFIELD && combatantControllerId !== actingPlayer.sessionId) {
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

    if (!siTargetCards || siTargetCards.length === 0) {
      return null;
    }

    const primaryTarget = siTargetCards[0];
    const targetController = room.state.players.get(siControllerId) || primaryTarget.owner;
    const isMultiple = siTargetCards.length > 1;
    const promptTargetText = isMultiple
      ? `All characters (${siTargetCards.length})`
      : primaryTarget.Name;
    const logTargetText = isMultiple
      ? promptTargetText
      : formatCardLink(primaryTarget);

    logger.info(
      `[SpecialInitiativeService] Special Initiative triggered: Opponent '${actingPlayer.name}' ${reasonText} on ${promptTargetText} of '${targetController?.name}'.`
    );

    const resolvedControllerId = targetController?.sessionId || siControllerId;
    const chronicle = room.state.effectChronicle;
    if (chronicle && resolvedControllerId) {
      chronicle.priorityPlayerId = resolvedControllerId;
    }

    if (room.state.battle && resolvedControllerId) {
      room.state.battle.specialInitiativePlayerId = resolvedControllerId;
    }

    if (item && resolvedControllerId) {
      item.pendingSpecialInitiative = {
        targetCardId: primaryTarget.id,
        targetCardIds: siTargetCards.map((c) => c.id),
        targetOwnerId: resolvedControllerId,
        initiatorId: actingPlayer.sessionId,
        options,
        reasonText,
      };
      room._pendingSpecialInitiativeItem = item;
    }

    if (typeof room.broadcastGameLog === "function") {
      if (item && Array.isArray(item._accumulatedLogs) && item._accumulatedLogs.length > 0) {
        item._accumulatedLogs.forEach((msg) => room.broadcastGameLog(msg));
        item._accumulatedLogs = [];
      }
      room.broadcastGameLog(
        `⚡ Special Initiative: ${logTargetText} in battle ${reasonText}! ${targetController?.name || "Defender"} may play an Enhancement or Pass.`
      );
    }

    ActionTelegraphService.send(room, {
      sourceCardId: item?.cardId,
      targetCardIds: siTargetCards.map((c) => c.id),
      isSpecialInitiative: true,
      persistent: true,
    });

    return {
      success: true,
      handled: true,
      awaitingSpecialInitiative: true,
      targetCard: primaryTarget,
      targetCards: siTargetCards,
      targetOwner: targetController,
    };
  }

  /**
   * Resolves passing Special Initiative: clears specialInitiativePlayerId, resumes the paused
   * removal/discard ability, and advances the Effect Chronicle.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} player Defending player passing Special Initiative.
   */
  static resolveSpecialInitiativePass(room, player) {
    if (!room || !room.state) return;
    if (room.state.battle) {
      room.state.battle.specialInitiativePlayerId = "";
    }

    const chronicle = room.state.effectChronicle;
    let index = -1;
    let item = null;

    if (chronicle && chronicle.items?.length > 0) {
      index = chronicle.items.findIndex((i) => Boolean(i.pendingSpecialInitiative));
      if (index !== -1) {
        item = chronicle.items[index];
      }
    }
    if (!item && room._pendingSpecialInitiativeItem?.pendingSpecialInitiative) {
      item = room._pendingSpecialInitiativeItem;
    }
    room._pendingSpecialInitiativeItem = null;

    if (item && chronicle && index === -1 && chronicle.items?.length > 0) {
      index = chronicle.items.findIndex((i) => i.id === item.id);
    }

    if (item && item.pendingSpecialInitiative) {
      const psi = item.pendingSpecialInitiative;
      item.pendingSpecialInitiative = null;

      ActionTelegraphService.clear(room, { sourceCardId: item?.cardId });

      if (chronicle) {
        chronicle.priorityPlayerId = psi.initiatorId;
      }

      const isMultiple = Array.isArray(psi.targetCardIds) && psi.targetCardIds.length > 1;
      const targetCard = room.cardLookup?.get(psi.targetCardId);
      const cardName = isMultiple
        ? `all ${psi.targetCardIds.length} characters`
        : formatCardLink(targetCard, "character");

      if (typeof room.broadcastGameLog === "function") {
        room.broadcastGameLog(`${player?.name || "Player"} passes Special Initiative on ${cardName}.`);
      }

      const targetIds = psi.targetCardIds || [psi.targetCardId];
      ActionTelegraphService.send(room, {
        sourceCardId: item?.cardId,
        targetCardIds: targetIds,
        action: AST_ACTIONS.DISCARD,
        durationMs: 500,
      });

      if (room.abilityResolver && typeof room.abilityResolver.resolve === "function") {
        const resumeResult = room.abilityResolver.resolve(item, {
          ...psi.options,
          specialInitiativeDeclined: true,
          targetCardIds: targetIds,
        });
        if (
          resumeResult &&
          (resumeResult.awaitingTargetSelection ||
            resumeResult.awaitingSpecialInitiative ||
            resumeResult.awaitingConfirmation)
        ) {
          BattleService.recalculate(room);
          return;
        }
        if (resumeResult?.logEntries?.length && typeof room.broadcastGameLog === "function") {
          resumeResult.logEntries.forEach((msg) => room.broadcastGameLog(msg));
        }
      }

      if (chronicle && index !== -1) {
        ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);
        if (chronicle.items.length === 0) {
          EffectChronicleService.finishChronicle(room);
        } else {
          const nextItem = chronicle.items[0];
          chronicle.priorityPlayerId = nextItem.controllerId;
          const nextClient = room.clients?.find((c) => c.sessionId === nextItem.controllerId) || {
            sessionId: nextItem.controllerId,
          };
          EffectChronicleService.executeItem(room, nextClient, nextItem.id, { autoExecuteSupported: true });
        }
      }
    }

    BattleService.recalculate(room);
  }

  /**
   * Consumes active Special Initiative when the defending player plays an Enhancement or Dominant,
   * cleaning up the paused Chronicle item before the newly played card's ability is enqueued.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} player Defending player playing a card.
   * @param {object} [playedCard] The card being played in Special Initiative.
   */
  static consumeSpecialInitiativeOnPlay(room, player, playedCard) {
    if (!room || !room.state?.battle) return;
    if (room.state.battle.specialInitiativePlayerId !== player?.sessionId) return;

    room.state.battle.specialInitiativePlayerId = "";
    const chronicle = room.state.effectChronicle;
    let index = -1;
    let item = null;

    if (chronicle && chronicle.items?.length > 0) {
      index = chronicle.items.findIndex((i) => Boolean(i.pendingSpecialInitiative));
      if (index !== -1) {
        item = chronicle.items[index];
      }
    }
    if (!item && room._pendingSpecialInitiativeItem?.pendingSpecialInitiative) {
      item = room._pendingSpecialInitiativeItem;
    }
    room._pendingSpecialInitiativeItem = null;

    if (item) {
      item.pendingSpecialInitiative = null;
      ActionTelegraphService.clear(room, { sourceCardId: item?.cardId });

      if (chronicle && index !== -1) {
        ChronicleHistoryService.recordHistory(chronicle, item, CHRONICLE_STATUS.COMPLETED);
        chronicle.items.splice(index, 1);
        EffectChronicleService._reindexOrders(chronicle);
        if (chronicle.items.length === 0) {
          EffectChronicleService.finishChronicle(room);
        }
      }
    }

    if (typeof room.broadcastGameLog === "function") {
      room.broadcastGameLog(
        `✨ ${player?.name || "Player"} plays ${playedCard ? formatCardLink(playedCard) : "a card"} in Special Initiative!`
      );
    }
  }
}

module.exports = { SpecialInitiativeService };

