class BaseCommand {
  /**
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {import('colyseus').Client} client
   */
  constructor(room, client) {
    this.room = room;
    this.client = client;
    this.state = room.state;
  }

  execute(message) {
    throw new Error(
      "Command execution logic must be implemented in subclasses.",
    );
  }
}

module.exports = { BaseCommand };
