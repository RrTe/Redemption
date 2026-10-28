// server/src/services/BattleService.js
const { BattleCalculator } = require("../../../shared/BattleCalculator");
const { BATTLE_STATE_REASON } = require("../../../shared/battleConstants");
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");
const logger = require("../utils/logger");

/**
 * Service orchestrating live battle calculations, tracking battle entrance,
 * and synchronizing BattleState schema properties across clients.
 */
class BattleService {
  /**
   * Finds the opponent (defender) session ID relative to the active player.
   *
   * @param {object} state RoomState instance.
   * @returns {string} Defender session ID or empty string.
   */
  static getDefenderSessionId(state) {
    if (!state || !state.players) return "";
    for (const sessionId of state.players.keys()) {
      if (sessionId !== state.activePlayer) {
        return sessionId;
      }
    }
    return "";
  }

  /**
   * Handles a card entering battle. Updates last card played tracker and triggers recalculation.
   * Dominants or moves outside ZONES.BATTLEFIELD never count as cards played in battle.
   *
   * @param {any} room GameRoom instance.
   * @param {object} player Acting player.
   * @param {object} card Card instance entering battle.
   * @param {string} toZone Destination zone.
   */
  static onCardEnteredBattle(room, player, card, toZone) {
    if (!room || !room.state || toZone !== ZONES.BATTLEFIELD) {
      return;
    }

    // Dominants are never played "in battle"
    const typeStr = (card?.inGameType || card?.Type || "").toString().toLowerCase();
    const isDominant = typeStr.includes("dominant") || (card?.Identifier || "").toLowerCase().includes("dominant");

    if (isDominant) {
      logger.debug(
        `[BattleService] Dominant '${card?.Name}' played during battle; does NOT count as played in battle.`
      );
      this.recalculate(room);
      return;
    }

    const playerId = player?.sessionId || card?.controllerId;
    if (playerId) {
      room.state.lastBattleCardPlayerId = playerId;
      logger.info(
        `[BattleService] Last card played in battle set to '${playerId}' (${card?.Name || card?.id}).`
      );

      if (room.state.battle && room.state.battle.specialInitiativePlayerId === playerId) {
        room.state.battle.specialInitiativePlayerId = "";
        logger.info(
          `[BattleService] Special Initiative fulfilled by '${playerId}'. Cleared specialInitiativePlayerId.`
        );
      }
    }

    this.recalculate(room);
  }

  /**
   * Recalculates battle numbers and updates state.battle schema.
   *
   * @param {any} roomOrState GameRoom instance or RoomState schema.
   * @returns {object|null} Evaluation result or null.
   */
  static recalculate(roomOrState) {
    const state = roomOrState?.state || roomOrState;
    if (!state || !state.battle) return null;

    const activePlayerId = state.activePlayer || "";
    const defenderPlayerId = this.getDefenderSessionId(state);

    const result = BattleCalculator.evaluateBattle({
      battlefield: state.battlefield ? Array.from(state.battlefield) : [],
      activePlayerId,
      defenderPlayerId,
      lastBattleCardPlayerId: state.lastBattleCardPlayerId || "",
      currentPhase: state.currentPhase || PHASES.BATTLE,
    });

    state.battle.rescuerStrength = result.rescuer.strength;
    state.battle.rescuerToughness = result.rescuer.toughness;
    state.battle.blockerStrength = result.blocker.strength;
    state.battle.blockerToughness = result.blocker.toughness;
    state.battle.initiativePlayerId = result.initiativePlayerId;
    state.battle.stateReason = result.stateReason;
    state.battle.lastCardPlayedPlayerId = state.lastBattleCardPlayerId || "";

    logger.debug(
      `[BattleService] Recalculated: Rescuer ${result.rescuer.strength}/${result.rescuer.toughness}, ` +
      `Blocker ${result.blocker.strength}/${result.blocker.toughness}, Reason: ${result.stateReason}, ` +
      `Initiative: ${result.initiativePlayerId || "none"}`
    );

    return result;
  }

  /**
   * Resets battle state and the last card played tracker to default values.
   *
   * @param {any} roomOrState GameRoom instance or RoomState schema.
   */
  static reset(roomOrState) {
    const state = roomOrState?.state || roomOrState;
    if (!state || !state.battle) return;

    state.lastBattleCardPlayerId = "";
    state.battle.rescuerStrength = 0;
    state.battle.rescuerToughness = 0;
    state.battle.blockerStrength = 0;
    state.battle.blockerToughness = 0;
    state.battle.initiativePlayerId = "";
    state.battle.specialInitiativePlayerId = "";
    state.battle.stateReason = BATTLE_STATE_REASON.NO_BATTLE;
    state.battle.lastCardPlayedPlayerId = "";

    // Clean up banded cards, temporary control, and phase immunities on battlefield
    if (state.battlefield) {
      for (const card of state.battlefield) {
        if (card.isBanded) {
          card.isBanded = false;
          card.bandedTo = "";
          if (card.originalOwnerId && card.controllerId !== card.originalOwnerId) {
            logger.info(
              `[BattleService] Reverting temporary control of banded card '${card.Name}' (${card.id}) to original owner '${card.originalOwnerId}'.`
            );
            card.controllerId = card.originalOwnerId;
          }
        }
        if (card.isImmune || card.isProtected) {
          if (!card._protection || card._protection.duration !== "permanent") {
            card.isImmune = false;
            card.isProtected = false;
            card.protectionReason = "";
            card._protection = null;
          }
        }
      }
    }

    logger.debug("[BattleService] Battle state reset to default NO_BATTLE.");
  }
}

module.exports = { BattleService };

