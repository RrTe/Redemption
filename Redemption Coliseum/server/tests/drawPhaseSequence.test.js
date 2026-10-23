// server/tests/drawPhaseSequence.test.js
const { DrawPhaseStepService } = require("../src/services/DrawPhaseStepService");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { ActionType } = require("../../shared/actions");
const { DRAW_STEPS } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");
const { CHRONICLE_ACTIONS } = require("../../shared/effectChronicleConstants");

describe("Draw Phase Sequence & Priority State Machine", () => {
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
    };
  });

  function createStarCard(id, controllerId) {
    const card = new Card();
    card.id = id;
    card.Name = `Star Card ${id}`;
    card.Class = "Warrior, Star";
    card.controllerId = controllerId;
    card.zone = ZONES.HAND;

    const action = new CardAction();
    action.id = `action_${id}`;
    action.type = ActionType.ACTIVATE_STAR_ABILITY;
    action.description = "Activate Star Ability";
    card.availableActions.push(action);

    room.cardLookup.set(id, card);
    return card;
  }

  function createLostSoul(id, controllerId) {
    const card = new Card();
    card.id = id;
    card.Name = `Lost Soul ${id}`;
    card.Class = "Lost Soul";
    card.controllerId = controllerId;
    card.zone = ZONES.LAND_OF_BONDAGE;

    const action = new CardAction();
    action.id = `action_${id}`;
    action.type = ActionType.ACTIVATE_ABILITY;
    action.description = "Activate Ability";
    card.availableActions.push(action);

    room.cardLookup.set(id, card);
    return card;
  }

  describe("Initial Game Setup (4-step sequence)", () => {
    test("runs through all 4 steps when both players have eligible cards", () => {
      player1.hand.push(createStarCard("s1", "p1"));
      player2.hand.push(createStarCard("s2", "p2"));
      player1[ZONES.LAND_OF_BONDAGE].push(createLostSoul("ls1", "p1"));
      player2[ZONES.LAND_OF_BONDAGE].push(createLostSoul("ls2", "p2"));

      DrawPhaseStepService.startInitialSequence(room);

      // Step 1: Active Stars
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
      expect(state.priorityPlayerId).toBe("p1");

      // P1 submits star order into Effect Chronicle
      const cmd1 = new SubmitDrawSequenceCommand(room, client1);
      cmd1.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["s1"] });
      expect(state.effectChronicle.items.length).toBe(1);

      // P1 executes chronicle item
      const resolveCmd1 = new ResolveChronicleCommand(room, client1);
      resolveCmd1.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      expect(room.broadcastGameLog).toHaveBeenCalledWith(
        expect.stringContaining("executes Star Card s1")
      );

      // Step 2: Opponent Stars
      expect(state.drawStep).toBe(DRAW_STEPS.OPPONENT_STARS);
      expect(state.priorityPlayerId).toBe("p2");

      // P2 passes on stars
      const cmd2 = new SubmitDrawSequenceCommand(room, client2);
      cmd2.execute({ step: DRAW_STEPS.OPPONENT_STARS, orderedCardIds: [] });
      expect(room.broadcastGameLog).toHaveBeenCalledWith(
        expect.stringContaining("passes on Star cards")
      );

      // Step 3: Active Souls
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_SOULS);
      expect(state.priorityPlayerId).toBe("p1");

      // P1 submits souls
      cmd1.execute({ step: DRAW_STEPS.ACTIVE_SOULS, orderedCardIds: ["ls1"] });
      expect(state.effectChronicle.items.length).toBe(1);
      resolveCmd1.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      expect(room.broadcastGameLog).toHaveBeenCalledWith(
        expect.stringContaining("executes Lost Soul ls1")
      );

      // Step 4: Opponent Souls
      expect(state.drawStep).toBe(DRAW_STEPS.OPPONENT_SOULS);
      expect(state.priorityPlayerId).toBe("p2");

      // P2 submits souls
      cmd2.execute({ step: DRAW_STEPS.OPPONENT_SOULS, orderedCardIds: ["ls2"] });
      expect(state.effectChronicle.items.length).toBe(1);
      const resolveCmd2 = new ResolveChronicleCommand(room, client2);
      resolveCmd2.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      // Step 5: Completed (state resets to none, game remains in DRAW phase)
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
      expect(state.priorityPlayerId).toBe("");
    });

    test("auto-skips steps where player has 0 eligible cards", () => {
      // Only player 2 has a star card; no lost souls exist
      player2.hand.push(createStarCard("s2", "p2"));

      DrawPhaseStepService.startInitialSequence(room);

      // Step 1 (P1 Stars) auto-skips, jumps straight to Step 2 (P2 Stars)
      expect(state.drawStep).toBe(DRAW_STEPS.OPPONENT_STARS);
      expect(state.priorityPlayerId).toBe("p2");

      // P2 submits
      const cmd2 = new SubmitDrawSequenceCommand(room, client2);
      cmd2.execute({ step: DRAW_STEPS.OPPONENT_STARS, orderedCardIds: ["s2"] });
      const resolveCmd2 = new ResolveChronicleCommand(room, client2);
      resolveCmd2.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      // Steps 3 & 4 have 0 souls, so they auto-skip to completion!
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
      expect(state.priorityPlayerId).toBe("");
    });
  });

  describe("Turn Draw Sequence (2-step sequence)", () => {
    test("runs active stars then active souls and finishes", () => {
      player1.hand.push(createStarCard("s1", "p1"));
      player1[ZONES.LAND_OF_BONDAGE].push(createLostSoul("ls1", "p1"));

      DrawPhaseStepService.startTurnDrawSequence(room);

      // Step 1: Active Stars
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
      expect(state.priorityPlayerId).toBe("p1");

      const cmd = new SubmitDrawSequenceCommand(room, client1);
      cmd.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["s1"] });
      const resolveCmd = new ResolveChronicleCommand(room, client1);
      resolveCmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      // Step 2: Active Souls
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_SOULS);
      expect(state.priorityPlayerId).toBe("p1");

      cmd.execute({ step: DRAW_STEPS.ACTIVE_SOULS, orderedCardIds: ["ls1"] });
      resolveCmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      // Done
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
      expect(state.priorityPlayerId).toBe("");
    });


    test("auto-skips old Lost Souls without active actions", () => {
      const oldSoul = new Card();
      oldSoul.id = "ls_old";
      oldSoul.Type = "Lost Soul";
      oldSoul.controllerId = "p1";
      oldSoul.zone = ZONES.LAND_OF_BONDAGE;
      player1[ZONES.LAND_OF_BONDAGE].push(oldSoul);

      DrawPhaseStepService.startTurnDrawSequence(room);
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
    });

    test("only targets newly drawn soul and clears action on pass", () => {
      const oldSoul = new Card();
      oldSoul.id = "ls_old";
      oldSoul.Type = "Lost Soul";
      oldSoul.controllerId = "p1";
      oldSoul.zone = ZONES.LAND_OF_BONDAGE;
      player1[ZONES.LAND_OF_BONDAGE].push(oldSoul);

      const newSoul = createLostSoul("ls_new", "p1");
      player1[ZONES.LAND_OF_BONDAGE].push(newSoul);

      const eligible = DrawPhaseStepService.getEligibleCards(room, DRAW_STEPS.ACTIVE_SOULS, player1);
      expect(eligible.map(c => c.id)).toEqual(["ls_new"]);

      DrawPhaseStepService.startTurnDrawSequence(room);
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_SOULS);

      const cmd = new SubmitDrawSequenceCommand(room, client1);
      cmd.execute({ step: DRAW_STEPS.ACTIVE_SOULS, orderedCardIds: [] });
      expect(newSoul.availableActions.length).toBe(0);
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
    });
  });

  describe("Security & Validation", () => {
    test("rejects command when client does not hold priority", () => {
      player1.hand.push(createStarCard("s1", "p1"));
      DrawPhaseStepService.startTurnDrawSequence(room);

      expect(state.priorityPlayerId).toBe("p1");

      // Client 2 tries to act when Priority is P1
      const cmd2 = new SubmitDrawSequenceCommand(room, client2);
      cmd2.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["s1"] });

      // State did not change
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
      expect(state.priorityPlayerId).toBe("p1");
    });

    test("rejects NextPhaseCommand when a draw sequence step is active", () => {
      const { NextPhaseCommand } = require("../src/commands/NextPhaseCommand");
      player1.hand.push(createStarCard("s1", "p1"));
      DrawPhaseStepService.startTurnDrawSequence(room);

      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);

      const nextPhaseCmd = new NextPhaseCommand(room, client1);
      nextPhaseCmd.execute();

      // State did not change: drawStep is still ACTIVE_STARS, phase did not advance
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
    });
  });

  describe("Star-Cards Reveal & StateView Synchronization", () => {
    test("reveals confirmed Star-cards face-up and registers them in all clients' StateViews", () => {
      const starCard = createStarCard("s_reveal", "p1");
      starCard.isFaceDown = true;
      starCard.isFaceUp = false;
      player1.hand.push(starCard);

      const mockViewP1 = { add: jest.fn() };
      const mockViewP2 = { add: jest.fn() };
      state._clientViews = new Map([
        ["p1", mockViewP1],
        ["p2", mockViewP2],
      ]);

      DrawPhaseStepService.startTurnDrawSequence(room);
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);

      const cmd = new SubmitDrawSequenceCommand(room, client1);
      cmd.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["s_reveal"] });

      // 1. Verified face up
      expect(starCard.isFaceUp).toBe(true);
      expect(starCard.isFaceDown).toBe(false);

      // 2. Verified registered in both StateViews
      expect(mockViewP1.add).toHaveBeenCalledWith(starCard);
      expect(mockViewP2.add).toHaveBeenCalledWith(starCard);

      // 3. Verified enqueued item marked as declared & confirmed
      expect(state.effectChronicle.items.length).toBe(1);
      const item = state.effectChronicle.items[0];
      expect(item.isConfirmed).toBe(true);
      expect(item.isDeclared).toBe(true);
    });

    test("bypasses optional ability prompt for declared Star cards even if isOptional is true", () => {
      const starCard = createStarCard("s_opt", "p1");
      starCard.isOptional = true;
      player1.hand.push(starCard);

      const { AbilityResolver } = require("../src/ast/AbilityResolver");
      const resolver = new AbilityResolver(room);
      room.abilityResolver = resolver;

      client1.send = jest.fn();

      DrawPhaseStepService.startTurnDrawSequence(room);
      const cmd = new SubmitDrawSequenceCommand(room, client1);
      cmd.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["s_opt"] });

      // Resolve item through AbilityResolver
      const item = state.effectChronicle.items[0];
      const result = resolver.resolve(item, { isDeclared: true });

      // Must not await confirmation via REQUEST_OPTIONAL_ABILITY
      expect(result.awaitingConfirmation).toBeFalsy();
      expect(client1.send).not.toHaveBeenCalledWith("REQUEST_OPTIONAL_ABILITY", expect.anything());
    });
  });
});
