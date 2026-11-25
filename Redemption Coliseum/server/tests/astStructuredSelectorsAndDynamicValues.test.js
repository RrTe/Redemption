// server/tests/astStructuredSelectorsAndDynamicValues.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardRepository } = require("../../shared/CardRepository");
const { cardDatabase } = require("../src/data/cardDatabase");
const { normalizeCard } = require("../../shared/utils");
const { SideAttributeEvaluator } = require("../../shared/rules/SideAttributeEvaluator");
const { ProtectionService } = require("../../shared/rules/ProtectionService");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { parseTargetCount } = require("../src/ast/TargetCountResolver");
const { ModifyNumbersHandler } = require("../src/ast/handlers/ModifyNumbersHandler");
const { EffectMutationReverser } = require("../src/ast/EffectMutationReverser");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { BattleCharacterClassifier } = require("../src/services/BattleCharacterClassifier");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { BattleCalculator } = require("../../shared/BattleCalculator");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { ActionType } = require("../../shared/actions");
const {
  AST_ACTIONS,
  AST_MESSAGES,
  AST_DIRECTIONAL_FILTER_ACTIONS,
  AST_SELECTION_MODES,
  AST_STAT_MOD_OPERATIONS,
  AST_DYNAMIC_VALUE_SOURCES,
} = require("../../shared/astConstants");

describe("REG v11.1.0 & ORDIR v7.1.0 Structured Selectors, Dynamic Values & Typed Triggers", () => {
  let room;
  let state;
  let p1;
  let p2;
  let registeredIds;

  beforeAll(() => {
    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
  });

  beforeEach(() => {
    registeredIds = [];
    state = new RoomState();
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    room = {
      state,
      cardLookup: new Map(),
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
      clients: [{ sessionId: "p1", send: jest.fn() }, { sessionId: "p2", send: jest.fn() }],
    };
  });

  afterEach(() => {
    const logicMap = AbilityLookup._loadData();
    for (const id of registeredIds) delete logicMap[id];
  });

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
    if (zone === ZONES.BATTLEFIELD) state.battlefield.push(card);
    else state.players.get(ownerId)?.[zone]?.push(card);
    return card;
  }

  describe("1. Directional Stat Protection, Dynamic Modify Stats & Rollback", () => {
    test("ProtectionService respects directional decrease/increase predicates without blocking opposite direction", () => {
      const src = createCard("src", "9001", "Attacker", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      const decProt = createCard("t_dec", "9002", "Protected Decrease", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        isProtected: true,
        _protection: { actions: [AST_DIRECTIONAL_FILTER_ACTIONS.DECREASE], card_sources: [] },
      });
      const incProt = createCard("t_inc", "9003", "Protected Increase", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        isProtected: true,
        _protection: { actions: [AST_DIRECTIONAL_FILTER_ACTIONS.INCREASE], card_sources: [] },
      });

      expect(ProtectionService.isProtected(decProt, src, AST_ACTIONS.MODIFY_STATS, { strengthDelta: -2, toughnessDelta: -2 })).toBe(true);
      expect(ProtectionService.isProtected(decProt, src, AST_ACTIONS.MODIFY_STATS, { strengthDelta: 2, toughnessDelta: 2 })).toBe(false);
      expect(ProtectionService.isProtected(incProt, src, AST_ACTIONS.MODIFY_STATS, { strengthDelta: 2, toughnessDelta: 2 })).toBe(true);
      expect(ProtectionService.isProtected(incProt, src, AST_ACTIONS.MODIFY_STATS, { strengthDelta: -2, toughnessDelta: -2 })).toBe(false);
    });

    test("ModifyNumbersHandler resolves count_cards, count_brigades, multiply, set, limit, directional skip & Undo", () => {
      const oppSrc = createCard("ec_src", "9010", "Caster", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", Strength: "5", Toughness: "5", IsCharacter: true });
      const heroProt = createCard("h_prot", "9011", "Protected Hero", ZONES.TERRITORY, "p1", {
        Type: "Hero", Alignment: "Good", Brigade: "Blue", Strength: "4", Toughness: "4", IsCharacter: true,
        isProtected: true, _protection: { actions: [AST_DIRECTIONAL_FILTER_ACTIONS.DECREASE], card_sources: [] },
      });
      const heroOpen = createCard("h_open", "9012", "Open Hero", ZONES.TERRITORY, "p1", {
        Type: "Hero", Alignment: "Good", Brigade: "Red/Silver", Strength: "6", Toughness: "6", IsCharacter: true,
      });
      const targetEnemy = createCard("ec_open", "9013", "Tank EC", ZONES.TERRITORY, "p2", {
        Type: "Evil Character", Alignment: "Evil", Strength: "8", Toughness: "8", IsCharacter: true,
      });

      // Dynamic count_cards with limit: 1 & negative multiplier: -1 => capped at -1/-1; skips heroProt due to directional guard
      const dynDecrease = ModifyNumbersHandler.execute({
        room,
        player: p2,
        item: { id: "i1", cardId: oppSrc.id },
        effect: {
          action: AST_ACTIONS.MODIFY_STATS,
          strength_mod: { dynamic: { source: AST_DYNAMIC_VALUE_SOURCES.COUNT_CARDS, operation: AST_STAT_MOD_OPERATIONS.ADD, multiplier: -1, limit: 1, scope: ["territory"], zone_owner: "opponent", target_type: "hero" } },
          toughness_mod: { dynamic: { source: AST_DYNAMIC_VALUE_SOURCES.COUNT_CARDS, operation: AST_STAT_MOD_OPERATIONS.ADD, multiplier: -1, limit: 1, scope: ["territory"], zone_owner: "opponent", target_type: "hero" } },
          target: { selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL, zone_owner: "opponent", scope: ["territory"], target_type: "hero" },
        },
      });
      expect(dynDecrease.success).toBe(true);
      expect(BattleCalculator.getCardStats(heroProt)).toEqual({ strength: 4, toughness: 4 });
      expect(BattleCalculator.getCardStats(heroOpen)).toEqual({ strength: 5, toughness: 5 });

      // Reversible rollback restores open Hero to 6/6
      EffectMutationReverser.revertSnapshot(room, dynDecrease.snapshot, p2);
      expect(BattleCalculator.getCardStats(heroOpen)).toEqual({ strength: 6, toughness: 6 });

      // count_brigades (+3 for Blue, Red, Silver across p1 territory)
      ModifyNumbersHandler.execute({
        room,
        player: p1,
        item: { id: "i2", cardId: heroOpen.id },
        effect: {
          action: AST_ACTIONS.MODIFY_STATS,
          strength_mod: { dynamic: { source: AST_DYNAMIC_VALUE_SOURCES.COUNT_BRIGADES, operation: AST_STAT_MOD_OPERATIONS.ADD, multiplier: 1, selector: { zone_owner: "controller", scope: ["territory"] } } },
          toughness_mod: 0,
          target: { selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF },
        },
      });
      expect(BattleCalculator.getCardStats(heroOpen).strength).toBe(9);

      // multiply x2 on targetEnemy (8 -> 16) then set fixed_value: 3
      ModifyNumbersHandler.execute({
        room, player: p2, item: { id: "i3", cardId: oppSrc.id },
        options: { targetCardIds: [targetEnemy.id] },
        effect: { action: AST_ACTIONS.MODIFY_STATS, strength_mod: { dynamic: { operation: AST_STAT_MOD_OPERATIONS.MULTIPLY, multiplier: 2 } }, toughness_mod: 0, target: {} },
      });
      expect(BattleCalculator.getCardStats(targetEnemy).strength).toBe(16);
      ModifyNumbersHandler.execute({
        room, player: p2, item: { id: "i4", cardId: oppSrc.id },
        options: { targetCardIds: [targetEnemy.id] },
        effect: { action: AST_ACTIONS.MODIFY_STATS, strength_mod: { dynamic: { operation: AST_STAT_MOD_OPERATIONS.SET, fixed_value: 3 } }, toughness_mod: { dynamic: { operation: AST_STAT_MOD_OPERATIONS.SET, fixed_value: 1 } }, target: {} },
      });
      expect(BattleCalculator.getCardStats(targetEnemy)).toEqual({ strength: 3, toughness: 1 });
    });
  });

  describe("2. Dynamic Count ('all but one') & Group Booleans", () => {
    test("parseTargetCount and TargetSelectionService resolve 'all but one' count.dynamic accurately", () => {
      createCard("d1", "9021", "Target 1", ZONES.TERRITORY, "p2", { Type: "Evil Character", Alignment: "Evil" });
      createCard("d2", "9022", "Target 2", ZONES.TERRITORY, "p2", { Type: "Evil Character", Alignment: "Evil" });
      createCard("d3", "9023", "Target 3", ZONES.TERRITORY, "p2", { Type: "Evil Character", Alignment: "Evil" });
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
        zone_owner: "opponent",
        scope: ["territory"],
        target_type: "evil_character",
        count: { dynamic: { source: AST_DYNAMIC_VALUE_SOURCES.COUNT_CARDS, operation: AST_STAT_MOD_OPERATIONS.ADD, multiplier: 1, offset: -1 } },
      };
      const countMeta = parseTargetCount(targetDef, undefined, { eligibleCount: 3 });
      expect(countMeta).toMatchObject({ isAll: false, hasDynamic: true, count: 2 });

      const eligible = TargetSelectionService.resolveEligibleTargets(room, p1, targetDef, { actionType: AST_ACTIONS.DISCARD });
      expect(eligible).toMatchObject({ eligibleCardIds: ["d1", "d2", "d3"], minTargets: 2, maxTargets: 2 });
    });

    test("IsCloud, IsMeek (Herod's Temple (G) Site), is_star and is_gospel resolve across utils, SideAttributeEvaluator, TargetSelectionService & ProtectionService", () => {
      const herodsTemple = CardRepository.getById("691417922");
      expect(herodsTemple).toBeDefined();
      expect(normalizeCard(herodsTemple).IsMeek).toBe(true);
      expect(SideAttributeEvaluator.matchesIsMeek(herodsTemple, true)).toBe(true);
      expect(TargetSelectionService.matchesFilter(createCard("ht", "691417922", "Herod's Temple (G)", ZONES.TERRITORY, "p1", { Type: "Site", Alignment: "Neutral" }), { is_meek: true })).toBe(true);

      const cloud = createCard("c_cloud", "9031", "Cloud Card", ZONES.TERRITORY, "p1", { IsCloud: true, Type: "Hero", Alignment: "Good" });
      const star = createCard("c_star", "9032", "Star Hero", ZONES.TERRITORY, "p1", { IsStarCard: true, Type: "Hero", Alignment: "Good" });
      const gospel = createCard("c_gospel", "9033", "Gospel Hero", ZONES.TERRITORY, "p1", { IsGospel: true, Type: "Hero", Alignment: "Good" });

      expect(normalizeCard({ id: "nc", Name: "Cloud", Type: "Hero", CardSides: { top: { Type: "Hero", IsCloud: true } } }).IsCloud).toBe(true);
      expect(SideAttributeEvaluator.matchesIsCloud(cloud, true)).toBe(true);
      expect(SideAttributeEvaluator.matchesIsStar(star, true)).toBe(true);
      expect(SideAttributeEvaluator.matchesIsGospel(gospel, true)).toBe(true);
      expect(TargetSelectionService.matchesFilter(cloud, { is_cloud: true })).toBe(true);
      expect(TargetSelectionService.matchesFilter(star, { is_star: true })).toBe(true);
      expect(TargetSelectionService.matchesFilter(gospel, { is_gospel: true })).toBe(true);
      expect(ProtectionService.matchesSource(cloud, { is_cloud: true })).toBe(true);
      expect(ProtectionService.matchesSource(gospel, { is_gospel: true })).toBe(true);
    });
  });

  describe("3. Structured Selectors (any_of, exclude, state_filters, relative_filters, used_by & ability meta)", () => {
    test("Cross-zone any_of, exclude_self and recursive exclude enforce exact branch scopes", () => {
      const storehouse = createCard("t_sh", "9041", "Storehouse", ZONES.TERRITORY, "p1", { Type: "Artifact", Identifier: "Storehouse" });
      const terrEc = createCard("t_ec", "9042", "Territory EC", ZONES.TERRITORY, "p1", { Type: "Evil Character", Alignment: "Evil" });
      const deckEc = createCard("dk_ec", "9043", "Deck EC", ZONES.DECK, "p1", { Type: "Evil Character", Alignment: "Evil" });

      const crossZoneRes = TargetSelectionService.resolveEligibleTargets(room, p1, {
        zone_owner: "controller",
        any_of: [
          { scope: ["territory"], identifiers: ["Storehouse"] },
          { scope: ["deck"], target_type: "evil_character" },
        ],
      });
      expect(crossZoneRes.eligibleCardIds).toEqual(expect.arrayContaining([storehouse.id, deckEc.id]));
      expect(crossZoneRes.eligibleCardIds).not.toContain(terrEc.id);

      expect(TargetSelectionService.matchesFilter(storehouse, { exclude_self: true }, { sourceCard: storehouse })).toBe(false);
      expect(TargetSelectionService.matchesFilter(deckEc, { exclude_self: true }, { sourceCard: storehouse })).toBe(true);
      expect(TargetSelectionService.matchesFilter(terrEc, { target_type: "evil_character", exclude: { card_titles: ["Territory EC"] } })).toBe(false);
    });

    test("state_filters evaluates ArraySchema battlefield states, occupied sites, attachments and brigades", () => {
      const atkLone = createCard("bf_h1", "9051", "Lone Attacker", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", Brigade: "Gold", IsCharacter: true });
      const blocker1 = createCard("bf_e1", "9052", "Blocker One", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", Brigade: "Black/Gray", IsCharacter: true });
      const blocker2 = createCard("bf_e2", "9053", "Blocker Two", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", Brigade: "Crimson", IsCharacter: true });
      const enhOnAtk = createCard("bf_ge", "9054", "Attached Weapon", ZONES.BATTLEFIELD, "p1", { Type: "GE", Alignment: "Good", IsEnhancement: true, attachedTo: atkLone.id });
      const siteEmpty = createCard("s_empty", "9055", "Empty Site", ZONES.TERRITORY, "p1", { Type: "Site" });
      const siteOccupied = createCard("s_occ", "9056", "Occupied Site", ZONES.TERRITORY, "p1", { Type: "Site", ORDIR: ["Occupied"] });

      expect(TargetSelectionService.matchesFilter(atkLone, { state_filters: ["lone", "attacking", "single_brigade"] }, { room })).toBe(true);
      expect(TargetSelectionService.matchesFilter(blocker1, { state_filters: ["blocking", "multi_brigade"] }, { room })).toBe(true);
      expect(TargetSelectionService.matchesFilter(blocker1, { state_filters: ["lone"] }, { room })).toBe(false);
      expect(TargetSelectionService.matchesFilter(enhOnAtk, { state_filters: ["attached_to_self"] }, { room, sourceCard: atkLone })).toBe(true);
      expect(TargetSelectionService.matchesFilter(siteOccupied, { state_filters: ["occupied"] }, { room })).toBe(true);
      expect(TargetSelectionService.matchesFilter(siteEmpty, { state_filters: ["unoccupied"] }, { room })).toBe(true);
      expect(TargetSelectionService.matchesFilter(blocker2, { used_by: "opponent" }, { room, actingPlayer: p1 })).toBe(true);
    });

    test("relative_filters, used_by holder object, and ability meta filters match accurately", () => {
      const actor = createCard("r_actor", "9061", "Actor Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero", Alignment: "Good", Brigade: "Gold", Strength: "5", Gender: "male", Reference: "Romans 1:16", ORDIR: ["Corinth Church"], IsCharacter: true,
      });
      const candidate = createCard("r_cand", "9062", "Female Evil Multi", ZONES.BATTLEFIELD, "p2", {
        Type: "Evil Character", Alignment: "Evil", Brigade: "Gold", Strength: "7", Gender: "female", Reference: "Romans 8:1", ORDIR: ["Corinth Church"], IsCharacter: true,
      });
      const enhUsed = createCard("r_enh", "9063", "Held GE", ZONES.BATTLEFIELD, "p1", { Type: "GE", attachedTo: actor.id });

      expect(TargetSelectionService.matchesFilter(candidate, {
        relative_filters: [
          { attribute: "brigade", relation: "same", reference: "actor" },
          { attribute: "alignment", relation: "opposite", reference: "self" },
          { attribute: "gender", relation: "opposite", reference: "chained_target" },
          { attribute: "strength", relation: ">", reference: "actor" },
          { attribute: "book", relation: "same", reference: "self" },
          { attribute: "church", relation: "same", reference: "self" },
        ],
      }, { room, sourceCard: actor, actorCard: actor, chainedTargetCard: actor })).toBe(true);
      expect(TargetSelectionService.matchesFilter(enhUsed, { used_by: "self" }, { room, sourceCard: actor })).toBe(true);
      expect(TargetSelectionService.matchesFilter(enhUsed, { used_by: { target_type: "hero", brigades: ["Gold"] } }, { room })).toBe(true);

      const logicMap = AbilityLookup._loadData();
      registeredIds.push("t_band_card", "t_draw_card", "t_vanilla_card");
      logicMap.t_band_card = { sides: { top: { abilities: [{ ability_id: "b1", effects: [{ action: AST_ACTIONS.BAND }] }] } } };
      logicMap.t_draw_card = { sides: { top: { abilities: [{ ability_id: "d1", effects: [{ action: AST_ACTIONS.DRAW }] }] } } };
      logicMap.t_vanilla_card = { sides: { top: { abilities: [] } } };

      const bandHero = createCard("m_band", "t_band_card", "Bander", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good" });
      const drawHero = createCard("m_draw", "t_draw_card", "Drawer", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good" });
      const vanillaHero = createCard("m_van", "t_vanilla_card", "Vanilla", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good" });

      expect(TargetSelectionService.matchesFilter(bandHero, { targets_abilities: false, ability_target_actions: ["band"] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(drawHero, { targets_abilities: false, ability_target_actions: ["band"] })).toBe(false);
      expect(TargetSelectionService.matchesFilter(bandHero, { exclude_ability_actions: ["band"] })).toBe(false);
      expect(TargetSelectionService.matchesFilter(drawHero, { exclude_ability_actions: ["band"] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(bandHero, { targets_abilities: true, ability_target_actions: [] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(vanillaHero, { targets_abilities: true, ability_target_actions: [] })).toBe(false);
    });
  });

  describe("4. Typed Trigger Events, Subject & Source Matching", () => {
    test("trigger_event arrays and trigger_subject/trigger_source selectors evaluate safely", () => {
      expect(AbilityLookup.isStarAbility({ ability_id: "s1", trigger_event: ["on_attack", "star_phase"] })).toBe(true);
      expect(BattleCharacterClassifier.isAbilityTriggeredOnBattleEntry({ activation_mode: "triggered", trigger_event: ["on_block", "on_enters_battle"] }, ActionType.BLOCK_RESCUE)).toBe(true);
      expect(BattleCharacterClassifier.isAbilityTriggeredOnBattleEntry({ activation_mode: "triggered", trigger_event: ["would_be_discarded", "on_win_battle"] }, ActionType.BLOCK_RESCUE)).toBe(false);

      const subjHero = createCard("ts_h", "9071", "Blue Subject", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", Brigade: "Blue" });
      const srcOpp = createCard("ts_s", "9072", "Evil Trigger Source", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil" });
      const abilityDef = {
        activation_mode: "triggered",
        trigger_event: "would_be_discarded",
        trigger_subject: { target_type: "hero", brigades: ["Blue"] },
        trigger_source: { target_type: "evil_character", zone_owner: "opponent" },
      };

      expect(BattleTriggerService.matchesTriggerParticipants(abilityDef, { room, player: p1, card: subjHero, subjectCard: subjHero, triggerSourceCard: srcOpp })).toBe(true);
      expect(BattleTriggerService.matchesTriggerParticipants(abilityDef, { room, player: p1, card: subjHero, subjectCard: srcOpp, triggerSourceCard: srcOpp })).toBe(false);
      expect(BattleTriggerService.matchesTriggerParticipants(abilityDef, { room, player: p1, card: subjHero, subjectCard: subjHero, triggerSourceCard: subjHero })).toBe(false);
    });

    test("Miriam [L] prompts manual Reserve selection only for controller cards and manual_controller draw draws immediately", () => {
      state.round = 2;
      const resolver = new AbilityResolver(room);
      const miriam = createCard("m1", "-327281604", "Miriam [L]", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const res1 = createCard("r1_1", "226799305", "Jethro, Priest of Midian [L]", ZONES.RESERVE, "p1", { Type: "Hero", Alignment: "Good", Testament: "OT" });
      const res2 = createCard("r1_2", "-1088840158", "Gad, David's Chosen [K]", ZONES.RESERVE, "p1", { Type: "Hero", Alignment: "Good", Testament: "OT" });
      createCard("r2_1", "706197820", "David's Victory [K]", ZONES.RESERVE, "p2", { Type: "GE", Alignment: "Good", Testament: "OT" });

      const mirRes = resolver.resolve(
        { id: "it_mir", cardId: miriam.id, controllerId: "p1", title: miriam.Name, abilityId: "" },
        { accepted: true, chosenAbilityId: "take_good_ot_card_from_reserve" }
      );
      expect(mirRes.awaitingTargetSelection).toBe(true);
      expect(mirRes.eligible.eligibleCardIds).toEqual([res1.id, res2.id]);
      expect(room.clients[0].send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ eligibleCardIds: [res1.id, res2.id], minTargets: 1, maxTargets: 1 })
      );

      createCard("dk1", "9081", "Deck 1", ZONES.DECK, "p2", { Type: "Evil Character", Alignment: "Evil" });
      createCard("dk2", "9082", "Deck 2", ZONES.DECK, "p2", { Type: "Evil Character", Alignment: "Evil" });
      const horsemen = createCard("eh1", "477447149", "Egyptian Horsemen [K]", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      const ehRes = resolver.resolve(
        { id: "it_eh", cardId: horsemen.id, controllerId: "p2", title: horsemen.Name, abilityId: "" },
        { accepted: true, chosenAbilityId: "draw_2" }
      );
      expect(ehRes.handled).toBe(true);
      expect(ehRes.awaitingTargetSelection).toBeFalsy();
      expect(p2.hand.length).toBe(2);
    });
  });
});
