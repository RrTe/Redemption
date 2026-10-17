// server/tests/battleAbiatharMultiStep.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const { ActionType } = require("../../shared/actions");

describe("Phase 3: Multi-Step Attack & Block Resolution (Abiathar & Egyptian Horsemen)", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;
  let client2;
  let sentMessages1;
  let sentMessages2;

  beforeEach(() => {
    state = new RoomState();

    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Hero Player";

    player2 = new PlayerState();
    player2.sessionId = "p2";
    player2.name = "Defending Player";

    state.players.set("p1", player1);
    state.players.set("p2", player2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    sentMessages1 = [];
    sentMessages2 = [];

    client1 = {
      sessionId: "p1",
      send: jest.fn((msgType, payload) => {
        sentMessages1.push({ msgType, payload });
      }),
      userData: { playerName: "Hero Player" },
    };

    client2 = {
      sessionId: "p2",
      send: jest.fn((msgType, payload) => {
        sentMessages2.push({ msgType, payload });
      }),
      userData: { playerName: "Defending Player" },
    };

    room = {
      roomId: "multi-battle-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
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
    card.ImageFile = `${templateId}_art`;
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

  test("Abiathar attack enqueues 1 item, gracefully falls back upon activation, then Egyptian Horsemen block prompts Player 2 correctly", () => {
    // 1. Setup Player 1 with Abiathar [K] (templateId: "2117585467") in Territory
    const abiathar = createCard("c_abiathar", "2117585467", "Abiathar [K]", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      SpecialAbility: "You may look at opponent's hand or take a good O.T. card from Reserve.",
    });

    // Setup Player 2 with deck and Egyptian Horsemen in Territory
    createCard("p2_deck1", "101", "Evil Deck 1", ZONES.DECK, "p2");
    createCard("p2_deck2", "102", "Evil Deck 2", ZONES.DECK, "p2");
    const horsemen = createCard("c_horse", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      SpecialAbility: "You may draw 2.",
    });

    // 2. Player 1 attacks with Abiathar (Territory -> Battlefield)
    const moveCmd1 = new MoveCardCommand(room, client1);
    moveCmd1.execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: abiathar.id,
    });

    // Expect exactly ONE item in Chronicle (deduplicated)
    expect(state.effectChronicle.items.length).toBe(1);
    const abiatharItem = state.effectChronicle.items[0];
    expect(abiatharItem.cardId).toBe(abiathar.id);
    expect(abiatharItem.actionType).toBe(ActionType.RESCUE_ATTEMPT);

    // Player 1 received the prompt
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        cardTitle: expect.stringContaining("Abiathar"),
        itemId: abiatharItem.id,
      })
    );

    // 3. Player 1 accepts Abiathar's prompt
    const optCmd1 = new RespondOptionalAbilityCommand(room, client1);
    optCmd1.execute({ itemId: abiatharItem.id, accepted: true });

    // Graceful fallback: unsupported action 'look' finishes cleanly and clears queue
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Hero Player activates Abiathar [K]")
    );

    // 4. Player 2 blocks with Egyptian Horsemen (Territory -> Battlefield)
    const moveCmd2 = new MoveCardCommand(room, client2);
    moveCmd2.execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: horsemen.id,
    });

    // Expect Egyptian Horsemen in Chronicle with priority on Player 2
    expect(state.effectChronicle.items.length).toBe(1);
    const horsemenItem = state.effectChronicle.items[0];
    expect(horsemenItem.cardId).toBe(horsemen.id);
    expect(horsemenItem.actionType).toBe(ActionType.BLOCK_RESCUE);
    expect(state.effectChronicle.priorityPlayerId).toBe("p2");

    // Client 2 (Defending Player) must receive the prompt, NOT Client 1
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        cardTitle: expect.stringContaining("Egyptian Horsemen"),
        itemId: horsemenItem.id,
        promptText: "Draw 2 cards?",
      })
    );

    // 5. Player 2 accepts Egyptian Horsemen prompt -> draws 2 cards
    const optCmd2 = new RespondOptionalAbilityCommand(room, client2);
    optCmd2.execute({ itemId: horsemenItem.id, accepted: true });

    expect(player2.deck.length).toBe(0);
    expect(player2.hand.length).toBe(2);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(2);
  });
});
