const { BaseCommand } = require("./BaseCommand");

class ConcedeCommand extends BaseCommand {
  execute() {
    const player = this.state.players.get(this.client.sessionId);
    if (player && !this.state.winnerId) {
      this.room.broadcastGameLog(`${player.name || "Player"} has conceded the game.`);

      const winnerId = Array.from(this.state.players.keys()).find(
        (id) => id !== this.client.sessionId
      );
      
      this.room._endGame(winnerId, this.client.sessionId, "concede");
    }
  }
}

module.exports = { ConcedeCommand };