const { BaseCommand } = require("./BaseCommand");

class ChatCommand extends BaseCommand {
  execute(message) {
    const msg = {
      type: "chat",
      sender: this.client.userData.playerName,
      text: message.text,
      sessionId: this.client.sessionId,
    };
    this.room.chatHistory.push(msg);
    this.room.broadcast("chat", msg);
  }
}

module.exports = { ChatCommand };