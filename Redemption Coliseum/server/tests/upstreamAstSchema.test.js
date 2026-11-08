// server/tests/upstreamAstSchema.test.js
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { ProtectionService } = require("../../shared/rules/ProtectionService");
const { ImmunityHandler } = require("../src/ast/handlers/ImmunityHandler");
const { ConditionEvaluator } = require("../src/ast/ConditionEvaluator");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { StatFilterEvaluator } = require("../../shared/rules/StatFilterEvaluator");
const {
  AST_ACTIONS,
  AST_SCOPES,
  AST_SELECTION_MODES,
  AST_STAT_FILTER_STATS,
  AST_STAT_FILTER_OPERATORS,
} = require("../../shared/astConstants");
const { ActionType } = require("../../shared/actions");
const { ZONES } = require("../../shared/zones");

describe("Upstream Card Ability AST & Schema Updates", () => {
  describe("1. CardSides Architecture & Star Abilities", () => {
    beforeEach(() => {
      // Mock cards_logic cache in AbilityLookup
      AbilityLookup._cardsLogic = {
        single_star_card: {
          card_id: "single_star_card",
          card_name: "Single Sided Star Card",
          sides: {
            top: {
              abilities: [
                {
                  ability_id: "star_phase_ability",
                  is_star: true,
                  activation_mode: "triggered",
                  trigger_event: "star_phase",
                  effects: [{ action: "draw", count: { fixed_value: 1 } }],
                },
                {
                  ability_id: "regular_battle_ability",
                  is_star: false,
                  activation_mode: "immediate",
                  effects: [{ action: "band", count: { fixed_value: 1 } }],
                },
              ],
            },
          },
        },
        dual_card: {
          card_id: "dual_card",
          card_name: "Dual Sided Hero / Evil",
          sides: {
            shared: {
              abilities: [
                {
                  ability_id: "shared_star_ability",
                  is_star: true,
                  trigger_event: "star_phase",
                  effects: [{ action: "look", count: { fixed_value: 3 } }],
                },
                {
                  ability_id: "shared_passive_ability",
                  is_star: false,
                  activation_mode: "static",
                  effects: [{ action: "modify_stats" }],
                },
              ],
            },
            top: {
              alignment: "good",
              abilities: [
                {
                  ability_id: "good_side_ability",
                  is_star: false,
                  effects: [{ action: "draw", count: { fixed_value: 2 } }],
                },
              ],
            },
            bottom: {
              alignment: "evil",
              abilities: [
                {
                  ability_id: "evil_side_ability",
                  is_star: false,
                  effects: [{ action: "discard", count: { fixed_value: 1 } }],
                },
              ],
            },
          },
        },
      };
    });

    afterAll(() => {
      AbilityLookup._cardsLogic = null;
    });

    test("Single-sided card resolves star ability during star phase and regular ability during standard play", () => {
      // Star phase resolution: only resolves star ability from sides.top
      const starAbilities = AbilityLookup.resolveAbilities("single_star_card", {
        actionType: ActionType.ACTIVATE_STAR_ABILITY,
      });
      expect(starAbilities).toHaveLength(1);
      expect(starAbilities[0].ability_id).toBe("star_phase_ability");
      expect(starAbilities[0].is_star).toBe(true);

      // Standard play resolution: filters out star abilities, strictly resolves regular abilities from sides.top
      const regularAbilities = AbilityLookup.resolveAbilities("single_star_card");
      expect(regularAbilities).toHaveLength(1);
      expect(regularAbilities[0].ability_id).toBe("regular_battle_ability");
      expect(regularAbilities[0].is_star).toBe(false);
    });

    test("Dual-sided card resolves star ability from sides.shared and side-specific abilities from active side", () => {
      // Star phase resolution for dual card: resolves star ability from sides.shared
      const starAbilities = AbilityLookup.resolveAbilities("dual_card", {
        actionType: ActionType.ACTIVATE_STAR_ABILITY,
        isStarCard: true,
      });
      expect(starAbilities).toHaveLength(1);
      expect(starAbilities[0].ability_id).toBe("shared_star_ability");

      // Regular resolution for good side (top)
      const goodAbilities = AbilityLookup.resolveAbilities("dual_card", {
        inGameAlignment: "good",
      });
      const goodIds = goodAbilities.map((a) => a.ability_id);
      expect(goodIds).toContain("shared_passive_ability");
      expect(goodIds).toContain("good_side_ability");
      expect(goodIds).not.toContain("evil_side_ability");
      expect(goodIds).not.toContain("shared_star_ability");

      // Regular resolution for evil side (bottom)
      const evilAbilities = AbilityLookup.resolveAbilities("dual_card", {
        inGameAlignment: "evil",
      });
      const evilIds = evilAbilities.map((a) => a.ability_id);
      expect(evilIds).toContain("shared_passive_ability");
      expect(evilIds).toContain("evil_side_ability");
      expect(evilIds).not.toContain("good_side_ability");
      expect(evilIds).not.toContain("shared_star_ability");
    });
  });

  describe("2. DynamicValue: Range Bounds & 'Up to <N>'", () => {
    const mockRoom = {
      state: {
        players: new Map([
          [
            "p1",
            {
              sessionId: "p1",
              name: "Player 1",
              territory: [
                { id: "hero_1", Type: "Hero", inGameType: "Hero", Alignment: "Good" },
                { id: "hero_2", Type: "Hero", inGameType: "Hero", Alignment: "Good" },
                { id: "hero_3", Type: "Hero", inGameType: "Hero", Alignment: "Good" },
              ],
            },
          ],
        ]),
      },
    };
    const actingPlayer = mockRoom.state.players.get("p1");

    test("Evaluates 'up to N' (min_value: 0, max_value: N) as optional targeting", () => {
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        scope: ["territory"],
        target_type: "hero",
        count: { min_value: 0, max_value: 2, fixed_value: null },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(mockRoom, actingPlayer, targetDef);
      expect(eligible.minTargets).toBe(0);
      expect(eligible.maxTargets).toBe(2);
      expect(eligible.canCancel).toBe(true);
      expect(eligible.requiresSelection).toBe(true);

      // Validate 0 chosen targets (optional pass)
      expect(TargetSelectionService.validateSelection({ selectedCardIds: [] }, eligible).valid).toBe(true);
      // Validate 1 chosen target
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["hero_1"] }, eligible).valid).toBe(true);
      // Validate 2 chosen targets
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["hero_1", "hero_2"] }, eligible).valid).toBe(true);
      // Validate 3 chosen targets (exceeds max_value)
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["hero_1", "hero_2", "hero_3"] }, eligible).valid).toBe(false);
    });

    test("Evaluates explicit numeric range (min_value: 1, max_value: 2)", () => {
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        scope: ["territory"],
        target_type: "hero",
        count: { min_value: 1, max_value: 2, fixed_value: null },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(mockRoom, actingPlayer, targetDef);
      expect(eligible.minTargets).toBe(1);
      expect(eligible.maxTargets).toBe(2);

      expect(TargetSelectionService.validateSelection({ selectedCardIds: [] }, eligible).valid).toBe(false);
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["hero_1"] }, eligible).valid).toBe(true);
      expect(TargetSelectionService.validateSelection({ selectedCardIds: ["hero_1", "hero_2"] }, eligible).valid).toBe(true);
    });

    test("Evaluates exact fixed count (fixed_value: 1)", () => {
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        scope: ["territory"],
        target_type: "hero",
        count: { min_value: null, max_value: null, fixed_value: 1 },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(mockRoom, actingPlayer, targetDef);
      expect(eligible.minTargets).toBe(1);
      expect(eligible.maxTargets).toBe(1);
    });
  });

  describe("3. TargetSelector: The 6 Orthogonal Buckets", () => {
    test("Bucket 1 & 2: Canonical target_type and singularized identifiers via ORDIR / Class", () => {
      const phariseeCard = {
        id: "c1",
        Name: "Nicodemus",
        Type: "Hero",
        Alignment: "Good",
        Class: "Pharisee",
        ORDIR: ["Ruler", "Pharisee"],
        Identifier: "Pharisee",
      };

      // Canonical target_type: character
      expect(
        TargetSelectionService.matchesFilter(phariseeCard, {
          target_type: "character",
          identifiers: ["Pharisee"],
        })
      ).toBe(true);

      // Subtype mismatch
      expect(
        TargetSelectionService.matchesFilter(phariseeCard, {
          target_type: "character",
          identifiers: ["Demon"],
        })
      ).toBe(false);

      // Word boundary check: "Man" must NOT match "Roman"
      const romanCard = {
        id: "c2",
        Name: "Cornelius",
        Type: "Hero",
        Alignment: "Good",
        Class: "Roman",
        ORDIR: ["Roman Centurion"],
        Identifier: "Roman",
      };
      expect(
        TargetSelectionService.matchesFilter(romanCard, {
          identifiers: ["Man"],
        })
      ).toBe(false);
      expect(
        TargetSelectionService.matchesFilter(romanCard, {
          identifiers: ["Roman"],
        })
      ).toBe(true);
    });

    test("Bucket 3: Dedicated testament attribute ('OT' / 'NT')", () => {
      const otHero = {
        id: "c3",
        Name: "Moses",
        Type: "Hero",
        Testament: "OT",
        ORDIR: ["OT Character", "Prophet", "Lawgiver"],
      };
      const ntHero = {
        id: "c4",
        Name: "Peter",
        Type: "Hero",
        Testament: "NT",
        ORDIR: ["NT Character", "Apostle"],
      };

      // Filter for OT
      expect(TargetSelectionService.matchesFilter(otHero, { testament: "OT" })).toBe(true);
      expect(TargetSelectionService.matchesFilter(ntHero, { testament: "OT" })).toBe(false);

      // Filter for NT
      expect(TargetSelectionService.matchesFilter(ntHero, { testament: "NT" })).toBe(true);
      expect(TargetSelectionService.matchesFilter(otHero, { testament: "NT" })).toBe(false);
    });

    test("Bucket 4: Dedicated references attribute (biblical book citations)", () => {
      const genesisCard = {
        id: "c5",
        Name: "Noah",
        Type: "Hero",
        Reference: "Genesis 6:8",
        ORDIR: ["Genesis 6-10 Card", "Genesis Card", "Flood Survivor"],
      };
      const actsCard = {
        id: "c6",
        Name: "Paul",
        Type: "Hero",
        Reference: "Acts 9:15",
        ORDIR: ["Acts Card", "Apostle"],
      };

      // Match Genesis book citation
      expect(TargetSelectionService.matchesFilter(genesisCard, { references: ["Genesis"] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(actsCard, { references: ["Genesis"] })).toBe(false);

      // Match chapter range citation
      expect(TargetSelectionService.matchesFilter(genesisCard, { references: ["Genesis 6-10"] })).toBe(true);

      // Match Acts
      expect(TargetSelectionService.matchesFilter(actsCard, { references: ["Acts"] })).toBe(true);
    });

    test("Bucket 5: Specific brigades filter", () => {
      const goldHero = {
        id: "c7",
        Name: "Priest",
        Type: "Hero",
        Brigades: ["Gold"],
      };

      expect(TargetSelectionService.matchesFilter(goldHero, { brigades: ["Gold"] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(goldHero, { brigades: ["Crimson"] })).toBe(false);
    });
  });

  describe("4. Banding Scope Default Normalization", () => {
    test("Defaults banding scope to ['in_play', 'hand'] when unrestricted", () => {
      const mockRoom = {
        state: {
          players: new Map([
            [
              "p1",
              {
                sessionId: "p1",
                name: "Player 1",
                territory: [{ id: "hero_terr", Type: "Hero", inGameType: "Hero", Alignment: "Good" }],
                hand: [{ id: "hero_hand", Type: "Hero", inGameType: "Hero", Alignment: "Good" }],
                reserve: [{ id: "hero_res", Type: "Hero", inGameType: "Hero", Alignment: "Good" }],
              },
            ],
          ]),
          battlefield: [],
        },
      };
      const actingPlayer = mockRoom.state.players.get("p1");

      // Default scope (no scope specified in targetDef)
      const defaultBandDef = {
        action: AST_ACTIONS.BAND,
        target_type: "hero",
        count: { fixed_value: 1 },
      };
      const defaultEligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        actingPlayer,
        defaultBandDef,
        { actionType: AST_ACTIONS.BAND }
      );
      expect(defaultEligible.eligibleCardIds).toContain("hero_terr");
      expect(defaultEligible.eligibleCardIds).toContain("hero_hand");
      expect(defaultEligible.eligibleCardIds).not.toContain("hero_res");

      // Explicit territory-only restriction
      const terrOnlyDef = {
        action: AST_ACTIONS.BAND,
        scope: ["territory"],
        target_type: "hero",
        count: { fixed_value: 1 },
      };
      const terrEligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        actingPlayer,
        terrOnlyDef,
        { actionType: AST_ACTIONS.BAND }
      );
      expect(terrEligible.eligibleCardIds).toContain("hero_terr");
      expect(terrEligible.eligibleCardIds).not.toContain("hero_hand");

      // Explicit reserve restriction
      const reserveDef = {
        action: AST_ACTIONS.BAND,
        scope: ["reserve_pile"],
        target_type: "hero",
        count: { fixed_value: 1 },
      };
      const resEligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        actingPlayer,
        reserveDef,
        { actionType: AST_ACTIONS.BAND }
      );
      expect(resEligible.eligibleCardIds).toContain("hero_res");
      expect(resEligible.eligibleCardIds).not.toContain("hero_terr");
      expect(resEligible.eligibleCardIds).not.toContain("hero_hand");
    });

    test("Excludes characters already in battle from banding targets even if scope includes in_play or battle", () => {
      const heroInBattle = { id: "hero_in_battle", Type: "Hero", inGameType: "Hero", Alignment: "Good", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const heroInTerritory = { id: "hero_in_terr", Type: "Hero", inGameType: "Hero", Alignment: "Good", zone: ZONES.TERRITORY, controllerId: "p1" };
      const heroInHand = { id: "hero_in_hand", Type: "Hero", inGameType: "Hero", Alignment: "Good", zone: ZONES.HAND, controllerId: "p1" };
      const mockRoom = {
        state: {
          players: new Map([
            [
              "p1",
              {
                sessionId: "p1",
                name: "Player 1",
                territory: [heroInTerritory],
                hand: [heroInHand],
                reserve: [],
              },
            ],
          ]),
          battlefield: [heroInBattle],
        },
      };
      const actingPlayer = mockRoom.state.players.get("p1");

      const bandDef = {
        action: AST_ACTIONS.BAND,
        scope: ["in_play", "hand", "battle"],
        target_type: "hero",
        count: { fixed_value: 1 },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        actingPlayer,
        bandDef,
        { actionType: AST_ACTIONS.BAND }
      );

      // Hero already in battle must NOT be an eligible banding target
      expect(eligible.eligibleCardIds).not.toContain("hero_in_battle");
      // Heroes in territory and hand remain eligible
      expect(eligible.eligibleCardIds).toContain("hero_in_terr");
      expect(eligible.eligibleCardIds).toContain("hero_in_hand");
    });
  });

  describe("5. Protection & Immunity Structure (protection_filter)", () => {
    test("Cross-references prohibited actions and hostile card_sources", () => {
      const protectedHero = {
        id: "hero_prot",
        controllerId: "p1",
        Alignment: "Good",
        isProtected: true,
        _protection: {
          actions: ["discard", "capture"],
          card_sources: [
            {
              target_type: "evil_character",
              alignment: "evil",
              identifiers: ["Demon"],
            },
          ],
        },
      };

      const hostileDemon = {
        id: "demon_src",
        controllerId: "p2",
        Type: "Evil Character",
        inGameType: "Evil Character",
        Alignment: "Evil",
        Class: "Demon",
        ORDIR: ["Demon"],
      };

      const hostileHuman = {
        id: "human_src",
        controllerId: "p2",
        Type: "Evil Character",
        inGameType: "Evil Character",
        Alignment: "Evil",
        Class: "Human",
        ORDIR: ["Human", "Soldier"],
      };

      // Discard from Demon is prohibited
      expect(ProtectionService.isProtected(protectedHero, hostileDemon, "discard")).toBe(true);
      // Capture from Demon is prohibited
      expect(ProtectionService.isProtected(protectedHero, hostileDemon, "capture")).toBe(true);
      // Modify numbers (or other actions) from Demon is not prohibited by this specific actions list
      expect(ProtectionService.isProtected(protectedHero, hostileDemon, "modify_numbers")).toBe(false);

      // Discard from Human Evil Character is NOT blocked because source doesn't match card_sources (Demon)
      expect(ProtectionService.isProtected(protectedHero, hostileHuman, "discard")).toBe(false);
    });

    test("Evaluates all_cards and all_abilities flags from protection_filter", () => {
      const cardImmuneHero = {
        id: "hero_all_cards",
        controllerId: "p1",
        Alignment: "Good",
        isImmune: true,
        _protection: {
          all_cards: true,
        },
      };

      const abilityImmuneHero = {
        id: "hero_all_abilities",
        controllerId: "p1",
        Alignment: "Good",
        isImmune: true,
        _protection: {
          all_abilities: true,
        },
      };

      const opponentCard = {
        id: "opp_evil",
        controllerId: "p2",
        Alignment: "Evil",
      };

      const friendlyCard = {
        id: "friend_hero",
        controllerId: "p1",
        Alignment: "Good",
      };

      // Complete card immunity blocks opponent
      expect(ProtectionService.isProtected(cardImmuneHero, opponentCard, "discard")).toBe(true);
      expect(ProtectionService.isProtected(cardImmuneHero, friendlyCard, "discard")).toBe(false);

      // Special ability immunity blocks opponent
      expect(ProtectionService.isProtected(abilityImmuneHero, opponentCard, "negate")).toBe(true);
    });

    test("ImmunityHandler._buildProtectionDef extracts all_cards, all_abilities, and protection_filter", () => {
      const effect = {
        action: "immune",
        duration: "permanent",
        target: {
          scope: ["in_play"],
        },
        protection_filter: {
          all_cards: true,
          all_abilities: false,
          actions: ["discard", "capture", "negate"],
          except_actions: ["harm"],
          card_sources: [{ target_type: "evil_character" }],
        },
      };

      const protDef = ImmunityHandler._buildProtectionDef(effect);
      expect(protDef.all_cards).toBe(true);
      expect(protDef.all_abilities).toBe(false);
      expect(protDef.actions).toEqual(["discard", "capture", "negate"]);
      expect(protDef.except_actions).toEqual(["harm"]);
      expect(protDef.card_sources).toHaveLength(1);
    });
  });

  describe("6. Dominant Ability Play & Zone Check Selector Conditions", () => {
    test("ConditionEvaluator evaluates zone_check with selector against matching cards in battle", () => {
      const condition = {
        condition_type: "zone_check",
        selector: {
          selection_mode: "automatic_all",
          zone_owner: "controller",
          scope: ["battle"],
          target_type: "hero",
          alignment: "good",
          testament: "OT",
          identifiers: ["Human"],
        },
        operator: "==",
      };

      const mosesInBattle = {
        id: "hero_moses",
        Name: "Moses",
        inGameType: "Hero",
        Alignment: "Good",
        Testament: "OT",
        ORDIR: ["Human", "Exodus Card"],
        zone: ZONES.BATTLEFIELD,
        controllerId: "p1",
      };

      const mockRoom = {
        state: {
          players: new Map([
            ["p1", { sessionId: "p1", name: "Player 1", territory: [], hand: [] }],
          ]),
          battlefield: [mosesInBattle],
        },
        cardLookup: new Map([["hero_moses", mosesInBattle]]),
      };

      // Dominant card is in Territory or Discard, NOT Battlefield
      const dominantCard = { id: "dom_pillar", Name: "Pillar of Fire", zone: ZONES.TERRITORY, controllerId: "p1" };

      const resWithMoses = ConditionEvaluator.evaluate([condition], {
        room: mockRoom,
        player: mockRoom.state.players.get("p1"),
        card: dominantCard,
      });
      expect(resWithMoses.valid).toBe(true);

      // Without Moses in battle, condition must fail
      mockRoom.state.battlefield = [];
      const resWithoutMoses = ConditionEvaluator.evaluate([condition], {
        room: mockRoom,
        player: mockRoom.state.players.get("p1"),
        card: dominantCard,
      });
      expect(resWithoutMoses.valid).toBe(false);
    });

    test("Pillar of Fire resolves 'up to 3' Exodus Heroes with minTargets 0 and maxTargets 3", () => {
      const exodusHero1 = {
        id: "ex_1",
        Name: "Aaron",
        inGameType: "Hero",
        Alignment: "Good",
        Testament: "OT",
        ORDIR: ["Human", "Exodus Card"],
        Reference: "Exodus 4:14",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };
      const exodusHero2 = {
        id: "ex_2",
        Name: "Miriam",
        inGameType: "Hero",
        Alignment: "Good",
        Testament: "OT",
        ORDIR: ["Human", "Exodus Card"],
        Reference: "Exodus 15:20",
        zone: ZONES.HAND,
        controllerId: "p1",
      };
      const nonExodusHero = {
        id: "non_ex",
        Name: "David",
        inGameType: "Hero",
        Alignment: "Good",
        Testament: "OT",
        ORDIR: ["Human"],
        Reference: "I Samuel 16:13",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };

      const mockRoom = {
        state: {
          players: new Map([
            ["p1", { sessionId: "p1", name: "Player 1", territory: [exodusHero1, nonExodusHero], hand: [exodusHero2], reserve: [] }],
          ]),
          battlefield: [],
        },
      };

      const pillarTargetDef = {
        selection_mode: "manual_controller",
        zone_owner: "controller",
        scope: ["in_play", "hand"],
        target_type: "hero",
        alignment: "good",
        references: ["Exodus"],
        count: { min_value: 0, max_value: 3 },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        mockRoom.state.players.get("p1"),
        pillarTargetDef,
        { actionType: AST_ACTIONS.BAND }
      );

      expect(eligible.eligibleCardIds).toContain("ex_1");
      expect(eligible.eligibleCardIds).toContain("ex_2");
      expect(eligible.eligibleCardIds).not.toContain("non_ex");
      expect(eligible.minTargets).toBe(0);
      expect(eligible.maxTargets).toBe(2); // Capped by available matching candidates (2)
      expect(eligible.promptText).toBe("Select up to 3 card(s) to target");
      expect(eligible.requiresSelection).toBe(true);
    });

    test("BattleTriggerService.onDominantPlayed enqueues Dominant played from Hand", () => {
      const dominantCard = {
        id: "dom_pof",
        templateId: "-2007478863",
        Name: "Pillar of Fire [L]",
        Type: "Dominant",
        Alignment: "Good",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };

      const mosesInBattle = {
        id: "hero_moses",
        Name: "Moses",
        inGameType: "Hero",
        Alignment: "Good",
        Testament: "OT",
        ORDIR: ["Human", "Exodus Card"],
        zone: ZONES.BATTLEFIELD,
        controllerId: "p1",
      };

      const mockRoom = {
        state: {
          isArenaMode: false,
          players: new Map([
            ["p1", { sessionId: "p1", name: "Player 1", territory: [dominantCard], hand: [] }],
          ]),
          battlefield: [mosesInBattle],
          effectChronicle: {
            items: [],
            isResolving: false,
          },
        },
        cardLookup: new Map([
          ["dom_pof", dominantCard],
          ["hero_moses", mosesInBattle],
        ]),
        clients: [{ sessionId: "p1", send: jest.fn() }],
        broadcastGameLog: jest.fn(),
      };
      mockRoom.abilityResolver = new AbilityResolver(mockRoom);

      const res = BattleTriggerService.onDominantPlayed(
        mockRoom,
        mockRoom.state.players.get("p1"),
        dominantCard,
        { from: ZONES.HAND, to: ZONES.TERRITORY }
      );

      expect(res).not.toBeNull();
      expect(res.triggered).toBe(true);
      expect(res.abilityId).toBe("pillar_of_fire_band_l");
      expect(mockRoom.state.effectChronicle.items.length).toBe(1);
      expect(mockRoom.state.effectChronicle.items[0].cardId).toBe("dom_pof");
    });
  });

  describe("7. Structured StatFilters on TargetSelector", () => {
    test("Evaluates 'strength' comparison (e.g. strength >= 10)", () => {
      const strongHero = {
        id: "hero_strong",
        Name: "Strong Hero",
        inGameType: "Hero",
        Strength: "10",
        Toughness: "4",
      };
      const weakHero = {
        id: "hero_weak",
        Name: "Weak Hero",
        inGameType: "Hero",
        Strength: "9",
        Toughness: "4",
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.STRENGTH,
        operator: AST_STAT_FILTER_OPERATORS.GTE,
        value: 10,
      };

      expect(StatFilterEvaluator.matchesStatFilters(strongHero, [filter])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(weakHero, [filter])).toBe(false);
    });

    test("Evaluates 'toughness' comparison (e.g. toughness <= 5)", () => {
      const lowToughness = {
        id: "char_fragile",
        Name: "Fragile Character",
        inGameType: "Hero",
        Strength: "8",
        Toughness: "5",
      };
      const highToughness = {
        id: "char_sturdy",
        Name: "Sturdy Character",
        inGameType: "Hero",
        Strength: "8",
        Toughness: "6",
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.TOUGHNESS,
        operator: AST_STAT_FILTER_OPERATORS.LTE,
        value: 5,
      };

      expect(StatFilterEvaluator.matchesStatFilters(lowToughness, [filter])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(highToughness, [filter])).toBe(false);
    });

    test("Evaluates 'both' comparison (both strength AND toughness <= 6)", () => {
      const balancedLow = {
        id: "c1",
        Name: "Low",
        inGameType: "Hero",
        Strength: "5",
        Toughness: "6",
      };
      const highStr = {
        id: "c2",
        Name: "High Str",
        inGameType: "Hero",
        Strength: "7",
        Toughness: "5",
      };
      const highTough = {
        id: "c3",
        Name: "High Tough",
        inGameType: "Hero",
        Strength: "5",
        Toughness: "8",
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.BOTH,
        operator: AST_STAT_FILTER_OPERATORS.LTE,
        value: 6,
      };

      expect(StatFilterEvaluator.matchesStatFilters(balancedLow, [filter])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(highStr, [filter])).toBe(false);
      expect(StatFilterEvaluator.matchesStatFilters(highTough, [filter])).toBe(false);
    });

    test("Evaluates 'either' comparison (either strength OR toughness == 3)", () => {
      const matchStr = {
        id: "c1",
        Name: "Match Str",
        inGameType: "Hero",
        Strength: "3",
        Toughness: "8",
      };
      const matchTough = {
        id: "c2",
        Name: "Match Tough",
        inGameType: "Hero",
        Strength: "6",
        Toughness: "3",
      };
      const noMatch = {
        id: "c3",
        Name: "No Match",
        inGameType: "Hero",
        Strength: "4",
        Toughness: "4",
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.EITHER,
        operator: AST_STAT_FILTER_OPERATORS.EQ,
        value: 3,
      };

      expect(StatFilterEvaluator.matchesStatFilters(matchStr, [filter])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(matchTough, [filter])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(noMatch, [filter])).toBe(false);
    });

    test("Evaluates relational operators '>', '<', and '!='", () => {
      const card = {
        id: "card_8",
        Strength: "8",
        Toughness: "8",
      };

      // Strict greater
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "strength", operator: ">", value: 7 }])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "strength", operator: ">", value: 8 }])).toBe(false);

      // Strict less
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "toughness", operator: "<", value: 9 }])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "toughness", operator: "<", value: 8 }])).toBe(false);

      // Not equal
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "strength", operator: "!=", value: 5 }])).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(card, [{ stat: "strength", operator: "!=", value: 8 }])).toBe(false);
    });

    test("Evaluates dynamic variables (variable: 'X') at runtime", () => {
      const card = {
        id: "card_dyn",
        Strength: "4",
        Toughness: "4",
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.TOUGHNESS,
        operator: AST_STAT_FILTER_OPERATORS.LTE,
        variable: "X",
      };

      // When X is resolved to 5 via context.variables
      expect(StatFilterEvaluator.matchesStatFilters(card, [filter], { variables: { X: 5 } })).toBe(true);

      // When X is resolved to 3 (4 <= 3 is false)
      expect(StatFilterEvaluator.matchesStatFilters(card, [filter], { variables: { X: 3 } })).toBe(false);

      // When X is unprovided in context, it fails safely
      expect(StatFilterEvaluator.matchesStatFilters(card, [filter], {})).toBe(false);
    });

    test("Evaluates conjunction (Logical AND) across multiple stat_filters", () => {
      const validCard = {
        id: "c_valid",
        Strength: "6",
        Toughness: "7",
      };
      const invalidLowStr = {
        id: "c_low_str",
        Strength: "4",
        Toughness: "7",
      };
      const invalidHighTough = {
        id: "c_high_tough",
        Strength: "6",
        Toughness: "9",
      };

      const filters = [
        { stat: AST_STAT_FILTER_STATS.STRENGTH, operator: AST_STAT_FILTER_OPERATORS.GTE, value: 5 },
        { stat: AST_STAT_FILTER_STATS.TOUGHNESS, operator: AST_STAT_FILTER_OPERATORS.LTE, value: 8 },
      ];

      expect(StatFilterEvaluator.matchesStatFilters(validCard, filters)).toBe(true);
      expect(StatFilterEvaluator.matchesStatFilters(invalidLowStr, filters)).toBe(false);
      expect(StatFilterEvaluator.matchesStatFilters(invalidHighTough, filters)).toBe(false);
    });

    test("Includes dynamic counter modifiers on cards", () => {
      const buffedCard = {
        id: "c_buffed",
        Strength: "8",
        Toughness: "8",
        counters: {
          strength_mod: 3, // Effective strength = 11
        },
      };

      const filter = {
        stat: AST_STAT_FILTER_STATS.STRENGTH,
        operator: AST_STAT_FILTER_OPERATORS.GTE,
        value: 10,
      };

      expect(StatFilterEvaluator.matchesStatFilters(buffedCard, [filter])).toBe(true);
    });

    test("ProtectionService.matchesSource respects stat_filters on source card", () => {
      const strongSource = {
        id: "src_strong",
        Type: "Evil Character",
        Alignment: "Evil",
        Strength: "12",
        Toughness: "10",
      };
      const weakSource = {
        id: "src_weak",
        Type: "Evil Character",
        Alignment: "Evil",
        Strength: "6",
        Toughness: "6",
      };

      const sourceDef = {
        target_type: "evil_character",
        stat_filters: [
          { stat: "strength", operator: ">=", value: 10 },
        ],
      };

      expect(ProtectionService.matchesSource(strongSource, sourceDef)).toBe(true);
      expect(ProtectionService.matchesSource(weakSource, sourceDef)).toBe(false);
    });

    test("TargetSelectionService evaluates Pharaoh's Officials [K] (593869575) filter: Egyptian with strength >= 10", () => {
      const eligibleOfficial = {
        id: "egyptian_strong",
        Name: "Potiphar",
        inGameType: "Evil Character",
        Alignment: "Evil",
        ORDIR: ["Egyptian"],
        Strength: "10",
        Toughness: "6",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };

      const weakOfficial = {
        id: "egyptian_weak",
        Name: "Weak Guard",
        inGameType: "Evil Character",
        Alignment: "Evil",
        ORDIR: ["Egyptian"],
        Strength: "8",
        Toughness: "6",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };

      const nonEgyptianStrong = {
        id: "babylonian_strong",
        Name: "Babylonian Officer",
        inGameType: "Evil Character",
        Alignment: "Evil",
        ORDIR: ["Babylonian"],
        Strength: "12",
        Toughness: "8",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };

      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "controller",
        scope: [AST_SCOPES.TERRITORY],
        target_type: "character",
        identifiers: ["Egyptian"],
        stat_filters: [
          {
            stat: "strength",
            operator: ">=",
            value: 10,
          },
        ],
      };

      const mockPlayer = {
        sessionId: "p1",
        name: "Player 1",
        territory: [eligibleOfficial, weakOfficial, nonEgyptianStrong],
      };

      const mockRoom = {
        state: {
          players: new Map([["p1", mockPlayer]]),
          battlefield: [],
        },
      };

      const eligible = TargetSelectionService.resolveEligibleTargets(
        mockRoom,
        mockPlayer,
        targetDef
      );

      expect(eligible.eligibleCardIds).toEqual(["egyptian_strong"]);
      expect(eligible.eligibleCardIds).not.toContain("egyptian_weak");
      expect(eligible.eligibleCardIds).not.toContain("babylonian_strong");
    });
  });
});

