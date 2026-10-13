// server/tests/amminadabFastTrack.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { DrawPhaseStepService } = require("../src/services/DrawPhaseStepService");
const { DRAW_STEPS } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");
const { ActionType } = require("../../shared/actions");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("Amminadab Star Ability Fast-Track & Board Targeting", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;
  let client2;
  let sentMessages;

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

    sentMessages = [];
    client1 = {
      sessionId: "p1",
      send: jest.fn((msgType, payload) => {
        sentMessages.push({ msgType, payload });
      }),
    };
    client2 = {
      sessionId: "p2",
      send: jest.fn(),
    };

    room = {
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  function createCard(id, templateId, name, zone, ownerId) {
    const card = new Card();
    card.id = id;
    card.templateId = templateId;
    card.Name = name;
    card.zone = zone;
    card.ownerId = ownerId;
    card.originalOwnerId = ownerId;
    card.controllerId = ownerId;
    room.cardLookup.set(id, card);
    const p = state.players.get(ownerId);
    if (p && p[zone]) p[zone].push(card);
    return card;
  }

  test("Amminadab enqueued in Star Step automatically fast-tracks targeting and discards top deck card", () => {
    // 1. Setup board: p1 hand has Amminadab, both players have cards in deck
    const amminadab = createCard("ammi_1", "-622696180", "Amminadab, the Generous (LoC)", ZONES.HAND, "p1");
    const ammiAction = new CardAction();
    ammiAction.id = "act_ammi";
    ammiAction.type = ActionType.ACTIVATE_STAR_ABILITY;
    amminadab.availableActions.push(ammiAction);

    const p1DeckTop = createCard("p1_top", "101", "P1 Deck Card", ZONES.DECK, "p1");
    const p2DeckTop = createCard("p2_top", "102", "Opponent Deck Card", ZONES.DECK, "p2");

    const p2Star = createCard("p2_star", "999", "Opponent Star Card", ZONES.HAND, "p2");
    p2Star.Class = "Star";
    const p2Action = new CardAction();
    p2Action.id = "act_p2";
    p2Action.type = ActionType.ACTIVATE_STAR_ABILITY;
    p2Star.availableActions.push(p2Action);

    DrawPhaseStepService.startInitialSequence(room);
    expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
    expect(state.priorityPlayerId).toBe("p1");

    // 2. Submit Draw Sequence with Amminadab
    const submitCmd = new SubmitDrawSequenceCommand(room, client1);
    submitCmd.execute({
      step: DRAW_STEPS.ACTIVE_STARS,
      orderedCardIds: [amminadab.id],
    });

    // 3. Verify fast-track auto-executed and sent REQUEST_TARGET_SELECTION to client1
    expect(state.effectChronicle.items.length).toBe(1);
    const chronicleItem = state.effectChronicle.items[0];
    expect(chronicleItem.cardId).toBe(amminadab.id);
    expect(chronicleItem.title).toBe("Amminadab, the Generous (LoC)");

    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_TARGET_SELECTION,
      expect.objectContaining({
        targetType: "pile",
        eligiblePiles: expect.arrayContaining([
          expect.objectContaining({ id: "p1:deck" }),
          expect.objectContaining({ id: "p2:deck" }),
        ]),
      })
    );

    // 4. Client zero-confirms pile targeting by clicking opponent deck pile
    const selectTargetCmd = new SelectTargetCommand(room, client1);
    selectTargetCmd.execute({
      itemId: chronicleItem.id,
      selectedPileId: "p2:deck",
    });

    // 5. Verify top card of opponent deck was discarded
    expect(player2.deck.length).toBe(0);
    expect(player2.discard.length).toBe(1);
    expect(player2.discard[0].id).toBe(p2DeckTop.id);

    // 6. Verify Chronicle completed and logged in history
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);

    // 7. Verify step automatically advanced to Opponent Stars or Souls
    expect(state.drawStep).toBe(DRAW_STEPS.OPPONENT_STARS);
    expect(state.priorityPlayerId).toBe("p2");
  });
});
