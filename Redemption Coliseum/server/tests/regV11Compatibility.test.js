// server/tests/regV11Compatibility.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AstEffectRunner } = require("../src/ast/AstEffectRunner");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { parseTargetCount } = require("../src/ast/TargetCountResolver");
const { DiscardHandler } = require("../src/ast/handlers/DiscardHandler");
const { DrawHandler } = require("../src/ast/handlers/DrawHandler");
const { ZoneTransferHandler } = require("../src/ast/handlers/ZoneTransferHandler");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const {
  AST_ACTIONS,
  AST_ACTIVATION_MODES,
  AST_MESSAGES,
  AST_SCOPES,
  AST_SELECTION_MODES,
  AST_ZONE_OWNERS,
} = require("../../shared/astConstants");

describe("REG v11.1.0 & ORDIR 7.1.0 Compatibility (Durchgang 1)", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;
  let client2;
  let registeredTestCardIds;

  beforeEach(() => {
    registeredTestCardIds = [];
    state = new RoomState();
    player1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    player2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", player1);
    state.players.set("p2", player2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;
    state.battle.initiativePlayerId = "p1";

    client1 = { sessionId: "p1", send: jest.fn() };
    client2 = { sessionId: "p2", send: jest.fn() };
    room = {
      roomId: "reg-v11-test-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  afterEach(() => {
    const logicMap = AbilityLookup._loadData();
    for (const id of registeredTestCardIds) {
      delete logicMap[id];
    }
  });

  function registerAstCard(templateId, entry) {
    registeredTestCardIds.push(templateId);
    AbilityLookup._loadData()[templateId] = entry;
  }

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = Object.assign(new Card(), {
      id,
      templateId,
      Name: name,
      zone,
      ownerId,
      originalOwnerId: ownerId,
      controllerId: ownerId,
    }, extra);
    room.cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  describe("1. AST Schema Constants & Handler Boundary", () => {
    test("exposes STATIC activation mode and REG v11.1.0 action verbs without registering unimplemented handlers", () => {
      expect(AST_ACTIVATION_MODES.STATIC).toBe("static");
      expect(AST_ACTIONS.PARALYZE).toBe("paralyze");
      expect(AST_ACTIONS.RELEASE).toBe("release");
      expect(AST_ACTIONS.WITHDRAW).toBe("withdraw");
      expect(AST_ACTIONS.CHOOSE_OPPONENT).toBe("choose opponent");
      expect(AST_ACTIONS.PRESENT).toBe("present");

      // New effect handlers must NOT be enabled in Durchgang 1
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.PARALYZE)).toBe(false);
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.RELEASE)).toBe(false);
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.WITHDRAW)).toBe(false);
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.CHOOSE_OPPONENT)).toBe(false);
      expect(AstEffectRunner.isActionSupported(AST_ACTIONS.PRESENT)).toBe(false);
    });
  });

  describe("2. AbilityLookup cannot_be_ignored Protection", () => {
    test("recognizes is_ignorable: false, side-level cannot_be_ignored, and conditional static modifier abilities", () => {
      registerAstCard("ast_ignorable_flag", {
        card_id: "ast_ignorable_flag",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_flag",
                activation_mode: "immediate",
                is_ignorable: false,
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW }],
              },
            ],
          },
        },
      });
      registerAstCard("ast_side_modifier_ignore", {
        card_id: "ast_side_modifier_ignore",
        sides: {
          top: {
            modifiers: [{ modifier_type: "cannot_be_ignored", applies_to: "this_side" }],
            abilities: [{ ability_id: "ab_mod", activation_mode: "immediate", is_ignorable: true, conditions: [], effects: [{ action: AST_ACTIONS.DRAW }] }],
          },
        },
      });
      registerAstCard("ast_static_conditional_ignore", {
        card_id: "ast_static_conditional_ignore",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_main",
                activation_mode: "immediate",
                is_ignorable: true,
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW }],
              },
              {
                ability_id: "ab_static_prot",
                activation_mode: AST_ACTIVATION_MODES.STATIC,
                conditions: [{ condition_type: "zone_check", zone: ZONES.BATTLEFIELD }],
                effects: [],
                modifiers: [{ modifier_type: "cannot_be_ignored", applies_to: "this_side" }],
              },
            ],
          },
        },
      });

      expect(
        AbilityLookup.isSideProtectedFrom("ast_ignorable_flag", "cannot_be_ignored", {
          activeSide: "top",
          abilityId: "ab_flag",
        })
      ).toBe(true);
      expect(
        AbilityLookup.isSideProtectedFrom("ast_side_modifier_ignore", "cannot_be_ignored", { activeSide: "top" })
      ).toBe(true);

      const inBattleCard = { templateId: "ast_static_conditional_ignore", controllerId: "p1", zone: ZONES.BATTLEFIELD };
      const inTerritoryCard = { templateId: "ast_static_conditional_ignore", controllerId: "p1", zone: ZONES.TERRITORY };
      expect(
        AbilityLookup.isSideProtectedFrom("ast_static_conditional_ignore", "cannot_be_ignored", {
          activeSide: "top",
          card: inBattleCard,
          room,
          player: player1,
        })
      ).toBe(true);
      expect(
        AbilityLookup.isSideProtectedFrom("ast_static_conditional_ignore", "cannot_be_ignored", {
          activeSide: "top",
          card: inTerritoryCard,
          room,
          player: player1,
        })
      ).toBe(false);
    });
  });

  describe("3. BattleTriggerService 'may not' Optionality Fix", () => {
    test("does not mark supported non-optional 'may not' abilities as optional", () => {
      registerAstCard("ast_may_not_card", {
        card_id: "ast_may_not_card",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_may_not",
                activation_mode: "immediate",
                is_optional: false,
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
              },
            ],
          },
        },
      });
      registerAstCard("ast_may_card", {
        card_id: "ast_may_card",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_may",
                activation_mode: "immediate",
                is_optional: false,
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
              },
            ],
          },
        },
      });

      const mayNotCard = createCard("c_may_not", "ast_may_not_card", "Rule Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        SpecialAbility: "Players may not use Evil Enhancements.",
      });
      const mayCard = createCard("c_may", "ast_may_card", "Draw Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        SpecialAbility: "You may draw 1 card.",
      });

      BattleTriggerService.handleCardBattleEntry(room, player1, mayNotCard, { from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD });
      BattleTriggerService.handleCardBattleEntry(room, player1, mayCard, { from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD });

      // Supported non-optional ability auto-executes into history with isOptional: false, while 'may' waits in items
      expect(state.effectChronicle.history.length).toBe(1);
      expect(state.effectChronicle.history[0].cardId).toBe(mayNotCard.id);
      expect(state.effectChronicle.history[0].isOptional).toBe(false);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(state.effectChronicle.items[0].cardId).toBe(mayCard.id);
      expect(state.effectChronicle.items[0].isOptional).toBe(true);
    });
  });

  describe("4. TargetCountResolver & Handler Count Semantics ('all' and min/max bounds)", () => {
    test("parseTargetCount handles fixed_value: 'all', min_value/max_value, and numeric shorthands", () => {
      const allFixed = parseTargetCount({ count: { fixed_value: "all" } });
      expect(allFixed.isAll).toBe(true);
      expect(allFixed.count).toBe(Infinity);
      expect(allFixed.isPlural).toBe(true);
      expect(allFixed.isSingleTarget).toBe(false);
      expect(allFixed.displayCount).toBe("all");

      const ranged = parseTargetCount({ count: { min_value: 0, max_value: 2 } });
      expect(ranged.isAll).toBe(false);
      expect(ranged.hasCustomMin).toBe(true);
      expect(ranged.hasCustomMax).toBe(true);
      expect(ranged.count).toBe(2);
      expect(ranged.finiteCount).toBe(2);
      expect(ranged.isPlural).toBe(true);
      expect(ranged.isSingleTarget).toBe(false);

      const single = parseTargetCount({ count: { min_value: 0, max_value: 1 } });
      expect(single.finiteCount).toBe(1);
      expect(single.isSingleTarget).toBe(false);

      const defaultOne = parseTargetCount({});
      expect(defaultOne.count).toBe(1);
      expect(defaultOne.isSingleTarget).toBe(true);
    });

    test("DiscardHandler, ZoneTransferHandler, and DrawHandler support fixed_value: 'all' and max_value", () => {
      const h1 = createCard("h1", "1", "Hero 1", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const h2 = createCard("h2", "2", "Hero 2", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const h3 = createCard("h3", "3", "Hero 3", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });

      const bounceRes = ZoneTransferHandler.execute({
        room,
        player: player2,
        item: { cardId: "src", title: "Mass Bounce" },
        effect: {
          action: AST_ACTIONS.BOUNCE,
          destination: "hand",
          target: {
            selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
            scope: AST_SCOPES.BATTLE,
            zone_owner: AST_ZONE_OWNERS.OPPONENT,
            target_type: "hero",
            count: { fixed_value: "all" },
          },
        },
        options: { specialInitiativeDeclined: true },
      });
      expect(bounceRes.success).toBe(true);
      expect(player1.hand.map((c) => c.id)).toEqual([h1.id, h2.id, h3.id]);

      const discardRes = DiscardHandler.execute({
        room,
        player: player2,
        item: { cardId: "src", title: "Mass Hand Discard" },
        effect: {
          action: AST_ACTIONS.DISCARD,
          target: {
            selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
            scope: AST_SCOPES.HAND,
            zone_owner: AST_ZONE_OWNERS.OPPONENT,
            target_type: "hero",
            count: { fixed_value: "all" },
          },
        },
        options: { specialInitiativeDeclined: true },
      });
      expect(discardRes.success).toBe(true);
      expect(player1.hand.length).toBe(0);
      expect(player1.discard.length).toBe(3);

      createCard("d1", "10", "Deck 1", ZONES.DECK, "p1");
      createCard("d2", "11", "Deck 2", ZONES.DECK, "p1");
      createCard("d3", "12", "Deck 3", ZONES.DECK, "p1");
      const drawRes = DrawHandler.execute({
        room,
        player: player1,
        item: { cardId: "src", title: "Up to 2 Draw" },
        effect: {
          action: AST_ACTIONS.DRAW,
          target: { count: { min_value: 0, max_value: 2 } },
        },
      });
      expect(drawRes.success).toBe(true);
      expect(player1.hand.length).toBe(2);
      expect(player1.deck.length).toBe(1);
    });
  });

  describe("5. TargetSelectionService target_card_ids Structured Constraints", () => {
    test("enforces structured constraints (gender, testament, is_generic, classes, stat_filters) while still bypassing card_titles", () => {
      const davidOTMale = createCard("david_1", "1001", "King David", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        Gender: "male",
        IsGeneric: false,
        Testament: "OT",
        Class: "Warrior",
        Strength: "8",
        Toughness: "8",
      });

      expect(
        TargetSelectionService.matchesFilter(davidOTMale, {
          target_card_ids: ["1001"],
          card_titles: ["Different Title"],
          gender: "male",
          testament: "OT",
          is_generic: false,
          classes: ["Warrior"],
          stat_filters: [{ stat: "strength", operator: ">=", value: 8 }],
        })
      ).toBe(true);

      expect(TargetSelectionService.matchesFilter(davidOTMale, { target_card_ids: ["1001"], gender: "female" })).toBe(false);
      expect(TargetSelectionService.matchesFilter(davidOTMale, { target_card_ids: ["1001"], testament: "NT" })).toBe(false);
      expect(TargetSelectionService.matchesFilter(davidOTMale, { target_card_ids: ["1001"], is_generic: true })).toBe(false);
      expect(TargetSelectionService.matchesFilter(davidOTMale, { target_card_ids: ["1001"], classes: ["Weapon"] })).toBe(false);
      expect(
        TargetSelectionService.matchesFilter(davidOTMale, {
          target_card_ids: ["1001"],
          stat_filters: [{ stat: "strength", operator: ">=", value: 10 }],
        })
      ).toBe(false);
    });
  });

  describe("6. AbilityResolver Non-Zero-Index choice_group Discovery", () => {
    test("prompts modal options even when abilities[0] is a non-choice static ability", () => {
      registerAstCard("ast_late_choice", {
        card_id: "ast_late_choice",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "ab_static_prot",
                activation_mode: AST_ACTIVATION_MODES.STATIC,
                conditions: [],
                effects: [],
                modifiers: [{ modifier_type: "cannot_be_negated", applies_to: "this_side" }],
              },
              {
                ability_id: "ab_choice_draw_1",
                activation_mode: "immediate",
                is_optional: true,
                choice_group: "late_modal",
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
              },
              {
                ability_id: "ab_choice_draw_2",
                activation_mode: "immediate",
                is_optional: true,
                choice_group: "late_modal",
                conditions: [],
                effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 2 } } }],
              },
            ],
          },
        },
      });

      const modalCard = createCard("c_modal", "ast_late_choice", "Modal Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const resolveRes = room.abilityResolver.resolve({
        id: "item_modal_1",
        cardId: modalCard.id,
        controllerId: "p1",
        title: modalCard.Name,
        abilityId: "",
      });

      expect(resolveRes.handled).toBe(true);
      expect(resolveRes.awaitingConfirmation).toBe(true);
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: expect.arrayContaining([
            expect.objectContaining({ abilityId: "ab_choice_draw_1" }),
            expect.objectContaining({ abilityId: "ab_choice_draw_2" }),
          ]),
        })
      );
    });
  });

  describe("7. Playtest Bugfixes: Multi-Banding Star/Fallback Chain & Ramses Static Protect", () => {
    test("Simon the Host multi-banding Repudiating Rulers (GoC) and Pharisees (GoC) chains without deadlocking", () => {
      state.battle.initiativePlayerId = "p2";
      createCard("atk_hero", "101", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        Brigade: "Silver",
      });
      createCard("opp_terr_hero", "102", "Territory Hero", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      createCard("opp_terr_hero_2", "103", "Territory Hero 2", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const simon = createCard("c_simon", "1461788434", "Simon the Host (GoC)", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        Identifier: "Pharisee",
        SpecialAbility: "May band to any number of Pharisees. If alone, you may choose a Hero to attack. Cannot be negated if you control 2 or more meek Lost Souls.",
      });
      const repudiating = createCard("c_repud", "1864837258", "Repudiating Rulers (GoC)", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        IsStarCard: true,
        Class: "Star",
        Identifier: "Generic, Pharisee",
        SpecialAbility: "Bounce a character in a territory. You may take an evil N.T. gray card from Reserve (or deck if you control a meek Lost Soul).",
      });
      const phariseesGoC = createCard("c_phar_goc", "-1339931472", "Pharisees (GoC)", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        Identifier: "Generic, Pharisee",
        SpecialAbility: "May band to all Pharisees.",
      });
      createCard("c_phar_extra", "301", "Extra Pharisee", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        Identifier: "Generic, Pharisee",
      });

      // 1. Block with Simon the Host
      new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: simon.id });
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ cardId: simon.id })
      );

      // 2. Accept Simon's band -> must allow 1..3 (NOT force all 3!)
      client2.send.mockClear();
      new RespondOptionalAbilityCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: true,
      });
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          sourceCardId: simon.id,
          minTargets: 1,
          maxTargets: 3,
        })
      );

      // 3. Band Repudiating Rulers (GoC) and Pharisees (GoC) -> Simon's remaining ability, Repudiating Rulers (AST bounce + choice), and Pharisees chain cleanly
      client2.send.mockClear();
      new SelectTargetCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        abilityId: "simon_the_host_band_pharisees",
        selectedCardIds: [repudiating.id, phariseesGoC.id],
      });

      expect(state.battlefield.map((c) => c.id)).toEqual(
        expect.arrayContaining(["atk_hero", simon.id, repudiating.id, phariseesGoC.id])
      );
      expect(state.effectChronicle.items.map((i) => i.cardId)).toEqual([
        simon.id,
        repudiating.id,
        repudiating.id,
        phariseesGoC.id,
      ]);

      // Pass Simon's second optional ability -> advances to #1 Repudiating Rulers bounce (Star ability skipped!)
      client2.send.mockClear();
      new RespondOptionalAbilityCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: false,
      });
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([
        "repudiating_rulers_bounce",
        "",
        "ab_1_band",
      ]);
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          sourceCardId: repudiating.id,
          abilityId: "repudiating_rulers_bounce",
          eligibleCardIds: ["opp_terr_hero", "opp_terr_hero_2"],
        })
      );

      // 4. Bounce territory Hero -> advances to Repudiating Rulers' take choice_group (or auto-completes if empty -> Pharisees)
      client2.send.mockClear();
      new SelectTargetCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        abilityId: "repudiating_rulers_bounce",
        selectedCardIds: ["opp_terr_hero"],
      });

      expect(room.cardLookup.get("opp_terr_hero").zone).toBe(ZONES.HAND);
      expect(state.effectChronicle.items.map((i) => i.cardId)).toEqual([phariseesGoC.id]);
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ cardId: phariseesGoC.id })
      );

      // 5. Pass #2 Pharisees (GoC) -> Chronicle finishes cleanly
      new RespondOptionalAbilityCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: false,
      });
      expect(state.effectChronicle.items.length).toBe(0);
      expect(state.effectChronicle.isResolving).toBe(false);
    });

    test("Pharaoh, Ramses II [K] applies static protection without prompt and prompts look_at_hand cleanly", () => {
      state.battle.initiativePlayerId = "p2";
      createCard("atk_hero_2", "101", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        Brigade: "Silver",
      });
      createCard("opp_hand_1", "103", "Hidden Hero", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const ramses = createCard("c_ramses", "-422285470", "Pharaoh, Ramses II [K]", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        SpecialAbility: "Protect this character from lone Heroes. You may look at a hand.",
      });

      new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: ramses.id });

      const activeRamses = room.cardLookup.get(ramses.id);
      expect(activeRamses.isProtected).toBe(true);
      expect(activeRamses._protection?.card_sources?.[0]?.identifiers).toEqual(["lone"]);
      // Protect auto-applied silently; only look_at_hand (immediate, optional) emits a single optional prompt
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["look_at_hand"]);
      const optionalPromptCalls = client2.send.mock.calls.filter(
        ([msgType]) => msgType === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY
      );
      expect(optionalPromptCalls).toHaveLength(1);
      expect(optionalPromptCalls[0][1]).toEqual(
        expect.objectContaining({
          abilityId: "look_at_hand",
          action: "look",
          promptText: "Look at opponent's hand?",
        })
      );

      new RespondOptionalAbilityCommand(room, client2).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: false,
      });
      expect(state.effectChronicle.items.length).toBe(0);
      expect(state.effectChronicle.isResolving).toBe(false);

      const ramsesProtectAbility = AbilityLookup.getCardLogic("-422285470").sides.top.abilities[0];
      expect(room.abilityResolver._formatAbilityChoiceLabel(ramsesProtectAbility, activeRamses)).toBe(
        "Protect this card from good lone hero"
      );
      expect(
        room.abilityResolver._getOptionalPromptText(ramsesProtectAbility.effects[0], activeRamses, { title: activeRamses.Name })
      ).toBe("Protect this card from good lone hero?");
    });
  });
});
