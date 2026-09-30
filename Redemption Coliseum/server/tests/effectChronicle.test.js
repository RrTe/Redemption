// server/tests/effectChronicle.test.js
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { NextPhaseCommand } = require("../src/commands/NextPhaseCommand");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { ActionType } = require("../../shared/actions");
const { CHRONICLE_ACTIONS } = require("../../shared/effectChronicleConstants");
const { DRAW_STEPS, PHASES } = require("../../shared/phases");


describe("Effect Chronicle Service & Command Tests", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;
  let client2;

  beforeEach(() => {
    state = new RoomState();

    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Player 1";

    player2 = new PlayerState();
    player2.sessionId = "p2";
    player2.name = "Player 2";

    state.players.set("p1", player1);
    state.players.set("p2", player2);
    state.activePlayer = "p1";

    client1 = { sessionId: "p1" };
    client2 = { sessionId: "p2" };

    room = {
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      chatHistory: [],
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
      phaseService: {
        advancePhase: jest.fn(),
      },
    };
  });

  test("enqueueCards adds items, sets priority, and assigns sequential orders", () => {
    const card1 = { id: "c1", Name: "Moses", SpecialAbility: "Draw 2 cards" };
    const card2 = { id: "c2", Name: "Aaron", SpecialAbility: "Search deck" };

    EffectChronicleService.enqueueCards(room, [card1, card2], "p1", "ACTIVATE_STAR_ABILITY");

    expect(state.effectChronicle.items.length).toBe(2);
    expect(state.effectChronicle.priorityPlayerId).toBe("p1");
    expect(state.effectChronicle.isResolving).toBe(true);

    expect(state.effectChronicle.items[0].title).toBe("Moses");
    expect(state.effectChronicle.items[0].description).toBe("Draw 2 cards");
    expect(state.effectChronicle.items[0].order).toBe(1);

    expect(state.effectChronicle.items[1].title).toBe("Aaron");
    expect(state.effectChronicle.items[1].order).toBe(2);
  });

  test("executeItem removes the active item, reindexes, and triggers onComplete when empty", () => {
    const onCompleteMock = jest.fn();
    const card1 = { id: "c1", Name: "Moses", SpecialAbility: "Draw 2 cards" };
    const card2 = { id: "c2", Name: "Aaron", SpecialAbility: "Search deck" };

    EffectChronicleService.enqueueCards(room, [card1, card2], "p1", "ACTIVATE_STAR_ABILITY", {
      onComplete: onCompleteMock,
    });

    const cmd = new ResolveChronicleCommand(room, client1);

    // Execute first item
    cmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].title).toBe("Aaron");
    expect(state.effectChronicle.items[0].order).toBe(1);
    expect(onCompleteMock).not.toHaveBeenCalled();

    // Execute second item
    cmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);
    expect(state.effectChronicle.priorityPlayerId).toBe("");
    expect(onCompleteMock).toHaveBeenCalledWith(room);
  });

  test("passItem skips the item and advances", () => {
    const card1 = { id: "c1", Name: "Moses" };
    const card2 = { id: "c2", Name: "Aaron" };

    EffectChronicleService.enqueueCards(room, [card1, card2], "p1", "ACTIVATE_STAR_ABILITY");

    const cmd = new ResolveChronicleCommand(room, client1);
    cmd.execute({ action: CHRONICLE_ACTIONS.PASS });

    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].title).toBe("Aaron");
  });

  test("passAllItems clears all items and triggers completion immediately", () => {
    const onCompleteMock = jest.fn();
    const cards = [
      { id: "c1", Name: "Card 1" },
      { id: "c2", Name: "Card 2" },
      { id: "c3", Name: "Card 3" },
    ];

    EffectChronicleService.enqueueCards(room, cards, "p1", "ACTIVATE_STAR_ABILITY", {
      onComplete: onCompleteMock,
    });

    const cmd = new ResolveChronicleCommand(room, client1);
    cmd.execute({ action: CHRONICLE_ACTIONS.PASS_ALL });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(onCompleteMock).toHaveBeenCalledWith(room);
  });

  test("actions from clients without priority are rejected", () => {
    const card1 = { id: "c1", Name: "Moses" };
    EffectChronicleService.enqueueCards(room, [card1], "p1", "ACTIVATE_STAR_ABILITY");

    const cmdFromWrongClient = new ResolveChronicleCommand(room, client2);
    cmdFromWrongClient.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].title).toBe("Moses");
  });

  test("NextPhaseCommand is blocked while chronicle has pending items", () => {
    state.currentPhase = PHASES.DRAW;
    state.drawStep = DRAW_STEPS.NONE;
    const card1 = { id: "c1", Name: "Moses" };
    EffectChronicleService.enqueueCards(room, [card1], "p1", "ACTIVATE_STAR_ABILITY");

    const nextPhaseCmd = new NextPhaseCommand(room, client1);
    nextPhaseCmd.execute();

    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
  });

  test("SubmitDrawSequenceCommand enqueues cards and delays step advancement until empty", () => {
    state.drawStep = DRAW_STEPS.ACTIVE_STARS;
    state.priorityPlayerId = "p1";
    room._drawSequencePlan = [DRAW_STEPS.ACTIVE_STARS, DRAW_STEPS.OPPONENT_STARS];
    room._drawSequenceIndex = 0;

    // Player 1 star card
    const starCard = new Card();
    starCard.id = "s1";
    starCard.Name = "Star Hero";
    starCard.SpecialAbility = "Draw 1";
    room.cardLookup.set("s1", starCard);

    // Give Player 2 an eligible card so OPPONENT_STARS does not auto-skip
    const oppStar = new Card();
    oppStar.id = "s2";
    oppStar.Class = "Hero, Star";
    const oppAction = new CardAction();
    oppAction.id = "a_s2";
    oppAction.type = ActionType.ACTIVATE_STAR_ABILITY;
    oppStar.availableActions.push(oppAction);
    player2.hand.push(oppStar);


    const submitCmd = new SubmitDrawSequenceCommand(room, client1);
    submitCmd.execute({
      step: DRAW_STEPS.ACTIVE_STARS,
      orderedCardIds: ["s1"],
    });

    // Step should NOT have advanced yet, because chronicle has 1 item
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);

    // Resolve item
    const resolveCmd = new ResolveChronicleCommand(room, client1);
    resolveCmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

    // Queue empty -> step advances to OPPONENT_STARS
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.drawStep).toBe(DRAW_STEPS.OPPONENT_STARS);
    expect(state.priorityPlayerId).toBe("p2");
  });

});
