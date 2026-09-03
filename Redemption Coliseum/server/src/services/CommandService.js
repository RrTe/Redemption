const { ChatCommand } = require("../commands/ChatCommand");
const { MoveCardCommand } = require("../commands/MoveCardCommand");
const { NextPhaseCommand } = require("../commands/NextPhaseCommand");
const {
  ChangeRedeemedSoulsCommand,
} = require("../commands/ChangeRedeemedSoulsCommand");
const {
  UpdateCardStateCommand,
} = require("../commands/UpdateCardStateCommand");
const {
  RequestSearchPileCommand,
} = require("../commands/RequestSearchPileCommand");
const {
  ResolveSearchPileCommand,
} = require("../commands/ResolveSearchPileCommand");
const { CreateTokenCommand } = require("../commands/CreateTokenCommand");
const { ConcedeCommand } = require("../commands/ConcedeCommand");
const {
  RequestLookAtCardsCommand,
} = require("../commands/RequestLookAtCardsCommand");
const {
  RequestRevealCardsCommand,
} = require("../commands/RequestRevealCardsCommand");
const { ResolveRevealCommand } = require("../commands/ResolveRevealCommand");
const { ShufflePileCommand } = require("../commands/ShufflePileCommand");
const {
  DiscardFromDeckCommand,
} = require("../commands/DiscardFromDeckCommand");
const {
  UpdateRevealSelectionCommand,
} = require("../commands/UpdateRevealSelectionCommand");
const { RequestUndoCommand } = require("../commands/RequestUndoCommand");
const { ResolveUndoCommand } = require("../commands/ResolveUndoCommand");

class CommandService {
  /**
   * Registers all available commands to the room's dispatcher.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static registerCommands(room) {
    room.dispatcher.register("chat", ChatCommand);
    room.dispatcher.register("moveCard", MoveCardCommand);
    room.dispatcher.register("nextPhase", NextPhaseCommand);
    room.dispatcher.register("changeRedeemedSouls", ChangeRedeemedSoulsCommand);
    room.dispatcher.register("updateCardState", UpdateCardStateCommand);
    room.dispatcher.register("requestSearchPile", RequestSearchPileCommand);
    room.dispatcher.register("resolveSearchPile", ResolveSearchPileCommand);
    room.dispatcher.register("createToken", CreateTokenCommand);
    room.dispatcher.register("concede", ConcedeCommand);
    room.dispatcher.register("requestLookAtCards", RequestLookAtCardsCommand);
    room.dispatcher.register("requestRevealCards", RequestRevealCardsCommand);
    room.dispatcher.register("resolveReveal", ResolveRevealCommand);
    room.dispatcher.register("updateRevealSelection", UpdateRevealSelectionCommand);
    room.dispatcher.register("shufflePile", ShufflePileCommand);
    room.dispatcher.register("discardFromDeck", DiscardFromDeckCommand);
    room.dispatcher.register("requestUndo", RequestUndoCommand);
    room.dispatcher.register("resolveUndo", ResolveUndoCommand);
  }
}

module.exports = CommandService;
