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
const {
  SubmitDrawSequenceCommand,
} = require("../commands/SubmitDrawSequenceCommand");
const {
  ResolveChronicleCommand,
} = require("../commands/ResolveChronicleCommand");
const {
  SelectTargetCommand,
} = require("../commands/SelectTargetCommand");
const {
  RespondOptionalAbilityCommand,
} = require("../commands/RespondOptionalAbilityCommand");
const {
  RespondPhaseTransitionCommand,
} = require("../commands/RespondPhaseTransitionCommand");
const {
  CHRONICLE_MESSAGES,
} = require("../../../shared/effectChronicleConstants");
const {
  AST_MESSAGES,
} = require("../../../shared/astConstants");

class CommandService {
  /**
   * Registers all available commands to the room's dispatcher.
   * @param {import('../rooms/GameRoom').GameRoom} room
   */
  static registerCommands(room) {
    room.dispatcher.register("chat", ChatCommand);
    room.dispatcher.register("moveCard", MoveCardCommand);
    room.dispatcher.register("nextPhase", NextPhaseCommand);
    room.dispatcher.register("respondPhaseTransition", RespondPhaseTransitionCommand);
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
    room.dispatcher.register("submitDrawSequence", SubmitDrawSequenceCommand);
    room.dispatcher.register(CHRONICLE_MESSAGES.RESOLVE_ITEM, ResolveChronicleCommand);
    room.dispatcher.register(AST_MESSAGES.SELECT_TARGET, SelectTargetCommand);
    room.dispatcher.register(AST_MESSAGES.RESPOND_OPTIONAL_ABILITY, RespondOptionalAbilityCommand);
  }
}



module.exports = CommandService;
