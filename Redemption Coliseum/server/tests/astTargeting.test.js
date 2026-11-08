// server/tests/astTargeting.test.js
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
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
      createTestCard("e3", "202", "Evil Character 2", ZONES.TERRITORY, "p2", {
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

  describe("4. Checkpoint 1: Fast-Path vs Fallback (target_card_ids & uncompiled titles)", () => {
    test("Fast-Path: matches directly via target_card_ids in O(1)", () => {
      const card = createTestCard("c_samuel", "-1028904492", "Samuel, the Anointer [K]", ZONES.TERRITORY, "p1", {
        Alignment: "Good",
        IsCharacter: true,
      });

      const targetDef = {
        target_card_ids: ["-1028904492"],
        card_titles: ["Different Title"], // Bypassed by fast-path
      };

      expect(TargetSelectionService.matchesFilter(card, targetDef)).toBe(true);

      const targetDefOther = {
        target_card_ids: ["999999"],
      };
      expect(TargetSelectionService.matchesFilter(card, targetDefOther)).toBe(false);
    });

    test("Fallback: uncompiled category title matches card via ORDIR and Identifier", () => {
      const card = createTestCard("c_phicol", "12345", "Commander Phicol (LoC)", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
        ORDIR: ["Genesis Card", "Philistine"],
        Identifier: "Philistine",
      });

      const targetDef = {
        target_card_ids: [],
        card_titles: ["Genesis Philistine"],
      };

      expect(TargetSelectionService.matchesFilter(card, targetDef)).toBe(true);

      const nonGenesisPhilistine = createTestCard("c_goliath", "54321", "Goliath", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
        ORDIR: ["I Samuel Card", "Philistine"],
        Identifier: "Philistine Giant",
      });

      expect(TargetSelectionService.matchesFilter(nonGenesisPhilistine, targetDef)).toBe(false);
    });
  });

  describe("5. Mandatory Effect Auto-Targeting Architecture", () => {
    test("Mandatory discard ability with exactly 1 eligible target automatically resolves without client targeting prompt", () => {
      AbilityLookup._loadData()["mandatory_single_discard"] = {
        card_id: "mandatory_single_discard",
        card_name: "Slain by Levites Prototype",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_discard_single",
                activation_mode: "immediate",
                is_optional: false,
                effects: [
                  {
                    action: "discard",
                    target: {
                      selection_mode: "manual_controller",
                      zone_owner: "either",
                      scope: ["in_play"],
                      target_type: "card",
                      alignment: "evil",
                      count: { fixed_value: 1 },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const sourceCard = createTestCard("c_source_enh", "mandatory_single_discard", "Slain by Levites Prototype", ZONES.TERRITORY, "p1", {
        Alignment: "Good",
        IsEnhancement: true,
      });

      // Exactly ONE evil card in play
      const evilTarget = createTestCard("c_evil_single", "t_ec_1", "Single Evil Character", ZONES.TERRITORY, "p2", {
        Alignment: "Evil",
        IsCharacter: true,
      });

      const item = {
        id: "item_test_auto",
        cardId: sourceCard.id,
        controllerId: "p1",
        title: sourceCard.Name,
        actionType: "activate",
        abilityId: "ab_discard_single",
      };

      const res = room.abilityResolver.resolve(item, {});

      // Must be handled automatically without sending REQUEST_TARGET_SELECTION!
      expect(client1.send).not.toHaveBeenCalledWith(
        "requestTargetSelection",
        expect.anything()
      );
      expect(res.handled).toBe(true);
      expect(res.awaitingTargetSelection).toBeFalsy();
      expect(evilTarget.zone).toBe(ZONES.DISCARD);
    });

    test("Mandatory discard ability with multiple eligible targets prompts for manual selection", () => {
      AbilityLookup._loadData()["mandatory_multi_discard"] = {
        card_id: "mandatory_multi_discard",
        card_name: "Multi Target Discard",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_discard_multi",
                activation_mode: "immediate",
                is_optional: false,
                effects: [
                  {
                    action: "discard",
                    target: {
                      selection_mode: "manual_controller",
                      zone_owner: "either",
                      scope: ["in_play"],
                      target_type: "card",
                      alignment: "evil",
                      count: { fixed_value: 1 },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const sourceCard = createTestCard("c_source_multi", "mandatory_multi_discard", "Multi Target Discard", ZONES.TERRITORY, "p1", {
        Alignment: "Good",
        IsEnhancement: true,
      });

      // TWO evil cards in play
      createTestCard("c_evil_1", "t_ec_1", "Evil 1", ZONES.TERRITORY, "p2", { Alignment: "Evil", IsCharacter: true });
      createTestCard("c_evil_2", "t_ec_2", "Evil 2", ZONES.TERRITORY, "p2", { Alignment: "Evil", IsCharacter: true });

      const item = {
        id: "item_test_multi",
        cardId: sourceCard.id,
        controllerId: "p1",
        title: sourceCard.Name,
        actionType: "activate",
        abilityId: "ab_discard_multi",
      };

      const res = room.abilityResolver.resolve(item, {});

      // Must pause and send REQUEST_TARGET_SELECTION to the client!
      expect(client1.send).toHaveBeenCalledWith(
        "requestTargetSelection",
        expect.objectContaining({
          abilityId: "ab_discard_multi",
          eligibleCardIds: expect.arrayContaining(["c_evil_1", "c_evil_2"]),
          minTargets: 1,
          maxTargets: 1,
        })
      );
      expect(res.awaitingTargetSelection).toBe(true);
    });

    test("Optional ability or 'up to 1' count with 1 eligible target prompts for client decision", () => {
      AbilityLookup._loadData()["optional_up_to_discard"] = {
        card_id: "optional_up_to_discard",
        card_name: "Up To Discard",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_discard_up_to",
                activation_mode: "immediate",
                is_optional: false,
                effects: [
                  {
                    action: "discard",
                    target: {
                      selection_mode: "manual_controller",
                      zone_owner: "either",
                      scope: ["in_play"],
                      target_type: "card",
                      alignment: "evil",
                      count: { min_value: 0, max_value: 1, fixed_value: null },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const sourceCard = createTestCard("c_source_upto", "optional_up_to_discard", "Up To Discard", ZONES.TERRITORY, "p1", {
        Alignment: "Good",
        IsEnhancement: true,
      });

      // Exactly 1 evil card in play
      createTestCard("c_evil_upto_1", "t_ec_1", "Evil 1", ZONES.TERRITORY, "p2", { Alignment: "Evil", IsCharacter: true });

      const item = {
        id: "item_test_upto",
        cardId: sourceCard.id,
        controllerId: "p1",
        title: sourceCard.Name,
        actionType: "activate",
        abilityId: "ab_discard_up_to",
      };

      const res = room.abilityResolver.resolve(item, {});

      // Because count allows 0 (up to 1, canCancel: true), client MUST be asked!
      expect(client1.send).toHaveBeenCalledWith(
        "requestTargetSelection",
        expect.objectContaining({
          abilityId: "ab_discard_up_to",
          canCancel: true,
          minTargets: 0,
          maxTargets: 1,
        })
      );
      expect(res.awaitingTargetSelection).toBe(true);
    });

    test("Up-to-N banding ability with 1 eligible candidate requests client targeting and does not auto-band", () => {
      AbilityLookup._loadData()["pillar_of_fire_upto_test"] = {
        card_id: "pillar_of_fire_upto_test",
        card_name: "Pillar of Fire Prototype",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_pillar_band",
                activation_mode: "immediate",
                is_optional: true,
                effects: [
                  {
                    action: "band",
                    target: {
                      selection_mode: "manual_controller",
                      zone_owner: "controller",
                      scope: ["in_play", "hand"],
                      target_type: "hero",
                      alignment: "good",
                      references: ["Exodus"],
                      count: { min_value: 0, max_value: 3 },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const pillarCard = createTestCard("c_pillar", "pillar_of_fire_upto_test", "Pillar of Fire", ZONES.BATTLEFIELD, "p1", {
        Alignment: "Good",
        IsEnhancement: true,
      });

      // Exactly 1 Exodus Hero in hand
      const exoHero = createTestCard("c_exo_1", "t_exo_1", "Moses", ZONES.HAND, "p1", {
        Alignment: "Good",
        IsCharacter: true,
        Reference: "Exodus",
      });

      const item = {
        id: "item_pillar_upto",
        cardId: pillarCard.id,
        controllerId: "p1",
        title: pillarCard.Name,
        actionType: "activate",
        abilityId: "ab_pillar_band",
        isOptional: true,
      };

      // Player accepted the optional ability prompt
      const res = room.abilityResolver.resolve(item, { accepted: true });

      // Because it's "up to 3" (canCancel: true, minTargets: 0), it MUST request target selection from player!
      expect(client1.send).toHaveBeenCalledWith(
        "requestTargetSelection",
        expect.objectContaining({
          abilityId: "ab_pillar_band",
          canCancel: true,
          minTargets: 0,
          maxTargets: 1, // Clamped to available eligible targets
          eligibleCardIds: [exoHero.id],
        })
      );
      expect(res.awaitingTargetSelection).toBe(true);
      expect(exoHero.zone).toBe(ZONES.HAND); // Still in hand, not automatically banded!
    });

    test("Fixed 1-target banding ability automatically bands the single eligible candidate once accepted", () => {
      AbilityLookup._loadData()["fixed_band_test"] = {
        card_id: "fixed_band_test",
        card_name: "Fixed Band Hero",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_fixed_band",
                activation_mode: "immediate",
                is_optional: true,
                effects: [
                  {
                    action: "band",
                    target: {
                      selection_mode: "manual_controller",
                      zone_owner: "controller",
                      scope: ["territory"],
                      target_type: "hero",
                      alignment: "good",
                      identifiers: ["Priest"],
                      count: { fixed_value: 1 },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const leader = createTestCard("c_leader", "fixed_band_test", "Fixed Band Leader", ZONES.BATTLEFIELD, "p1", {
        Alignment: "Good",
        IsCharacter: true,
      });

      state.currentPhase = "battle";
      state.activePlayer = "p1";

      // Exactly 1 Priest in territory
      const priest = createTestCard("c_priest", "t_priest", "Aaron", ZONES.TERRITORY, "p1", {
        Alignment: "Good",
        IsCharacter: true,
        Identifier: "Priest",
      });

      const item = {
        id: "item_fixed_band",
        cardId: leader.id,
        controllerId: "p1",
        title: leader.Name,
        actionType: "activate",
        abilityId: "ab_fixed_band",
        isOptional: true,
      };

      // Player accepted the optional prompt
      const res = room.abilityResolver.resolve(item, { accepted: true });

      // Fixed 1-target band automatically targets and brings Aaron into battle!
      expect(client1.send).not.toHaveBeenCalledWith("requestTargetSelection", expect.anything());
      expect(res.handled).toBe(true);
      expect(priest.zone).toBe(ZONES.BATTLEFIELD);
    });
  });
});
