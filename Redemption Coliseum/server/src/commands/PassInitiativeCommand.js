const { BaseCommand } = require("./BaseCommand");
const { PHASES } = require("../../../shared/phases");
const { BattleService } = require("../services/BattleService");
const { SpecialInitiativeService } = require("../services/SpecialInitiativeService");
const { ChronicleRollbackService } = require("../services/ChronicleRollbackService");
const logger = require("../utils/logger");

/**
 * Command triggered when a player clicks 'Pass' on the BattleHUD to pass
 * Special Initiative or normal Battle Initiative.
 */
class PassInitiativeCommand extends BaseCommand {
  constructor(room, client) {
    super(room, client);
    this._mode = "";
    this._prevOverride = "";
    this.chronicleTx = null;
    this._undone = false;
  }

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
      const tx = ChronicleRollbackService.beginTransaction(this.room, { command: "PassInitiativeCommand" });
      try {
        SpecialInitiativeService.resolveSpecialInitiativePass(this.room, player);
      } finally {
        this.chronicleTx = ChronicleRollbackService.endTransaction(this.room, tx);
      }
      this._mode = "si_pass";
      this.canUndo = true;
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

    this._prevOverride = this.state.battle.initiativeOverridePlayerId || "";
    this.state.battle.initiativeOverridePlayerId = opponentId;
    BattleService.recalculate(this.room);
    this._mode = "normal_pass";
    this.canUndo = true;

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

  undo() {
    if (this._undone || !this._mode) return;
    this._undone = true;

    const player = this.state.players.get(this.client.sessionId);
    if (!player) return;

    if (this._mode === "si_pass" && this.chronicleTx) {
      ChronicleRollbackService.rollbackTransaction(this.room, this.chronicleTx, player, {
        reprompt: true,
      });
      if (typeof this.room.broadcastGameLog === "function") {
        this.room.broadcastGameLog(`[UNDO] ${player.name} rewound Special Initiative pass.`);
      }
      return;
    }

    if (this._mode === "normal_pass" && this.state.battle) {
      this.state.battle.initiativeOverridePlayerId = this._prevOverride;
      BattleService.recalculate(this.room);
      if (typeof this.room.broadcastGameLog === "function") {
        this.room.broadcastGameLog(`[UNDO] ${player.name} reverted battle initiative pass.`);
      }
    }
  }
}

module.exports = { PassInitiativeCommand };

