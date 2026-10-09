// server/tests/astEngine.test.js
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { ConditionEvaluator } = require("../src/ast/ConditionEvaluator");
const { DrawHandler } = require("../src/ast/handlers/DrawHandler");
const { DiscardHandler } = require("../src/ast/handlers/DiscardHandler");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ZONES } = require("../../shared/zones");
const { CHRONICLE_ACTIONS } = require("../../shared/effectChronicleConstants");

describe("AST Special Abilities Engine - Phase 1 Walking Skeleton", () => {
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

    client1 = { sessionId: "p1" };

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

  describe("1. AbilityLookup Service", () => {
    test("indexes verified fixtures correctly by templateId", () => {
      expect(AbilityLookup.hasLogic("2041723113")).toBe(true); // Egyptian Horsemen
      expect(AbilityLookup.hasLogic("-2097085070")).toBe(true); // Samuel's Edict
      expect(AbilityLookup.hasLogic("-175529066")).toBe(true); // Eli the Priest
      expect(AbilityLookup.hasLogic("unmapped_id_9999")).toBe(false);

      const horsemenAbilities = AbilityLookup.resolveAbilities("2041723113");
      expect(horsemenAbilities.length).toBeGreaterThan(0);
      expect(horsemenAbilities[0].effects[0].action).toBe("draw");
      expect(horsemenAbilities[0].effects[0].target.count.fixed_value).toBe(2);

      const edictAbilities = AbilityLookup.resolveAbilities("-2097085070");
      expect(edictAbilities.length).toBeGreaterThan(0);
      expect(edictAbilities[0].effects[0].action).toBe("discard");
      expect(edictAbilities[0].effects[0].target.alignment).toBe("evil");

      // Verify dual-sided slash name lookup
      const { DeckService } = require("../src/services/DeckService");
      const { CardRepository } = require("../../shared/CardRepository");
      DeckService.initDatabase();
      const amminadab = CardRepository.get("Amminadab, the Generous / Amminadab, the Gracious (LoC)");
      expect(amminadab).toBeDefined();
      expect(amminadab.id).toBe("-622696180");
    });
  });

  describe("2. ConditionEvaluator", () => {
    test("evaluates empty and simple conditions deterministically", () => {
      expect(ConditionEvaluator.evaluate([]).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(null).valid).toBe(true);

      state.currentPhase = "battle";
      expect(ConditionEvaluator.evaluate([{ condition_type: "phase_check", phase: "battle" }], { room }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate([{ condition_type: "phase_check", phase: "prep" }], { room }).valid).toBe(false);

      const card = { zone: "territory" };
      expect(ConditionEvaluator.evaluate([{ condition_type: "zone_check", zone: "territory" }], { card }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate([{ condition_type: "zone_check", zone: "hand" }], { card }).valid).toBe(false);
    });
  });

  describe("3. DrawHandler & Egyptian Horsemen Primitive", () => {
    test("draws 2 cards and creates atomic mutation snapshot", () => {
      createTestCard("d1", "101", "Deck Card 1", ZONES.DECK, "p1");
      createTestCard("d2", "102", "Deck Card 2", ZONES.DECK, "p1");
      createTestCard("d3", "103", "Deck Card 3", ZONES.DECK, "p1");

      const horsemen = createTestCard("c_horse", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
      const ability = AbilityLookup.resolveAbilities("2041723113")[0];

      const result = DrawHandler.execute({
        room,
        player: player1,
        effect: ability.effects[0],
        item: { cardId: horsemen.id },
      });

      expect(result.success).toBe(true);
      expect(player1.hand.length).toBe(2);
      expect(player1.deck.length).toBe(1);
      expect(result.snapshot.movedCardIds.length).toBe(2);
      expect(result.snapshot.action).toBe("draw");
    });
  });

  describe("4. DiscardHandler & Samuel's Edict Primitive", () => {
    test("dynamically targets and discards evil card in play", () => {
      const evilCard = createTestCard("e1", "201", "Evil Minion", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
      });

      const edict = createTestCard("c_edict", "-2097085070", "Samuel's Edict", ZONES.TERRITORY, "p1");
      const ability = AbilityLookup.resolveAbilities("-2097085070")[0];

      const result = DiscardHandler.execute({
        room,
        player: player1,
        effect: ability.effects[0],
        item: { cardId: edict.id },
      });

      expect(result.success).toBe(true);
      expect(player2.territory.length).toBe(0);
      expect(player2.discard.length).toBe(1);
      expect(player2.discard[0].id).toBe(evilCard.id);
      expect(result.snapshot.discardedCards.length).toBe(1);
    });

    test("handles 0 eligible targets gracefully without failure", () => {
      const edict = createTestCard("c_edict", "-2097085070", "Samuel's Edict", ZONES.TERRITORY, "p1");
      const ability = AbilityLookup.resolveAbilities("-2097085070")[0];

      const result = DiscardHandler.execute({
        room,
        player: player1,
        effect: ability.effects[0],
        item: { cardId: edict.id },
      });

      expect(result.success).toBe(true);
      expect(result.snapshot.discardedCards.length).toBe(0);
    });
  });

  describe("5. End-to-End Chronicle Execution & Undo Rollback (Option B)", () => {
    test("executes Egyptian Horsemen via Chronicle and rolls back cleanly with Undo", () => {
      createTestCard("d1", "101", "Card 1", ZONES.DECK, "p1");
      createTestCard("d2", "102", "Card 2", ZONES.DECK, "p1");
      const horsemen = createTestCard("c_h", "2041723113", "Egyptian Horsemen", ZONES.HAND, "p1");

      EffectChronicleService.enqueueCards(room, [horsemen], "p1", "ACTIVATE_ABILITY");
      expect(state.effectChronicle.items.length).toBe(1);

      const cmd = new ResolveChronicleCommand(room, client1);
      cmd.execute({ action: CHRONICLE_ACTIONS.EXECUTE });

      expect(player1.hand.length).toBe(3); // horsemen + 2 drawn
      expect(state.effectChronicle.items.length).toBe(0);
      expect(cmd.canUndo).toBe(true);

      // Perform Undo rollback
      cmd.undo();

      expect(player1.hand.length).toBe(1); // 2 drawn cards returned to deck
      expect(player1.deck.length).toBe(2);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(room.broadcastGameLog).toHaveBeenCalledWith(
        "[UNDO] Player 1 rewound ability of {{2041723113|Egyptian Horsemen}} and returned {{102|Card 2}}, {{101|Card 1}} from their Hand to their Deck."
      );
    });

    test("falls back gracefully on unsupported action and unmapped card", () => {
      const eli = createTestCard("c_eli", "-175529066", "Eli the Priest", ZONES.HAND, "p1");
      EffectChronicleService.enqueueCards(room, [eli], "p1", "ACTIVATE_ABILITY");

      const cmd1 = new ResolveChronicleCommand(room, client1);
      cmd1.execute({ action: CHRONICLE_ACTIONS.EXECUTE });
      expect(state.effectChronicle.items.length).toBe(0);
      expect(room.broadcastGameLog).toHaveBeenCalledWith(expect.stringContaining("Eli the Priest"));

      const custom = createTestCard("c_cust", "9999999", "Custom Card", ZONES.HAND, "p1");
      EffectChronicleService.enqueueCards(room, [custom], "p1", "ACTIVATE_ABILITY");

      const cmd2 = new ResolveChronicleCommand(room, client1);
      cmd2.execute({ action: CHRONICLE_ACTIONS.EXECUTE });
      expect(state.effectChronicle.items.length).toBe(0);
      expect(room.broadcastGameLog).toHaveBeenCalledWith(expect.stringContaining("Custom Card"));
    });
  });
});
