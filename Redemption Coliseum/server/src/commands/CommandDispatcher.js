const logger = require("../utils/logger");

class CommandDispatcher {
  constructor(room) {
    this.room = room;
    this.commands = new Map();
  }

  /**
   * Registers a command class for a message type.
   */
  register(type, CommandClass) {
    this.commands.set(type, CommandClass);

    // Register the message handler in the room
    this.room.onMessage(type, (client, message) => {
      this.dispatch(type, client, message);
    });
  }

  dispatch(type, client, message) {
    const CommandClass = this.commands.get(type);
    if (CommandClass) {
      try {
        const cmd = new CommandClass(this.room, client);
        cmd.execute(message);
      } catch (err) {
        logger.error(
          `[CommandDispatcher] Error executing command '${type}' for client '${client?.sessionId}':`,
          err,
        );
      }
    }
  }
}

module.exports = { CommandDispatcher };
