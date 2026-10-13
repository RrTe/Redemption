// server/tests/chatCommandAstTest.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ChatCommand } = require("../src/commands/ChatCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { ZONES } = require("../../shared/zones");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("ChatCommand DEV Fast-Track for AST abilities", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;

  beforeEach(() => {
    state = new RoomState();
    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Hero 474";

    player2 = new PlayerState();
    player2.sessionId = "p2";
    player2.name = "Test1";

    state.players.set("p1", player1);
    state.players.set("p2", player2);
    state.activePlayer = "p1";

    client1 = {
      sessionId: "p1",
      send: jest.fn(),
      userData: { playerName: "Hero 474" },
    };

    room = {
      state,
      clients: [client1],
      cardLookup: new Map(),
      chatHistory: [],
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = new Card();
    card.id = id;
    card.templateId = templateId;
    card.Name = name;
    card.zone = zone;
    card.ownerId = ownerId;
    card.originalOwnerId = ownerId;
    card.controllerId = ownerId;
    Object.assign(card, extra);
    room.cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  test("'/test Egyptian Horsemen' automatically executes draw of 2 cards into player hand", () => {
    createCard("deck_1", "101", "Card 1", ZONES.DECK, "p1");
    createCard("deck_2", "102", "Card 2", ZONES.DECK, "p1");
    const horsemen = createCard("c_horse", "2041723113", "Egyptian Horsemen (1st Print - K)", ZONES.HAND, "p1");

    expect(player1.hand.length).toBe(1);
    expect(player1.deck.length).toBe(2);

    const chatCmd = new ChatCommand(room, client1);
    chatCmd.execute({ text: "/test Egyptian Horsemen" });

    // Auto-executes, draws 2 cards, finishes chronicle
    expect(player1.deck.length).toBe(0);
    expect(player1.hand.length).toBe(3);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Hero 474 draws 2 card(s)")
    );
  });

  test("'/test Samuel\\'s Edict' automatically executes and requests target selection for evil character", () => {
    const edict = createCard("c_edict", "-2097085070", "Samuel's Edict (1st Print - K)", ZONES.TERRITORY, "p1");
    const evil = createCard("e_horse", "2041723113", "Egyptian Horsemen", ZONES.BATTLEFIELD, "p2", {
      Alignment: "Evil",
      IsCharacter: true,
    });

    const chatCmd = new ChatCommand(room, client1);
    chatCmd.execute({ text: "/test Samuel's Edict" });

    // Item must be enqueued and awaiting client target selection
    expect(state.effectChronicle.items.length).toBe(1);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_TARGET_SELECTION,
      expect.objectContaining({
        targetType: "card",
        eligibleCardIds: [evil.id],
      })
    );

    // Player selects the evil character
    const selectTargetCmd = new SelectTargetCommand(room, client1);
    selectTargetCmd.execute({
      itemId: state.effectChronicle.items[0].id,
      selectedCardIds: [evil.id],
    });

    expect(state.battlefield.length).toBe(0);
    expect(player2.discard.length).toBe(1);
    expect(player2.discard[0].id).toBe(evil.id);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
  });
});
