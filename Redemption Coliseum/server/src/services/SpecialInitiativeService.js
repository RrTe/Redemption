// server/src/services/SpecialInitiativeService.js
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");
const { AST_MESSAGES } = require("../../../shared/astConstants");
const { ActionTelegraphService } = require("./ActionTelegraphService");
const { BattleCharacterClassifier } = require("./BattleCharacterClassifier");
const logger = require("../utils/logger");

/**
 * Service orchestrating Special Initiative checks and prompts per official REG guidelines.
 * Triggers whenever an opponent's card ability would remove the only/all characters a player controls in battle.
 */
class SpecialInitiativeService {
  /**
   * Checks whether removing cards triggers Special Initiative for an opponent in battle.
   * If triggered, pauses execution, stores pendingSpecialInitiative, sends prompt, and returns result object.
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

    logger.info(
      `[SpecialInitiativeService] Special Initiative triggered: Opponent '${actingPlayer.name}' ${reasonText} on ${promptTargetText} of '${targetController?.name}'.`
    );

    const chronicle = room.state.effectChronicle;
    if (chronicle && targetController) {
      chronicle.priorityPlayerId = targetController.sessionId;
    }

    if (item && targetController) {
      item.pendingSpecialInitiative = {
        targetCardId: primaryTarget.id,
        targetCardIds: siTargetCards.map((c) => c.id),
        targetOwnerId: targetController.sessionId,
        initiatorId: actingPlayer.sessionId,
        options,
      };
    }

    const targetClient = room.clients?.find((c) => c.sessionId === targetController?.sessionId);
    if (targetClient && typeof targetClient.send === "function") {
      targetClient.send(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, {
        abilityId: "special_initiative",
        itemId: item?.id || "",
        cardId: primaryTarget.id,
        cardTitle: primaryTarget.Name,
        promptText: `${promptTargetText} in battle ${reasonText}! Declare Special Initiative?`,
        action: "special_initiative",
        cardImageFile: primaryTarget.ImageFile || "",
        templateId: primaryTarget.templateId || "",
      });
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
}

module.exports = { SpecialInitiativeService };

