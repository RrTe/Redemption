// server/tests/astBattlePrimitives.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { BattleCalculator } = require("../../shared/BattleCalculator");
const { BattleService } = require("../src/services/BattleService");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { ModifyNumbersHandler } = require("../src/ast/handlers/ModifyNumbersHandler");
const { BandHandler } = require("../src/ast/handlers/BandHandler");
const { ImmunityHandler } = require("../src/ast/handlers/ImmunityHandler");
const { DiscardHandler } = require("../src/ast/handlers/DiscardHandler");
const { ProtectionService } = require("../../shared/rules/ProtectionService");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { CombatRules, BandingRule } = require("../../shared/rules/CombatRules");
const { AST_ACTIONS, AST_MESSAGES } = require("../../shared/astConstants");
const { ActionType } = require("../../shared/actions");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");
const { BATTLE_STATE_REASON } = require("../../shared/battleConstants");
const { ChronicleItem } = require("../src/state/EffectChronicleState");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("Phase 3: Battle System Primitives & Combat Rules (REG v11.0.0)", () => {
  let room;
  let state;
  let p1;
  let p2;

  const createCard = (props) => {
    const card = new Card();
    Object.assign(card, props);
    return card;
  };

  beforeEach(() => {
    state = new RoomState();
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1 (Rescuer)" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2 (Blocker)" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    const lookupMap = new Map();
    room = {
      state,
      clients: [{ sessionId: "p1", send: jest.fn() }, { sessionId: "p2", send: jest.fn() }],
      cardLookup: lookupMap,
      broadcast: jest.fn(),
      chatHistory: [],
    };
  });

  describe("Ziel 1: ModifyNumbersHandler & Toughness <= 0 Discard", () => {
    test("Applies strength and toughness bonuses and recalculates battle numbers", () => {
      const hero = createCard({
        id: "hero_1",
        Name: "Mighty Warrior",
        Strength: "5",
        Toughness: "5",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(hero.id, hero);
      state.battlefield.push(hero);

      BattleService.onCardEnteredBattle(room, p1, hero, ZONES.BATTLEFIELD);
      expect(state.battle.rescuerStrength).toBe(5);
      expect(state.battle.rescuerToughness).toBe(5);

      const effect = {
        action: AST_ACTIONS.MODIFY_NUMBERS,
        strength_mod: 3,
        toughness_mod: 4,
        target: { selection_mode: "automatic_self" },
      };

      const result = ModifyNumbersHandler.execute({
        room,
        player: p1,
        effect,
        item: { cardId: hero.id },
      });

      expect(result.success).toBe(true);
      expect(hero.counters.get("strength_mod")).toBe(3);
      expect(hero.counters.get("toughness_mod")).toBe(4);

      const stats = BattleCalculator.getCardStats(hero);
      expect(stats.strength).toBe(8);
      expect(stats.toughness).toBe(9);

      // Battle state recalculated synchronously
      expect(state.battle.rescuerStrength).toBe(8);
      expect(state.battle.rescuerToughness).toBe(9);
    });

    test("Discards character when toughness drops to 0 or less (REG line 1815)", () => {
      const ec = createCard({
        id: "ec_1",
        Name: "Fragile Minion",
        Strength: "4",
        Toughness: "3",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(ec.id, ec);
      state.battlefield.push(ec);

      const effect = {
        action: AST_ACTIONS.DECREASE,
        strength_mod: 0,
        toughness_mod: -4,
        target: { selection_mode: "automatic_self" },
      };

      const result = ModifyNumbersHandler.execute({
        room,
        player: p2,
        effect,
        item: { cardId: ec.id },
      });

      expect(result.success).toBe(true);
      expect(ec.zone).toBe(ZONES.DISCARD);
      expect(p2[ZONES.DISCARD].some((c) => c.id === ec.id)).toBe(true);
    });
  });

  describe("Ziel 2: BandHandler & Banding Rules", () => {
    test("Bands matching hero from hand into battle with isBanded and bandedTo set", () => {
      const leader = createCard({
        id: "hero_leader",
        Name: "Captain",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const ally = createCard({
        id: "hero_ally",
        Name: "Faithful Soldier",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.HAND,
      });

      room.cardLookup.set(leader.id, leader);
      room.cardLookup.set(ally.id, ally);
      state.battlefield.push(leader);
      p1[ZONES.HAND].push(ally);

      const effect = {
        action: AST_ACTIONS.BAND,
        target: {
          selection_mode: "automatic_next",
          target_type: "character",
        },
      };

      const result = BandHandler.execute({
        room,
        player: p1,
        effect,
        item: { cardId: leader.id },
      });

      expect(result.success).toBe(true);
      const inBattleAlly = room.cardLookup.get(ally.id);
      expect(inBattleAlly.isBanded).toBe(true);
      expect(inBattleAlly.bandedTo).toBe(leader.id);
      expect(inBattleAlly.zone).toBe(ZONES.BATTLEFIELD);
      expect(state.battlefield.some((c) => c.id === ally.id)).toBe(true);
    });

    test("Bands allied character from opponent territory with temporary control and clean reset", () => {
      const leader = createCard({
        id: "hero_leader",
        Name: "King David",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const oppHero = createCard({
        id: "opp_hero",
        Name: "Allied Missionary",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.TERRITORY,
      });

      room.cardLookup.set(leader.id, leader);
      room.cardLookup.set(oppHero.id, oppHero);
      state.battlefield.push(leader);
      p2[ZONES.TERRITORY].push(oppHero);

      const result = BandHandler.execute({
        room,
        player: p1,
        effect: { action: AST_ACTIONS.BAND },
        item: { cardId: leader.id },
        options: { targetCardIds: [oppHero.id] },
      });

      expect(result.success).toBe(true);
      const inBattleCard = room.cardLookup.get(oppHero.id);
      expect(inBattleCard.controllerId).toBe("p1"); // Temporary control
      expect(inBattleCard.originalOwnerId).toBe("p2"); // Permanent owner unchanged
      expect(inBattleCard.isBanded).toBe(true);
      expect(inBattleCard.bandedTo).toBe(leader.id);

      // Battle resolution / phase change reverts temporary control
      BattleService.reset(room);
      expect(inBattleCard.controllerId).toBe("p2"); // Restored to permanent owner
      expect(inBattleCard.isBanded).toBe(false);
      expect(inBattleCard.bandedTo).toBe("");
    });

    test("Unclean Animals bands to another animal from hand using target_type: 'animal'", () => {
      const hero = createCard({
        id: "hero_attacker",
        Name: "David",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const leader = createCard({
        id: "unclean_leader",
        templateId: "425415957",
        Name: "Unclean Animals [Rock Hyrax]",
        Alignment: "Evil",
        Type: "Evil Character",
        IsCharacter: true,
        Identifier: "Generic, Animal",
        ORDIR: ["Animal", "Generic Character"],
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      const animalInHand = createCard({
        id: "bear_in_hand",
        templateId: "-1019462673",
        Name: "Bear (CoW AB)",
        Alignment: "Evil",
        Type: "Evil Character",
        IsCharacter: true,
        Identifier: "Animal, Genderless, Generic",
        ORDIR: ["Animal", "Gender", "Generic Character"],
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.HAND,
      });

      room.cardLookup.set(hero.id, hero);
      room.cardLookup.set(leader.id, leader);
      room.cardLookup.set(animalInHand.id, animalInHand);
      state.battlefield.push(hero);
      state.battlefield.push(leader);
      p2[ZONES.HAND].push(animalInHand);

      const effect = {
        action: AST_ACTIONS.BAND,
        target: {
          selection_mode: "manual_controller",
          zone_owner: "both",
          scope: ["in_play"],
          target_type: "animal",
          brigades: [],
          identifiers: [],
          card_titles: [],
          target_card_ids: [],
          count: { fixed_value: 1 },
        },
      };

      // 1. Initial execution without explicit options triggers target selection request
      const selectResult = BandHandler.execute({
        room,
        player: p2,
        effect,
        item: { cardId: leader.id },
      });

      expect(selectResult.success).toBe(true);
      expect(selectResult.awaitingTargetSelection).toBe(true);
      expect(selectResult.eligible.eligibleCardIds).toContain(animalInHand.id);

      // 2. Client submits selected animal -> banding succeeds
      const bandResult = BandHandler.execute({
        room,
        player: p2,
        effect,
        item: { cardId: leader.id },
        options: { targetCardIds: [animalInHand.id] },
      });

      expect(bandResult.success).toBe(true);
      const bandedBear = room.cardLookup.get(animalInHand.id);
      expect(bandedBear.isBanded).toBe(true);
      expect(bandedBear.bandedTo).toBe(leader.id);
      expect(bandedBear.zone).toBe(ZONES.BATTLEFIELD);
      expect(state.battlefield.some((c) => c.id === animalInHand.id)).toBe(true);
    });

    test("Banded character triggers battle entrance special ability into EffectChronicle", () => {
      const leader = createCard({
        id: "leader1",
        Name: "Captain",
        IsCharacter: true,
        Alignment: "Good",
        zone: ZONES.BATTLEFIELD,
        controllerId: "p1",
      });
      const bandedHero = createCard({
        id: "banded1",
        Name: "Hero with Ability",
        IsCharacter: true,
        Alignment: "Good",
        SpecialAbility: "Draw 2 cards.",
        zone: ZONES.HAND,
        controllerId: "p1",
        originalOwnerId: "p1",
      });
      room.cardLookup.set(leader.id, leader);
      room.cardLookup.set(bandedHero.id, bandedHero);
      state.battlefield.push(leader);
      p1[ZONES.HAND].push(bandedHero);

      // Simulate active chronicle (leader's band ability is currently resolving)
      const leaderItem = new ChronicleItem({
        id: "item_leader",
        cardId: leader.id,
        controllerId: "p1",
        actionType: "RESCUE_ATTEMPT",
        title: leader.Name,
        status: CHRONICLE_STATUS.RESOLVING,
      });
      state.effectChronicle.items.push(leaderItem);
      state.effectChronicle.isResolving = true;
      state.effectChronicle.priorityPlayerId = "p1";

      const result = BandHandler.execute({
        room,
        player: p1,
        effect: { action: AST_ACTIONS.BAND, target: { selection_mode: "manual_controller" } },
        item: { cardId: leader.id },
        options: { targetCardIds: [bandedHero.id] },
      });

      expect(result.success).toBe(true);
      const inBattleBanded = room.cardLookup.get(bandedHero.id);
      expect(inBattleBanded.zone).toBe(ZONES.BATTLEFIELD);
      expect(inBattleBanded.isBanded).toBe(true);
      expect(inBattleBanded.bandedTo).toBe(leader.id);

      // Verify that bandedHero's battle entry ability was enqueued into EffectChronicle
      expect(state.effectChronicle.items.length).toBe(2);
      expect(state.effectChronicle.items[1].cardId).toBe(bandedHero.id);
      expect(state.effectChronicle.items[1].title).toBe("Hero with Ability");
    });

    test("Resolves eligible targets matching character by card_titles (Samuel) and identifiers (Prophet)", () => {
      const eli = createCard({
        id: "eli_1",
        templateId: "-175529066",
        Name: "Eli the Priest (RoA)",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const samuel = createCard({
        id: "samuel_1",
        templateId: "-1708238440",
        Name: "Samuel, the Anointer [K]",
        Identifier: "Judge, Prophet",
        ORDIR: ["I Samuel Card", "Prophet"],
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });

      room.cardLookup.set(eli.id, eli);
      room.cardLookup.set(samuel.id, samuel);
      state.battlefield.push(eli);
      p1[ZONES.TERRITORY].push(samuel);

      // 1. Target by card title (Samuel)
      const titleTargetDef = {
        selection_mode: "manual_controller",
        zone_owner: "controller",
        scope: "territory",
        card_titles: ["Samuel"],
      };
      const titleEligible = TargetSelectionService.resolveEligibleTargets(room, p1, titleTargetDef, { sourceCard: eli });
      expect(titleEligible.eligibleCardIds).toContain(samuel.id);

      // 2. Target strictly by descriptor identifier (Prophet)
      const identTargetDef = {
        selection_mode: "manual_controller",
        zone_owner: "controller",
        scope: "territory",
        identifiers: ["Prophet"],
      };
      const identEligible = TargetSelectionService.resolveEligibleTargets(room, p1, identTargetDef, { sourceCard: eli });
      expect(identEligible.eligibleCardIds).toContain(samuel.id);

      // 3. Execution of BandHandler bands Samuel
      const result = BandHandler.execute({
        room,
        player: p1,
        effect: { action: AST_ACTIONS.BAND, target: titleTargetDef },
        item: { cardId: eli.id },
        options: { targetCardIds: [samuel.id] },
      });

      expect(result.success).toBe(true);
      const bandedSamuel = room.cardLookup.get(samuel.id);
      expect(bandedSamuel.isBanded).toBe(true);
      expect(bandedSamuel.bandedTo).toBe(eli.id);
      expect(bandedSamuel.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("resolves Samuel from hand as single-choice auto-band candidate and formats optional prompt", () => {
      const eli = createCard({
        id: "eli_hand_test",
        templateId: "-175529066",
        Name: "Eli the Priest (RoA)",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const samuelInHand = createCard({
        id: "samuel_in_hand",
        Name: "Samuel",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.HAND,
      });

      room.cardLookup.set(eli.id, eli);
      room.cardLookup.set(samuelInHand.id, samuelInHand);
      state.battlefield.push(eli);
      p1[ZONES.HAND].push(samuelInHand);

      const targetDef = {
        selection_mode: "manual_controller",
        zone_owner: "controller",
        scope: ["in_play", "hand"],
        card_titles: ["Samuel"],
      };

      // TargetSelectionService scans Hand and In Play according to normalized banding scope
      const eligible = TargetSelectionService.resolveEligibleTargets(
        room,
        p1,
        targetDef,
        { sourceCard: eli, actionType: AST_ACTIONS.BAND }
      );
      expect(eligible.eligibleCardIds).toContain(samuelInHand.id);
      expect(eligible.eligibleCardIds.length).toBe(1);

      // Verify prompt text formatting on AbilityResolver
      const { AbilityResolver } = require("../src/ast/AbilityResolver");
      const resolver = new AbilityResolver(room);
      const promptText = resolver._getOptionalPromptText(
        { action: AST_ACTIONS.BAND, target: targetDef },
        eli,
        { title: eli.Name }
      );
      expect(promptText).toBe("Band with Samuel?");

      // Test telegraph privacy: acting client receives hand preview, opponent does NOT
      const item = {
        id: "item_eli",
        cardId: eli.id,
        controllerId: "p1",
        title: eli.Name,
        abilityId: "ab_2_band",
      };
      const { AbilityLookup } = require("../src/ast/AbilityLookup");
      const origResolve = AbilityLookup.resolveAbilities;
      AbilityLookup.resolveAbilities = () => [
        {
          ability_id: "ab_2_band",
          is_optional: true,
          effects: [{ action: AST_ACTIONS.BAND, target: targetDef }],
        },
      ];

      try {
        resolver.resolve(item);
        const p1Telegraph = room.clients[0].send.mock.calls.find(
          (call) => call[0] === AST_MESSAGES.ACTION_TELEGRAPH
        );
        const p2Telegraph = room.clients[1].send.mock.calls.find(
          (call) => call[0] === AST_MESSAGES.ACTION_TELEGRAPH
        );
        expect(p1Telegraph).toBeDefined();
        expect(p1Telegraph[1].targetCardIds).toContain(samuelInHand.id);
        expect(p2Telegraph).toBeUndefined();

        // Even when candidate target is in public territory, opponent receives NO preview telegraph
        samuelInHand.zone = ZONES.TERRITORY;
        room.clients[0].send.mockClear();
        room.clients[1].send.mockClear();
        resolver.resolve(item);
        const p2TerritoryTelegraph = room.clients[1].send.mock.calls.find(
          (call) => call[0] === AST_MESSAGES.ACTION_TELEGRAPH
        );
        expect(p2TerritoryTelegraph).toBeUndefined();
      } finally {
        AbilityLookup.resolveAbilities = origResolve;
      }
    });

    test("BandingRule rejects unbanded additional characters into battle", () => {
      const leader = createCard({
        id: "hero_1",
        Name: "Hero 1",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      state.battlefield.push(leader);

      const hero2 = createCard({
        id: "hero_2",
        Name: "Hero 2",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.HAND,
      });

      const unbandedMove = BandingRule({
        card: hero2,
        toZone: ZONES.BATTLEFIELD,
        fromZone: ZONES.HAND,
        targetPlayerId: "p1",
        state,
        options: {},
      });
      expect(unbandedMove.valid).toBe(false);
      expect(unbandedMove.error).toBe("Additional characters in battle must be banded!");

      const bandedMove = BandingRule({
        card: hero2,
        toZone: ZONES.BATTLEFIELD,
        fromZone: ZONES.HAND,
        targetPlayerId: "p1",
        state,
        options: { isBanded: true },
      });
      expect(bandedMove.valid).toBe(true);
    });

    test("Multi-character sequential banding preserves player-chosen activation order in EffectChronicle", () => {
      const leader = createCard({
        id: "leader_multi",
        Name: "Band All Leader",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const heroA = createCard({
        id: "hero_a",
        Name: "First Hero",
        Alignment: "Good",
        IsCharacter: true,
        SpecialAbility: "Draw 1 card.",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      const heroB = createCard({
        id: "hero_b",
        Name: "Second Hero",
        Alignment: "Good",
        IsCharacter: true,
        SpecialAbility: "Draw 2 cards.",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.HAND,
      });

      room.cardLookup.set(leader.id, leader);
      room.cardLookup.set(heroA.id, heroA);
      room.cardLookup.set(heroB.id, heroB);
      state.battlefield.push(leader);
      p1[ZONES.TERRITORY].push(heroA);
      p1[ZONES.HAND].push(heroB);

      const leaderItem = new ChronicleItem({
        id: "item_leader_multi",
        cardId: leader.id,
        controllerId: "p1",
        actionType: "RESCUE_ATTEMPT",
        title: leader.Name,
        status: CHRONICLE_STATUS.RESOLVING,
      });
      state.effectChronicle.items.push(leaderItem);
      state.effectChronicle.isResolving = true;
      state.effectChronicle.priorityPlayerId = "p1";

      // Player selects heroB as #1 and heroA as #2
      const result = BandHandler.execute({
        room,
        player: p1,
        effect: {
          action: AST_ACTIONS.BAND,
          target: {
            selection_mode: "manual_controller",
            count: { min_value: 1, max_value: 99 },
          },
        },
        item: { cardId: leader.id },
        options: { targetCardIds: [heroB.id, heroA.id] },
      });

      expect(result.success).toBe(true);
      expect(result.snapshot.bandedCards.map((r) => r.bandedCardId)).toEqual([heroB.id, heroA.id]);
      expect(state.effectChronicle.items.length).toBe(3);
      expect(state.effectChronicle.items[1].cardId).toBe(heroB.id);
      expect(state.effectChronicle.items[2].cardId).toBe(heroA.id);
    });

    test("Fallback banding for non-AST cards requests interactive target selection and bands selected characters in order", () => {
      const { AbilityResolver } = require("../src/ast/AbilityResolver");
      const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
      const { EffectChronicleService } = require("../src/services/EffectChronicleService");

      room.abilityResolver = new AbilityResolver(room);
      room.broadcastGameLog = jest.fn();

      const nonAstLeader = createCard({
        id: "non_ast_leader",
        templateId: "unmodeled_template_999999",
        Name: "Unmodeled Banding Hero",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        SpecialAbility: "May band to up to 2 Heroes in play or hand.",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const target1 = createCard({
        id: "target_hero_1",
        Name: "Target Hero 1",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        SpecialAbility: "May draw 1 card.",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      const target2 = createCard({
        id: "target_hero_2",
        Name: "Target Hero 2",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        SpecialAbility: "May draw 2 cards.",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.HAND,
      });

      room.cardLookup.set(nonAstLeader.id, nonAstLeader);
      room.cardLookup.set(target1.id, target1);
      room.cardLookup.set(target2.id, target2);
      state.battlefield.push(nonAstLeader);
      p1[ZONES.TERRITORY].push(target1);
      p1[ZONES.HAND].push(target2);

      EffectChronicleService.enqueueCards(room, [nonAstLeader], "p1", ActionType.RESCUE_ATTEMPT, {
        isOptional: true,
      });
      const item = state.effectChronicle.items[0];

      // 1. Player clicks "Activate" in optional ability prompt (accepted: true)
      const resolveAfterAccept = room.abilityResolver.resolve(item, { accepted: true });
      expect(resolveAfterAccept.handled).toBe(true);
      expect(resolveAfterAccept.awaitingTargetSelection).toBe(true);
      expect(resolveAfterAccept.eligible.eligibleCardIds).toEqual(
        expect.arrayContaining([target1.id, target2.id])
      );

      // 2. Player clicks target2 (badge 1) then target1 (badge 2) and confirms
      const cmd = new SelectTargetCommand(room, room.clients[0]);
      cmd.execute({
        itemId: item.id,
        abilityId: "fallback_band",
        selectedCardIds: [target2.id, target1.id],
      });

      expect(room.cardLookup.get(target2.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(room.cardLookup.get(target2.id).isBanded).toBe(true);
      expect(room.cardLookup.get(target1.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(room.cardLookup.get(target1.id).isBanded).toBe(true);

      // Both banded heroes have their entrance abilities queued in exact order [target2, target1]
      expect(state.effectChronicle.items.map((i) => i.cardId)).toEqual([target2.id, target1.id]);
    });

    test("Fallback banding treats singular 'May band to a ... or you may draw 2' (The Tribal Elders) as fixed_value: 1", () => {
      const { AbilityResolver } = require("../src/ast/AbilityResolver");
      const tribalElders = createCard({
        id: "tribal_elders_1",
        templateId: "-696815277",
        Name: "The Tribal Elders [L]",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        SpecialAbility: "May band to a white Exodus Hero, or you may draw 2.",
      });

      const fallback = AbilityResolver.getFallbackBandAbility(tribalElders);
      expect(fallback).not.toBeNull();
      expect(fallback.effects[0].target.count).toEqual({ fixed_value: 1 });
    });

    test("Returning a character from battlefield to territory clears isBanded and blocks re-entering battle manually", () => {
      const { moveCard } = require("../src/services/cardService");

      const hero = createCard({
        id: "hero_return_test",
        Name: "Returning Hero",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      room.cardLookup.set(hero.id, hero);
      p1[ZONES.TERRITORY].push(hero);

      // 1. Initial rescue attempt succeeds and sets rescueAttemptOccurred = true
      const enterRes = moveCard(p1, state, room.cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, hero.id);
      expect(enterRes.error).toBeUndefined();
      const inBattleHero = room.cardLookup.get(hero.id);
      inBattleHero.isBanded = true;
      BattleService.onCardEnteredBattle(room, p1, inBattleHero, ZONES.BATTLEFIELD);
      expect(state.battle.rescueAttemptOccurred).toBe(true);

      // 2. Move hero back to territory -> clears isBanded, keeps rescueAttemptOccurred = true
      const returnRes = moveCard(p1, state, room.cardLookup, ZONES.BATTLEFIELD, ZONES.TERRITORY, inBattleHero.id);
      expect(returnRes.error).toBeUndefined();
      const returnedHero = room.cardLookup.get(hero.id);
      expect(returnedHero.isBanded).toBe(false);
      BattleService.recalculate(room);
      expect(state.battle.rescueAttemptOccurred).toBe(true);

      // 3. Attempting to manually drag the hero back into battle without a band effect is rejected
      state.battle.initiativePlayerId = "p1";
      const reEnterRes = moveCard(p1, state, room.cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, returnedHero.id);
      expect(reEnterRes.error).toBe("Additional characters in battle must be banded!");
    });

    test("Orphaned enhancements in battle are immediately discarded when no character with matching brigade remains", () => {
      const { moveCard } = require("../src/services/cardService");

      const redHero = createCard({
        id: "red_hero",
        Name: "David",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        Brigades: ["Red"],
        Strength: "5",
        Toughness: "5",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const whiteHero = createCard({
        id: "white_hero",
        Name: "Samuel",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        Brigades: ["White"],
        Strength: "4",
        Toughness: "4",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const redEnh = createCard({
        id: "red_enh",
        Name: "Bravery of David",
        Alignment: "Good",
        Type: "GE",
        IsEnhancement: true,
        Brigades: ["Red"],
        Strength: "3",
        Toughness: "3",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const whiteEnh = createCard({
        id: "white_enh",
        Name: "Prayer",
        Alignment: "Good",
        Type: "GE",
        IsEnhancement: true,
        Brigades: ["White"],
        Strength: "2",
        Toughness: "2",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(redHero.id, redHero);
      room.cardLookup.set(whiteHero.id, whiteHero);
      room.cardLookup.set(redEnh.id, redEnh);
      room.cardLookup.set(whiteEnh.id, whiteEnh);
      state.battlefield.push(redHero, whiteHero, redEnh, whiteEnh);

      BattleService.recalculate(room);
      expect(state.battle.rescuerStrength).toBe(14); // 5 + 4 + 3 + 2

      // Discard Red Hero -> Red Enhancement becomes orphaned and is automatically discarded, White Enhancement stays
      moveCard(p1, state, room.cardLookup, ZONES.BATTLEFIELD, ZONES.DISCARD, redHero.id);
      BattleService.recalculate(room);

      expect(room.cardLookup.get(redEnh.id).zone).toBe(ZONES.DISCARD);
      expect(p1[ZONES.DISCARD].some((c) => c.id === redEnh.id)).toBe(true);
      expect(room.cardLookup.get(whiteEnh.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(state.battle.rescuerStrength).toBe(6); // 4 (whiteHero) + 2 (whiteEnh)
    });

    test("BattleService.reset discards non-weapon enhancements and returns surviving characters with attached weapons to territory", () => {
      const hero = createCard({
        id: "surviving_hero",
        Name: "Uriah",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        Brigades: ["Red"],
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const weaponEnh = createCard({
        id: "attached_sword",
        Name: "Sword of the Spirit",
        Alignment: "Good",
        Type: "GE",
        IsEnhancement: true,
        Class: "Weapon",
        Brigades: ["Red"],
        attachedTo: "surviving_hero",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const normalEnh = createCard({
        id: "normal_ge",
        Name: "Zeal",
        Alignment: "Good",
        Type: "GE",
        IsEnhancement: true,
        Brigades: ["Red"],
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(hero.id, hero);
      room.cardLookup.set(weaponEnh.id, weaponEnh);
      room.cardLookup.set(normalEnh.id, normalEnh);
      state.battlefield.push(hero, weaponEnh, normalEnh);

      BattleService.reset(room);

      expect(state.battlefield.length).toBe(0);
      expect(room.cardLookup.get(hero.id).zone).toBe(ZONES.TERRITORY);
      expect(room.cardLookup.get(weaponEnh.id).zone).toBe(ZONES.TERRITORY);
      expect(room.cardLookup.get(weaponEnh.id).attachedTo).toBe(hero.id);
      expect(room.cardLookup.get(normalEnh.id).zone).toBe(ZONES.DISCARD);
    });
  });

  describe("Ziel 3: Immunity, Protect & REG Harm Logic", () => {
    test("Protection from Harm blocks opposite alignment targeting", () => {
      const goodHero = createCard({
        id: "hero_harm",
        Name: "Holy Priest",
        Alignment: "Good",
        controllerId: "p1",
        isProtected: true,
        protectionReason: "harm",
      });
      const evilSource = createCard({
        id: "evil_source",
        Name: "Demon Lord",
        Alignment: "Evil",
        controllerId: "p2",
      });
      const friendlySource = createCard({
        id: "good_source",
        Name: "Saint",
        Alignment: "Good",
        controllerId: "p1",
      });

      expect(ProtectionService.isHarmful(goodHero, evilSource)).toBe(true);
      expect(ProtectionService.isProtected(goodHero, evilSource)).toBe(true);

      // Friendly interactions of same alignment are NOT harmful
      expect(ProtectionService.isHarmful(goodHero, friendlySource)).toBe(false);
      expect(ProtectionService.isProtected(goodHero, friendlySource)).toBe(false);
    });

    test("Opposing character strength is treated as 0 against immune target (REG line 1733)", () => {
      const rescuerHero = createCard({
        id: "hero_imm",
        Name: "Archangel Michael",
        Strength: "6",
        Toughness: "6",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
        isImmune: true,
        protectionReason: "evil",
      });

      const blockerEC = createCard({
        id: "ec_strong",
        Name: "Goliath",
        Strength: "12",
        Toughness: "4",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(rescuerHero.id, rescuerHero);
      room.cardLookup.set(blockerEC.id, blockerEC);
      state.battlefield.push(rescuerHero);
      state.battlefield.push(blockerEC);

      const evaluation = BattleCalculator.evaluateBattle({
        battlefield: [rescuerHero, blockerEC],
        activePlayerId: "p1",
        defenderPlayerId: "p2",
        lastBattleCardPlayerId: "p2",
        currentPhase: PHASES.BATTLE,
      });

      // Goliath has 12 strength, but Michael is immune! Goliath's effective strength is 0.
      // Michael has 6 strength >= Goliath's 4 toughness -> Michael defeats Goliath.
      // Goliath (0 strength) < Michael's 6 toughness -> Goliath does not defeat Michael.
      // Blocker is losing by numbers! Blocker receives initiative.
      expect(evaluation.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
      expect(evaluation.initiativePlayerId).toBe("p2");
    });

    test("Job protects from discard ability in battle and avoids Special Initiative prompt", () => {
      // 1. Create Job with templateId: "199100320" on battlefield
      const job = createCard({
        id: "c_job",
        templateId: "199100320",
        Name: "Job",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(job.id, job);
      state.battlefield.push(job);

      // Verify battle entry trigger finds and returns Job's static protect ability
      const entryAbility = BattleTriggerService.findBattleEntryAstAbility(
        room,
        p1,
        job,
        ActionType.RESCUE_ATTEMPT
      );
      expect(entryAbility).toBeDefined();
      expect(["protect_job_discard_capture", "ab_1_protect"]).toContain(entryAbility.ability_id);

      // Execute Job's protect ability
      const execResult = ImmunityHandler.execute({
        room,
        player: p1,
        effect: entryAbility.effects[0],
        item: { cardId: job.id },
      });
      expect(execResult.success).toBe(true);
      expect(job.isProtected).toBe(true);
      expect(job._protection.actions).toContain("discard");
      expect(job._protection.actions).toContain("capture");

      // 2. Opponent plays Evil Enhancement that attempts to discard all heroes in battle
      const evilEnh = createCard({
        id: "ee_discard_all",
        Name: "Dark Wrath",
        Alignment: "Evil",
        IsEnhancement: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(evilEnh.id, evilEnh);
      state.battlefield.push(evilEnh);

      const discardEffect = {
        action: "discard",
        target: {
          selection_mode: "automatic_all",
          zone_owner: "opponent",
          scope: "battle",
          target_type: "hero",
        },
      };

      const discardResult = DiscardHandler.execute({
        room,
        player: p2,
        effect: discardEffect,
        item: { cardId: evilEnh.id },
      });

      // Job must be protected: not discarded, and no Special Initiative triggered
      expect(discardResult.success).toBe(true);
      expect(discardResult.awaitingSpecialInitiative).toBeFalsy();
      expect(discardResult.snapshot.discardedCards.length).toBe(0);
      expect(state.battlefield.some((c) => c.id === job.id)).toBe(true);
      expect(p1.discard.length).toBe(0);
    });

    test("Decrease reducing all opponent blockers to <= 0 toughness triggers Special Initiative", () => {
      // Setup hero rescuer
      const hero = createCard({
        id: "hero_rescuer",
        Name: "Faithful Hero",
        Strength: "10",
        Toughness: "10",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });

      // Setup 2 blockers for opponent p2 with toughness <= 6
      const ec1 = createCard({
        id: "ec_hyrax",
        Name: "Unclean Animals [Rock Hyrax]",
        Strength: "4",
        Toughness: "4",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });

      const ec2 = createCard({
        id: "ec_lion",
        Name: "Coliseum Lion",
        Strength: "6",
        Toughness: "6",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(hero.id, hero);
      room.cardLookup.set(ec1.id, ec1);
      room.cardLookup.set(ec2.id, ec2);
      state.battlefield.push(hero);
      state.battlefield.push(ec1);
      state.battlefield.push(ec2);

      const goodEnh = createCard({
        id: "ge_bowl",
        Name: "First Bowl of Wrath (RoJ)",
        Alignment: "Good",
        IsEnhancement: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(goodEnh.id, goodEnh);
      state.battlefield.push(goodEnh);

      const decreaseEffect = {
        action: "decrease",
        strength_mod: -6,
        toughness_mod: -6,
        target: {
          selection_mode: "automatic_all",
          zone_owner: "opponent",
          scope: "battle",
          target_type: "evil_character",
        },
      };

      const result = ModifyNumbersHandler.execute({
        room,
        player: p1,
        effect: decreaseEffect,
        item: { id: "item_bowl", cardId: goodEnh.id },
      });

      // Special Initiative MUST trigger because all opponent characters in battle are reduced to <= 0 toughness
      expect(result.success).toBe(true);
      expect(result.awaitingSpecialInitiative).toBe(true);
      expect(result.targetCards.length).toBe(2);
      expect(result.targetOwner.sessionId).toBe("p2");
      expect(state.battle.specialInitiativePlayerId).toBe("p2");

      // Non-modal Special Initiative: no modal REQUEST_OPTIONAL_ABILITY popup is sent
      const p2Client = room.clients.find((c) => c.sessionId === "p2");
      expect(p2Client.send).not.toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.anything()
      );

      // Defending cards must NOT be discarded yet (they stay in battle awaiting Special Initiative decision)
      expect(state.battlefield.some((c) => c.id === ec1.id)).toBe(true);
      expect(state.battlefield.some((c) => c.id === ec2.id)).toBe(true);
      expect(p2.discard.length).toBe(0);

      // Now simulate defending player passing Special Initiative:
      room.broadcast.mockClear();
      const declineResult = ModifyNumbersHandler.execute({
        room,
        player: p1,
        effect: decreaseEffect,
        item: { id: "item_bowl", cardId: goodEnh.id },
        options: { specialInitiativeDeclined: true },
      });

      expect(declineResult.success).toBe(true);
      expect(room.broadcast).toHaveBeenCalledWith(
        AST_MESSAGES.ACTION_TELEGRAPH,
        expect.objectContaining({
          sourceCardId: goodEnh.id,
          targetCardIds: expect.arrayContaining([ec1.id, ec2.id]),
          action: AST_ACTIONS.DISCARD,
        })
      );
      expect(p2.discard.length).toBe(2);
      expect(state.battlefield.some((c) => c.id === ec1.id)).toBe(false);
      expect(state.battlefield.some((c) => c.id === ec2.id)).toBe(false);
    });

    test("PassInitiativeCommand passes normal initiative to opponent and resets when a card enters battle", () => {
      const { PassInitiativeCommand } = require("../src/commands/PassInitiativeCommand");

      const hero = createCard({
        id: "hero_pass_test",
        Name: "Strong Hero",
        Strength: "10",
        Toughness: "10",
        Alignment: "Good",
        Type: "Hero",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      const ec = createCard({
        id: "ec_pass_test",
        Name: "Weak Blocker",
        Strength: "4",
        Toughness: "4",
        Alignment: "Evil",
        Type: "Evil Character",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });

      room.cardLookup.set(hero.id, hero);
      room.cardLookup.set(ec.id, ec);
      state.battlefield.push(hero, ec);
      BattleService.recalculate(room);

      // p2 is losing by numbers (10/10 vs 4/4) -> p2 holds initiative
      expect(state.battle.initiativePlayerId).toBe("p2");

      // p2 clicks Pass on BattleHUD -> initiative transfers to p1
      const p2Client = room.clients.find((c) => c.sessionId === "p2");
      const passCmd = new PassInitiativeCommand(room, p2Client);
      passCmd.execute();
      expect(state.battle.initiativePlayerId).toBe("p1");

      // When p1 plays a card in battle, override resets and initiative recalculates by numbers back to p2
      const enh = createCard({
        id: "enh_pass_test",
        Name: "Heroic Boost",
        Strength: "2",
        Toughness: "2",
        Alignment: "Good",
        Type: "GE",
        Brigade: "White",
        IsEnhancement: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      hero.Brigade = "White";
      room.cardLookup.set(enh.id, enh);
      state.battlefield.push(enh);
      BattleService.onCardEnteredBattle(room, p1, enh, ZONES.BATTLEFIELD);

      expect(state.battle.initiativeOverridePlayerId).toBe("");
      expect(state.battle.initiativePlayerId).toBe("p2");
    });
  });
});
