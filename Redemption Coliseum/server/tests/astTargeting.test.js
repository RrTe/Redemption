// server/tests/astTargeting.test.js
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ZONES } = require("../../shared/zones");
const { AST_SELECTION_MODES, AST_SCOPES, AST_ZONE_OWNERS } = require("../../shared/astConstants");
const { CHRONICLE_ACTIONS } = require("../../shared/effectChronicleConstants");

describe("AST Interactive Targeting - Phase 2", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;

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

    client1 = { sessionId: "p1", send: jest.fn() };

    room = {
      state,
      clients: [client1],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };

    room.abilityResolver = new AbilityResolver(room);
  });

  function createTestCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = new Card();
    card.id = id;
    card.templateId = templateId;
    card.Name = name;
    card.zone = zone;
    card.controllerId = ownerId;
    card.originalOwnerId = ownerId;
    Object.assign(card, extra);
    room.cardLookup.set(id, card);
    const p = state.players.get(ownerId);
    if (p && p[zone]) p[zone].push(card);
    return card;
  }

  describe("1. TargetSelectionService.resolveEligibleTargets", () => {
    test("filters evil characters in opponent territory", () => {
      createTestCard("c_good1", "101", "Hero 1", ZONES.TERRITORY, "p1", { Alignment: "Good", IsCharacter: true });
      const evilOpponent = createTestCard("c_evil1", "201", "Demon 1", ZONES.TERRITORY, "p2", { Alignment: "Evil", IsCharacter: true });
      createTestCard("c_evilSelf", "202", "Demon 2", ZONES.TERRITORY, "p1", { Alignment: "Evil", IsCharacter: true });

      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        scope: AST_SCOPES.IN_PLAY,
        zone_owner: AST_ZONE_OWNERS.OPPONENT,
        target_type: "character",
        alignment: "evil",
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, player1, targetDef);
      expect(result.targetType).toBe("card");
      expect(result.eligibleCardIds).toEqual([evilOpponent.id]);
      expect(result.requiresSelection).toBe(true);
      expect(result.minTargets).toBe(1);
    });

    test("generates eligible piles for deck targeting across players", () => {
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        scope: AST_SCOPES.DECK,
        zone_owner: AST_ZONE_OWNERS.EITHER,
        target_type: "deck",
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, player1, targetDef);
      expect(result.targetType).toBe("pile");
      expect(result.eligiblePiles.length).toBe(2);
      expect(result.eligiblePiles[0].id).toBe("p1:deck");
      expect(result.eligiblePiles[1].id).toBe("p2:deck");
      expect(result.requiresSelection).toBe(true);
    });

    test("correctly recognizes Amminadab target_type 'top card' in scope 'deck' as pile targeting", () => {
      const amminadabTargetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: AST_ZONE_OWNERS.EITHER,
        scope: "deck",
        target_type: "top card",
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, player1, amminadabTargetDef);
      expect(result.targetType).toBe("pile");
      expect(result.eligiblePiles.length).toBe(2);
      expect(result.requiresSelection).toBe(true);
      expect(result.promptText).toBe("Select a target deck to discard from");
    });
  });

  describe("2. TargetSelectionService.validateSelection", () => {
    test("validates legitimate and rejects fraudulent card targets", () => {
      const eligible = {
        targetType: "card",
        eligibleCardIds: ["c1", "c2"],
        minTargets: 1,
        maxTargets: 1,
      };

      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["c1"] }, eligible).valid).toBe(true);
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["c_hacker"] }, eligible).valid).toBe(false);
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["c1", "c2"] }, eligible).valid).toBe(false);
      expect(TargetSelectionService.validateSelection({ selectedCardIds: [] }, eligible).valid).toBe(false);
    });

    test("validates legitimate and rejects invalid pile targets", () => {
      const eligible = {
        targetType: "pile",
        eligiblePiles: [{ id: "p1:deck" }, { id: "p2:deck" }],
        minTargets: 1,
        maxTargets: 1,
      };

      expect(TargetSelectionService.validateSelection({ selectedPileId: "p2:deck" }, eligible).valid).toBe(true);
      expect(TargetSelectionService.validateSelection({ selectedPileId: "p3:deck" }, eligible).valid).toBe(false);
      expect(TargetSelectionService.validateSelection({}, eligible).valid).toBe(false);
    });
  });

  describe("3. SelectTargetCommand Execution & Undo Reversal", () => {
    test("executes targeted card discard and reverses cleanly via undo", () => {
      const edict = createTestCard("c_edict", "-2097085070", "Samuel's Edict", ZONES.TERRITORY, "p1");
      const evil = createTestCard("e1", "201", "Evil Character", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
      });

      EffectChronicleService.enqueueCards(room, [edict], "p1", "ACTIVATE_ABILITY");
      expect(state.effectChronicle.items.length).toBe(1);

      const cmd = new SelectTargetCommand(room, client1);
      cmd.execute({
        itemId: state.effectChronicle.items[0].id,
        selectedCardIds: [evil.id],
      });

      expect(player2.territory.length).toBe(0);
      expect(player2.discard.length).toBe(1);
      expect(player2.discard[0].id).toBe(evil.id);
      expect(state.effectChronicle.items.length).toBe(0);
      expect(cmd.canUndo).toBe(true);

      // Rollback via Undo
      cmd.undo();
      expect(player2.discard.length).toBe(0);
      expect(player2.territory.length).toBe(1);
      expect(player2.territory[0].id).toBe(evil.id);
      expect(state.effectChronicle.items.length).toBe(1);
    });

    test("executes targeted pile discard and reverses cleanly via undo", () => {
      const topDeck = createTestCard("d_opp", "301", "Opponent Top Card", ZONES.DECK, "p2");
      const edict = createTestCard("c_source", "-2097085070", "Source Ability", ZONES.TERRITORY, "p1");

      EffectChronicleService.enqueueCards(room, [edict], "p1", "ACTIVATE_ABILITY");

      const cmd = new SelectTargetCommand(room, client1);
      cmd.execute({
        itemId: state.effectChronicle.items[0].id,
        selectedPileId: "p2:deck",
      });

      expect(player2.deck.length).toBe(0);
      expect(player2.discard.length).toBe(1);
      expect(player2.discard[0].id).toBe(topDeck.id);
      expect(cmd.canUndo).toBe(true);

      // Rollback pile discard via Undo
      cmd.undo();
      expect(player2.discard.length).toBe(0);
      expect(player2.deck.length).toBe(1);
      expect(player2.deck[0].id).toBe(topDeck.id);
    });

    test("ResolveChronicleCommand does not enable undo when targeting is awaiting", () => {
      createTestCard("e2", "201", "Evil Character", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
      });
      const edict = createTestCard("c_src2", "-2097085070", "Source Ability", ZONES.TERRITORY, "p1");
      EffectChronicleService.enqueueCards(room, [edict], "p1", "ACTIVATE_ABILITY");

      const resolveCmd = new ResolveChronicleCommand(room, client1);
      resolveCmd.execute({
        action: CHRONICLE_ACTIONS.EXECUTE,
        itemId: state.effectChronicle.items[0].id,
      });

      expect(resolveCmd.canUndo).toBe(false);
      expect(state.effectChronicle.items.length).toBe(1);
    });

    test("undo prevents duplicate items in effect chronicle", () => {
      createTestCard("d_top", "302", "Top Card", ZONES.DECK, "p2");
      const edict = createTestCard("c_src3", "-2097085070", "Source Ability", ZONES.TERRITORY, "p1");
      EffectChronicleService.enqueueCards(room, [edict], "p1", "ACTIVATE_ABILITY");

      const cmd = new SelectTargetCommand(room, client1);
      cmd.execute({
        itemId: state.effectChronicle.items[0].id,
        selectedPileId: "p2:deck",
      });
      expect(state.effectChronicle.items.length).toBe(0);

      cmd.undo();
      expect(state.effectChronicle.items.length).toBe(1);

      // Multiple undo invocations must never create duplicate chronicle items
      cmd.undo();
      expect(state.effectChronicle.items.length).toBe(1);
    });
  });
});
