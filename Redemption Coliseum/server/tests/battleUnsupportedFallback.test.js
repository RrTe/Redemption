// server/tests/battleUnsupportedFallback.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const { AST_MESSAGES } = require("../../shared/astConstants");

describe("Battle Trigger Unsupported AST Graceful Fallback & Sequence", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;
  let client2Messages;

  beforeEach(() => {
    state = new RoomState();
    p1 = new PlayerState();
    p1.sessionId = "p1";
    p1.name = "Hero 474";

    p2 = new PlayerState();
    p2.sessionId = "p2";
    p2.name = "Test1";

    state.players.set("p1", p1);
    state.players.set("p2", p2);

    client1 = { sessionId: "p1", send: jest.fn() };
    client2Messages = [];
    client2 = {
      sessionId: "p2",
      send: jest.fn((type, payload) => client2Messages.push({ type, payload })),
    };

    room = {
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  it("completes unsupported AST actions gracefully and does not deadlock subsequent triggers", () => {
    // 1. Eli the Priest enters battle with unsupported 'search' action
    const eli = {
      id: "eli_1",
      templateId: "-175529066",
      Name: "Eli the Priest (RoA)",
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      controllerId: "p1",
    };
    room.cardLookup.set("eli_1", eli);

    BattleTriggerService.handleCardBattleEntry(room, p1, eli, { to: "battlefield", from: "territory" });

    // Eli prompts Player 1 with optional ability
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "ab_2_band" })
    );
    expect(state.effectChronicle.items.length).toBe(1);

    // Player 1 confirms Eli's prompt
    const respondEli = new RespondOptionalAbilityCommand(room, client1);
    respondEli.execute({ itemId: state.effectChronicle.items[0].id, accepted: true });

    // Eli completes gracefully and records history
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].title).toBe("Eli the Priest (RoA)");
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);

    // 2. Player 2 blocks with Egyptian Horsemen (optional draw trigger)
    const horsemen1 = {
      id: "horse_1",
      templateId: "2041723113",
      Name: "Egyptian Horsemen",
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      controllerId: "p2",
    };
    room.cardLookup.set("horse_1", horsemen1);

    BattleTriggerService.handleCardBattleEntry(room, p2, horsemen1, { to: "battlefield", from: "territory" });

    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "ab_1_draw" })
    );
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.priorityPlayerId).toBe("p2");

    // 3. Player 2 responds (declines)
    const respondCmd = new RespondOptionalAbilityCommand(room, client2);
    respondCmd.execute({ itemId: state.effectChronicle.items[0].id, accepted: false });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);

    // 4. Player 2 blocks with a second Evil Character
    const horsemen2 = {
      id: "horse_2",
      templateId: "2041723113",
      Name: "Egyptian Horsemen 2",
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      controllerId: "p2",
    };
    room.cardLookup.set("horse_2", horsemen2);

    client2.send.mockClear();
    BattleTriggerService.handleCardBattleEntry(room, p2, horsemen2, { to: "battlefield", from: "territory" });

    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "ab_1_draw" })
    );
    expect(state.effectChronicle.items.length).toBe(1);
  });
});
