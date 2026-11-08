const { BaseCommand } = require("./BaseCommand");
const { PHASES } = require("../../../shared/phases");
const { BattleService } = require("../services/BattleService");
const { SpecialInitiativeService } = require("../services/SpecialInitiativeService");
const logger = require("../utils/logger");

/**
 * Command triggered when a player clicks 'Pass' on the BattleHUD to pass
 * Special Initiative or normal Battle Initiative.
 */
class PassInitiativeCommand extends BaseCommand {
  execute() {
    if (this.state.currentPhase !== PHASES.BATTLE || !this.state.battle) {
      return;
    }

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    // 1. Passing Special Initiative: resolves the paused removal/discard ability
    if (this.state.battle.specialInitiativePlayerId) {
      if (this.state.battle.specialInitiativePlayerId !== this.client.sessionId) {
        logger.warn(
          `[PassInitiativeCommand] Client '${this.client.sessionId}' attempted to pass Special Initiative held by '${this.state.battle.specialInitiativePlayerId}'.`
        );
        return;
      }

      logger.info(`[PassInitiativeCommand] Player '${this.client.sessionId}' passes Special Initiative.`);
      SpecialInitiativeService.resolveSpecialInitiativePass(this.room, player);
      return;
    }

    // 2. Passing Normal Initiative: transfers initiative to the opponent
    if (this.state.battle.initiativePlayerId !== this.client.sessionId) {
      logger.warn(
        `[PassInitiativeCommand] Client '${this.client.sessionId}' attempted to pass normal initiative without holding it.`
      );
      return;
    }

    if (this.state.effectChronicle && this.state.effectChronicle.items.length > 0) {
      logger.warn(
        "[PassInitiativeCommand] Blocked passInitiative: Effect Chronicle items are still pending."
      );
      return;
    }

    const activePlayerId = this.state.activePlayer || "";
    const defenderPlayerId = BattleService.getDefenderSessionId(this.state);
    const opponentId = this.client.sessionId === activePlayerId ? defenderPlayerId : activePlayerId;
    if (!opponentId) return;

    this.state.battle.initiativeOverridePlayerId = opponentId;
    BattleService.recalculate(this.room);

    const opponent = this.state.players.get(opponentId);
    if (typeof this.room.broadcastGameLog === "function") {
      this.room.broadcastGameLog(
        `${player.name} passes initiative to ${opponent?.name || "opponent"}.`
      );
    }
    logger.info(
      `[PassInitiativeCommand] Player '${this.client.sessionId}' passed initiative to '${opponentId}'.`
    );
  }
}

module.exports = { PassInitiativeCommand };

