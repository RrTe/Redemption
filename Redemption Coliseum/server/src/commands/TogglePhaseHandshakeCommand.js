// server/src/commands/TogglePhaseHandshakeCommand.js
const { BaseCommand } = require("./BaseCommand");
const logger = require("../utils/logger");

/**
 * Command handling player preference for bilateral phase handshake.
 * Allows either player (active or inactive) to enable/disable their handshake preference.
 */
class TogglePhaseHandshakeCommand extends BaseCommand {
  /**
   * Executes the handshake preference update for the sending client.
   *
   * @param {{ enabled?: boolean }} message Client payload.
   * @returns {void}
   */
  execute(message) {
    const enabled = Boolean(message?.enabled);
    if (!this.room.handshakePreferences) {
      this.room.handshakePreferences = new Map();
    }
    this.room.handshakePreferences.set(this.client.sessionId, enabled);
    logger.info(
      `[TogglePhaseHandshakeCommand] Player '${this.client.sessionId}' set phase handshake to ${enabled}.`,
    );
  }
}

module.exports = { TogglePhaseHandshakeCommand };
