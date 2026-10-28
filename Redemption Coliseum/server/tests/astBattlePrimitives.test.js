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
        scope: "territory",
        card_titles: ["Samuel"],
      };

      // TargetSelectionService scans Hand because actionType is BAND
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
      expect(entryAbility.ability_id).toBe("ab_1_protect");

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

      // Verify prompt was sent to p2
      const p2Client = room.clients.find((c) => c.sessionId === "p2");
      expect(p2Client.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          abilityId: "special_initiative",
          action: "special_initiative",
          promptText: expect.stringContaining("defeated due to zero toughness"),
        })
      );

      // Defending cards must NOT be discarded yet (they stay in battle awaiting Special Initiative decision)
      expect(state.battlefield.some((c) => c.id === ec1.id)).toBe(true);
      expect(state.battlefield.some((c) => c.id === ec2.id)).toBe(true);
      expect(p2.discard.length).toBe(0);

      // Now simulate defending player declining Special Initiative:
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
  });
});
