const logger = require("../utils/logger");

class GameLogService {
  /**
   * Broadcasts a game log message and stores it in the history.
   * @param {import('../rooms/GameRoom').GameRoom} room
   * @param {string} text
   */
  static broadcastGameLog(room, text) {
    const msg = { type: "gameLog", text: text };
    room.chatHistory.push(msg);
    room.broadcast("gameLog", msg);
  }

  static addChatMessage(room, text) {
    // Logic for regular chat if needed later
  }
}

module.exports = GameLogService;
