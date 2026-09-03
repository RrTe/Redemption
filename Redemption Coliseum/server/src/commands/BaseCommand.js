class BaseCommand {
  /**
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   */
  constructor(room, client) {
    this.room = room;
    this.client = client;
    this.state = room.state;
    this.canUndo = false;
  }

  execute(message) {
    throw new Error(
      "Command execution logic must be implemented in subclasses.",
    );
  }

  undo() {
    throw new Error(
      "Command undo logic must be implemented in subclasses.",
    );
  }
}

module.exports = { BaseCommand };
