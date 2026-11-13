// server/tests/coreFixesPkg1.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AstEffectRunner } = require("../src/ast/AstEffectRunner");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { AST_ACTIONS, AST_SELECTION_MODES, AST_SCOPES } = require("../../shared/astConstants");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");

describe("Core Fixes Package 1 (take action, pile targeting & choice labels)", () => {
  let room;
  let state;
  let p1;
  let p2;
  let resolver;

  const createCard = (props) => {
    const card = new Card();
    Object.assign(card, props);
    return card;
  };

  beforeEach(() => {
    state = new RoomState();
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;
    state.round = 2;
    state.currentRound = 2;

    const lookupMap = new Map();
    room = {
      state,
      clients: [
        { sessionId: "p1", send: jest.fn() },
        { sessionId: "p2", send: jest.fn() },
      ],
      cardLookup: lookupMap,
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
      chatHistory: [],
    };
    resolver = new AbilityResolver(room);
    room.abilityResolver = resolver;
  });

  describe("1. Action 'take' Support in AstEffectRunner & ZoneTransferHandler", () => {
    test("AstEffectRunner registers and recognizes action 'take'", () => {
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.TAKE)).toBe(true);
      expect(AstEffectRunner.isActionSupported("take")).toBe(true);
    });

    test("Executes 'take' from reserve to hand cleanly", () => {
      const evilReserveCard = createCard({
        id: "c_weapon",
        templateId: "t_weapon",
        Name: "Philistine Armor",
        Alignment: "Evil",
        Type: "Evil Enhancement",
        zone: ZONES.RESERVE,
        ownerId: "p1",
        controllerId: "p1",
      });
      p1.reserve.push(evilReserveCard);
      room.cardLookup.set(evilReserveCard.id, evilReserveCard);

      const pharaoh = createCard({
        id: "c_pharaoh",
        templateId: "-1600364962",
        Name: "The Murdering Pharaoh",
        Alignment: "Evil",
        Type: "Evil Character",
        zone: ZONES.BATTLEFIELD,
        ownerId: "p1",
        controllerId: "p1",
      });
      room.cardLookup.set(pharaoh.id, pharaoh);

      const takeAbility = {
        ability_id: "ab_1_take",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.TAKE,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "controller",
              scope: ["reserve_pile"],
              target_type: "card",
              alignment: "evil",
              count: { fixed_value: 1 },
            },
            destination: "hand",
          },
        ],
      };

      const result = AstEffectRunner.runAbility(takeAbility, {
        room,
        player: p1,
        card: pharaoh,
        item: { cardId: pharaoh.id, title: pharaoh.Name },
        options: { targetCardIds: [evilReserveCard.id] },
      });

      expect(result.handled).toBe(true);
      expect(evilReserveCard.zone).toBe(ZONES.HAND);
      expect(p1.hand.some((c) => c.id === evilReserveCard.id)).toBe(true);
      expect(p1.reserve.some((c) => c.id === evilReserveCard.id)).toBe(false);
    });
  });

  describe("2. Proper Scope & Pile Classification (_isPileTargeting)", () => {
    test("Disqualifies card-level enhancement search from being treated as whole-pile targeting", () => {
      const samuelTargetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "either",
        scope: ["deck", "reserve_pile"],
        target_type: "enhancement",
        alignment: "good",
        references: ["I Samuel"],
        count: { fixed_value: 1 },
      };

      const isPile = TargetSelectionService._isPileTargeting(
        samuelTargetDef.scope,
        samuelTargetDef.target_type,
        samuelTargetDef,
        { action: AST_ACTIONS.UNDERDECK }
      );
      expect(isPile).toBe(false);
    });

    test("Multi-pile scope (deck + reserve) resolves as isPileTarget: true for card selection", () => {
      const samuelCard = createCard({
        id: "c_samuel",
        templateId: "-1708238440",
        Name: "Samuel, the Anointer [K]",
        Alignment: "Good",
        Type: "Hero",
        zone: ZONES.BATTLEFIELD,
        ownerId: "p1",
        controllerId: "p1",
      });
      room.cardLookup.set(samuelCard.id, samuelCard);

      const samuelEnhancement = createCard({
        id: "c_enh_samuel",
        templateId: "t_enh_samuel",
        Name: "Samuel's Horn",
        Alignment: "Good",
        Type: "GE",
        Reference: "I Samuel 16:13",
        zone: ZONES.RESERVE,
        ownerId: "p1",
        controllerId: "p1",
      });
      p1.reserve.push(samuelEnhancement);
      room.cardLookup.set(samuelEnhancement.id, samuelEnhancement);

      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "either",
        scope: ["deck", "reserve_pile"],
        target_type: "enhancement",
        alignment: "good",
        references: ["I Samuel"],
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, p1, targetDef, {
        sourceCard: samuelCard,
        action: AST_ACTIONS.UNDERDECK,
      });

      expect(result.targetType).toBe("card");
      expect(result.isPileTarget).toBe(true);
      expect(result.targetZone).toBe(ZONES.RESERVE);
      expect(result.eligibleCardIds).toContain(samuelEnhancement.id);
    });
  });

  describe("3. Choice Label Formatting", () => {
    test("Draw count is extracted from target.count.fixed_value", () => {
      const aaronDrawAbility = {
        ability_id: "draw_2",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.DRAW,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF,
              zone_owner: "controller",
              scope: ["deck"],
              count: { fixed_value: 2 },
            },
          },
        ],
      };

      const label = resolver._formatAbilityChoiceLabel(aaronDrawAbility, { Name: "Aaron" });
      expect(label).toBe("Draw 2 card(s)");
    });

    test("Take ability label is cleanly formatted with alignment, type, identifier and scope", () => {
      const charioteerTakeAbility = {
        ability_id: "take_evil_weapon",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.TAKE,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "controller",
              scope: ["reserve_pile"],
              target_type: "enhancement",
              alignment: "evil",
              identifiers: ["Weapon"],
            },
          },
        ],
      };

      const label = resolver._formatAbilityChoiceLabel(charioteerTakeAbility, { Name: "Philistine Charioteers" });
      expect(label).toBe("Take evil weapon from reserve");

      const charioteerUnderdeckAbility = {
        ability_id: "underdeck_evil_weapon",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.UNDERDECK,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "controller",
              scope: ["discard_pile"],
              target_type: "enhancement",
              alignment: "evil",
              identifiers: ["Weapon"],
            },
          },
        ],
      };

      const labelUnderdeck = resolver._formatAbilityChoiceLabel(charioteerUnderdeckAbility, { Name: "Philistine Charioteers" });
      expect(labelUnderdeck).toBe("Underdeck evil weapon from discard");
    });

    test("Band ability label includes identifier if present", () => {
      const aaronBandAbility = {
        ability_id: "band_to_priest",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BAND,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "controller",
              scope: ["in_play", "hand"],
              target_type: "character",
              identifiers: ["Priest"],
            },
          },
        ],
      };

      const label = resolver._formatAbilityChoiceLabel(aaronBandAbility, { Name: "Aaron" });
      expect(label).toBe("Band to a Priest character");
    });
  });
});
