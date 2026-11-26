// server/tests/sideAttributesAndProtection.test.js
const { cardDatabase } = require("../src/data/cardDatabase");
const cardsRaw = require("../../shared/cards_extended_with_ordir_fuzzy.json");
const cardsLogic = require("../../shared/cards_logic.json");
const astConstants = require("../../shared/ast_constants.json");
const { normalizeCard } = require("../../shared/utils");
const { CardRepository } = require("../../shared/CardRepository");
const { CardFactory } = require("../src/factories/CardFactory");
const { isCharacterSideType } = require("../../shared/cardHierarchy");
const { SideAttributeEvaluator } = require("../../shared/rules/SideAttributeEvaluator");
const { ProtectionService } = require("../../shared/rules/ProtectionService");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { ConditionEvaluator } = require("../src/ast/ConditionEvaluator");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { BattleCharacterClassifier } = require("../src/services/BattleCharacterClassifier");
const { ImmunityHandler } = require("../src/ast/handlers/ImmunityHandler");
const { ZoneTransferHandler } = require("../src/ast/handlers/ZoneTransferHandler");
const { BattleCalculator } = require("../../shared/BattleCalculator");
const { BATTLE_STATE_REASON } = require("../../shared/battleConstants");
const { AST_ACTIONS } = require("../../shared/astConstants");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");

const findRaw = (id) => cardsRaw.cards.find((c) => c.Id === id);

const buildRoom = ({ p1Hand = [], p1Territory = [], p2Hand = [], p2Territory = [], battlefield = [] } = {}) => {
  const all = [...p1Hand, ...p1Territory, ...p2Hand, ...p2Territory, ...battlefield];
  return {
    state: {
      currentPhase: "battle",
      players: new Map([
        ["p1", { sessionId: "p1", name: "P1", hand: p1Hand, territory: p1Territory, discardPile: [], deck: [], reserve: [] }],
        ["p2", { sessionId: "p2", name: "P2", hand: p2Hand, territory: p2Territory, discardPile: [], deck: [], reserve: [] }],
      ]),
      battlefield,
    },
    cardLookup: new Map(all.map((c) => [c.id, c])),
  };
};

describe("Side Attributes (IsGeneric, IsHuman, Classes) & Conditional Protection Clauses", () => {
  beforeAll(() => {
    if (!CardRepository.isInitialized) CardRepository.initialize(cardDatabase);
  });

  describe("1. Dataset Contracts & Normalization", () => {
    test("IsGeneric and IsHuman appear strictly on character sides and never in non-characters", () => {
      for (const raw of cardsRaw.cards) {
        const sides = raw.CardSides || {};
        for (const s of Object.values(sides)) {
          if (!s || typeof s !== "object" || !s.Type) continue;
          if (isCharacterSideType(s.Type)) {
            if (s.IsGeneric !== undefined) expect(typeof s.IsGeneric).toBe("boolean");
            if (s.IsHuman !== undefined) expect(typeof s.IsHuman).toBe("boolean");
          } else {
            expect(s.IsGeneric).toBeUndefined();
            expect(s.IsHuman).toBeUndefined();
          }
          if (Array.isArray(s.Classes)) {
            const allowedSideClasses = [...astConstants.card_classes, "Star", "Cloud"];
            s.Classes.forEach((cls) => expect(allowedSideClasses).toContain(cls));
          }
        }
      }
    });

    test("cards_logic.json removes bare generic/unique/human tokens from TargetSelector.identifiers", () => {
      const forbidden = new Set(["generic", "unique", "human", "humans", "non-human", "non-humans"]);
      const walk = (n) => {
        if (!n || typeof n !== "object") return;
        if ("selection_mode" in n && Array.isArray(n.identifiers)) {
          for (const id of n.identifiers) {
            expect(forbidden.has(String(id).trim().toLowerCase())).toBe(false);
          }
        }
        if ("selection_mode" in n && Array.isArray(n.classes)) {
          n.classes.forEach((cls) => expect(astConstants.card_classes).toContain(cls));
        }
        Object.values(n).forEach(walk);
      };
      Object.values(cardsLogic).forEach(walk);
    });

    test("normalizeCard & Colyseus Card.clone() preserve IsGeneric, IsHuman, and canonical Classes", () => {
      const daughters = normalizeCard(findRaw("1974135304"));
      const miriam = normalizeCard(findRaw("149684389"));
      const goliath = normalizeCard(findRaw("1723646083"));
      const evilReleased = normalizeCard(findRaw("-679664345"));

      expect(daughters.IsGeneric).toBe(true);
      expect(daughters.IsHuman).toBe(true);
      expect(miriam.IsGeneric).toBe(false);
      expect(goliath.IsHuman).toBe(true);
      expect(evilReleased.IsGeneric).toBeNull();
      expect(evilReleased.IsHuman).toBeNull();
      expect(evilReleased.Class).toEqual(["Territory"]);

      const cloned = CardFactory.createCard(daughters, "p1", "c_daughters", ZONES.HAND).clone();
      expect(SideAttributeEvaluator.resolveIsGeneric(cloned)).toBe(true);
      expect(SideAttributeEvaluator.resolveIsHuman(cloned)).toBe(true);
      expect(AbilityLookup.getSideIsGeneric("1974135304")).toBe(true);
    });
  });

  describe("2. IsGeneric, IsHuman & Classes Filtering", () => {
    test("Jethro bands to generic Daughters of Midian and rejects non-generic Miriam", () => {
      const jethro = CardFactory.createCard(CardRepository.getById("446819577"), "p1", "c_jethro", ZONES.BATTLEFIELD);
      const daughters = CardFactory.createCard(CardRepository.getById("1974135304"), "p1", "c_daughters", ZONES.HAND);
      const miriam = CardFactory.createCard(CardRepository.getById("149684389"), "p1", "c_miriam", ZONES.HAND);
      const room = buildRoom({ p1Hand: [daughters, miriam], battlefield: [jethro] });

      const jethroBandTarget = AbilityLookup.resolveAbilities("446819577")[0].effects[0].target;
      const eligible = TargetSelectionService.resolveEligibleTargets(room, room.state.players.get("p1"), jethroBandTarget, {
        sourceCard: jethro,
        actionType: "band",
      });
      expect(eligible.eligibleCardIds).toEqual(["c_daughters"]);
    });

    test("Plot to Kill unique Pharisee or Sadducee check matches unique Pharisee (is_generic: false) and rejects generic", () => {
      const uniquePharisee = { id: "u_ph", Name: "Nicodemus", Type: "Evil Character", Alignment: "Evil", IsGeneric: false, ORDIR: ["Pharisee"], zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const genericPharisee = { id: "g_ph", Name: "Pharisees", Type: "Evil Character", Alignment: "Evil", IsGeneric: true, ORDIR: ["Pharisee"], zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const cond = cardsLogic["-1278294591"].sides.top.abilities[1].conditions[0].selector;

      expect(TargetSelectionService.matchesFilter(uniquePharisee, cond)).toBe(true);
      expect(TargetSelectionService.matchesFilter(genericPharisee, cond)).toBe(false);
    });

    test("evaluates IsHuman (true/false), non-character null exclusion, and 'except a human'", () => {
      const greatMultitude = CardFactory.createCard(CardRepository.getById("-1496373749"), "p1", "c_gm", ZONES.TERRITORY);
      const angel = { id: "c_ang", Name: "Captain", Type: "Hero", Alignment: "Good", IsHuman: false, zone: ZONES.TERRITORY };
      const enh = CardFactory.createCard(CardRepository.getById("-679664345"), "p1", "c_enh", ZONES.HAND);

      expect(SideAttributeEvaluator.resolveIsHuman(greatMultitude)).toBe(true);
      expect(SideAttributeEvaluator.matchesIsHuman(greatMultitude, true)).toBe(true);
      expect(SideAttributeEvaluator.matchesIsHuman(angel, false)).toBe(true);
      expect(SideAttributeEvaluator.matchesIsHuman(enh, true)).toBe(false);
      expect(SideAttributeEvaluator.matchesIsHuman(enh, false)).toBe(false);

      expect(TargetSelectionService.matchesFilter(greatMultitude, { target_type: "character", identifiers: ["except a human"] })).toBe(false);
      expect(TargetSelectionService.matchesFilter(angel, { target_type: "character", identifiers: ["except a human"] })).toBe(true);
    });

    test("evaluates canonical Classes, Buckler disjunctive Warrior/Weapon selector, and non-warrior/non-weapon identifiers", () => {
      const warrior = { id: "w1", Name: "Warrior Hero", Type: "Hero", Alignment: "Good", Class: ["Warrior-Class"], zone: ZONES.TERRITORY };
      const weapon = { id: "w2", Name: "Sword", Type: "GE", Alignment: "Good", Class: ["Illustrated Weapon"], zone: ZONES.TERRITORY };
      const nonClass = { id: "w3", Name: "Priest", Type: "Hero", Alignment: "Good", Class: [], zone: ZONES.TERRITORY };

      const bucklerTarget = cardsLogic["133156924"].sides.top.abilities[0].effects[0].target;
      expect(TargetSelectionService.matchesFilter(warrior, bucklerTarget)).toBe(true);
      expect(TargetSelectionService.matchesFilter(weapon, bucklerTarget)).toBe(true);
      expect(TargetSelectionService.matchesFilter(nonClass, bucklerTarget)).toBe(false);

      expect(TargetSelectionService.matchesFilter(warrior, { target_type: "hero", identifiers: ["non-warrior"] })).toBe(false);
      expect(TargetSelectionService.matchesFilter(nonClass, { target_type: "hero", identifiers: ["non-warrior"] })).toBe(true);
      expect(TargetSelectionService.matchesFilter(weapon, { target_type: "enhancement", identifiers: ["non-weapon"] })).toBe(false);
      expect(ProtectionService.matchesSource(warrior, { classes: ["Warrior"] })).toBe(true);
    });
  });

  describe("3. Conditional Protection Clauses & Static Modifier Filtering", () => {
    test("AbilityLookup and BattleCharacterClassifier exclude passive modifier-only static abilities from execution", () => {
      const plotAbilities = AbilityLookup.resolveAbilities("-1278294591");
      expect(plotAbilities.map((a) => a.ability_id)).toEqual(["ab_1_negate_and_discard"]);

      const allIncludingPassive = AbilityLookup.resolveAbilities("-1278294591", { includePassiveModifiers: true });
      const passive = allIncludingPassive.find((a) => a.ability_id === "ab_2_cannot_be_prevented");
      expect(AbilityLookup.isPassiveModifierAbility(passive)).toBe(true);
      expect(BattleCharacterClassifier.isAbilityTriggeredOnBattleEntry(passive, "PLAY_EVIL_ENHANCEMENT")).toBe(false);
    });

    test("evaluates conditional protection across zone_check (==1 / >=1 / ==0), count_comparison, hand_advantage, and by <Source>", () => {
      // 1. if used by <Actor> (== 1): Belshazzar's Banquet (80403388) cannot be prevented if used by a Babylonian
      const banquet = { id: "b1", templateId: "80403388", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const babylonian = { id: "bab1", Name: "King", Type: "Evil Character", Alignment: "Evil", ORDIR: ["Babylonian"], zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const babylonian2 = { id: "bab2", Name: "Guard", Type: "Evil Character", Alignment: "Evil", ORDIR: ["Babylonian"], zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      expect(AbilityLookup.isSideProtectedFrom("80403388", "cannot_be_prevented", { room: buildRoom({ battlefield: [babylonian, babylonian2] }), card: banquet })).toBe(true);
      expect(AbilityLookup.isSideProtectedFrom("80403388", "cannot_be_prevented", { room: buildRoom({ battlefield: [] }), card: banquet })).toBe(false);

      // 2. unless <Entity> is in play (== 0): Gomer (PoC) (1304409445) unless Hosea (758137417) is in play
      const gomer = { id: "gom1", templateId: "1304409445", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const hosea = { id: "hos1", templateId: "758137417", Name: "Hosea", Type: "Hero", Alignment: "Good", zone: ZONES.TERRITORY, controllerId: "p1" };
      expect(AbilityLookup.isSideProtectedFrom("1304409445", "cannot_be_negated", { room: buildRoom({ battlefield: [gomer] }), card: gomer })).toBe(true);
      expect(AbilityLookup.isSideProtectedFrom("1304409445", "cannot_be_negated", { room: buildRoom({ p1Territory: [hosea], battlefield: [gomer] }), card: gomer })).toBe(false);

      // 3. count_comparison: Abandonment (EC) (3752659) if > 1 good Hero in battle
      const aband = { id: "ab1", templateId: "3752659", zone: ZONES.BATTLEFIELD, controllerId: "p2" };
      const h1 = { id: "h1", Type: "Hero", Alignment: "Good", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const h2 = { id: "h2", Type: "Hero", Alignment: "Good", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      expect(AbilityLookup.isSideProtectedFrom("3752659", "cannot_be_negated", { room: buildRoom({ battlefield: [aband, h1] }), card: aband })).toBe(false);
      expect(AbilityLookup.isSideProtectedFrom("3752659", "cannot_be_negated", { room: buildRoom({ battlefield: [aband, h1, h2] }), card: aband })).toBe(true);

      // 4. hand_advantage: Outsiders (-1899569338) if opponent has more cards in hand than controller
      const out = { id: "o1", templateId: "-1899569338", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const rMoreOpp = buildRoom({ p1Hand: [{}], p2Hand: [{}, {}] });
      const rEqual = buildRoom({ p1Hand: [{}], p2Hand: [{}] });
      expect(AbilityLookup.isSideProtectedFrom("-1899569338", "cannot_be_negated", { room: rMoreOpp, card: out })).toBe(true);
      expect(AbilityLookup.isSideProtectedFrom("-1899569338", "cannot_be_negated", { room: rEqual, card: out })).toBe(false);

      // 5. by <Source> combined with site in play: Corrupted (557919552) cannot be prevented by a good card if an occupied site is in play
      const corr = { id: "co1", templateId: "557919552", zone: ZONES.BATTLEFIELD, controllerId: "p2" };
      const goodSrc = { id: "gs1", Type: "GE", Alignment: "Good", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const evilSrc = { id: "es1", Type: "EE", Alignment: "Evil", zone: ZONES.BATTLEFIELD, controllerId: "p2" };
      const occSite = { id: "si1", Type: "Site", ORDIR: ["Occupied"], zone: ZONES.TERRITORY, controllerId: "p2" };
      expect(AbilityLookup.isSideProtectedFrom("557919552", "cannot_be_prevented", { room: buildRoom({ p2Territory: [occSite], battlefield: [corr] }), card: corr, sourceCard: goodSrc })).toBe(true);
      expect(AbilityLookup.isSideProtectedFrom("557919552", "cannot_be_prevented", { room: buildRoom({ p2Territory: [occSite], battlefield: [corr] }), card: corr, sourceCard: evilSrc })).toBe(false);
    });

    test("AbilityResolver formats is_generic, is_human, and classes cleanly without syntactic 'or' noise", () => {
      const resolver = new AbilityResolver(buildRoom());
      const jethroTarget = cardsLogic["446819577"].sides.top.abilities[0].effects[0].target;
      const bucklerTarget = cardsLogic["133156924"].sides.top.abilities[0].effects[0].target;
      expect(resolver._formatBandActionText(jethroTarget, { fixed_value: 1 }, false)).toBe("Band to a generic Exodus female hero");
      expect(resolver._formatBandActionText(bucklerTarget, { fixed_value: 1 }, false)).toBe("Band to a warrior or weapon");
    });
  });

  describe("4. Protection Inheritance on Enhancements (REG v11.1.0 lines 1799–1801)", () => {
    const applyRamsesProtection = (room, ramsesCard) => {
      const protectEffect = AbilityLookup.resolveAbilities("-422285470")[0].effects[0];
      return ImmunityHandler.execute({
        room,
        player: room.state.players.get(ramsesCard.controllerId),
        effect: protectEffect,
        item: { cardId: ramsesCard.id, controllerId: ramsesCard.controllerId },
      });
    };

    test("Pharaoh, Ramses II [K] cannot be targeted/bounced by Counsel for the King [K] when used by a lone Hero, but can with 2 Heroes", () => {
      const ramses = CardFactory.createCard(CardRepository.getById("-422285470"), "p2", "c_ramses", ZONES.BATTLEFIELD);
      const counsel = CardFactory.createCard(CardRepository.getById("-265232813"), "p1", "c_counsel", ZONES.BATTLEFIELD);
      const hero1 = CardFactory.createCard(CardRepository.getById("1974135304"), "p1", "c_hero1", ZONES.BATTLEFIELD);
      hero1.Brigade = "Green";

      const room1 = buildRoom({ battlefield: [hero1, counsel, ramses] });
      room1.state.activePlayer = "p1";
      applyRamsesProtection(room1, ramses);

      const p1 = room1.state.players.get("p1");
      const p2 = room1.state.players.get("p2");
      const bounceEffect = AbilityLookup.resolveAbilities("-265232813")[0].effects[1];

      expect(ProtectionService.isProtected(ramses, counsel, AST_ACTIONS.BOUNCE, { room: room1 })).toBe(true);
      const eligibleLone = TargetSelectionService.resolveEligibleTargets(room1, p1, bounceEffect.target, {
        room: room1,
        sourceCard: counsel,
        actionType: AST_ACTIONS.BOUNCE,
      });
      expect(eligibleLone.eligibleCardIds).toEqual([]);

      const bounceResLone = ZoneTransferHandler.execute({
        room: room1,
        player: p1,
        effect: bounceEffect,
        item: { cardId: counsel.id, controllerId: "p1" },
        options: { specialInitiativeDeclined: true },
      });
      expect(bounceResLone.snapshot.movedCards).toEqual([]);
      expect(ramses.zone).toBe(ZONES.BATTLEFIELD);
      expect(p2.hand).toHaveLength(0);

      // Adding a second Hero removes "lone" status -> Counsel for the King can now target and bounce Ramses
      const hero2 = CardFactory.createCard(CardRepository.getById("149684389"), "p1", "c_hero2", ZONES.BATTLEFIELD);
      hero2.Brigade = "Purple";
      room1.state.battlefield.push(hero2);
      room1.cardLookup.set(hero2.id, hero2);

      expect(ProtectionService.isProtected(ramses, counsel, AST_ACTIONS.BOUNCE, { room: room1 })).toBe(false);
      const eligibleTwo = TargetSelectionService.resolveEligibleTargets(room1, p1, bounceEffect.target, {
        room: room1,
        sourceCard: counsel,
        actionType: AST_ACTIONS.BOUNCE,
      });
      expect(eligibleTwo.eligibleCardIds).toEqual(["c_ramses"]);

      const bounceResTwo = ZoneTransferHandler.execute({
        room: room1,
        player: p1,
        effect: bounceEffect,
        item: { cardId: counsel.id, controllerId: "p1" },
        options: { targetCardIds: ["c_ramses"], specialInitiativeDeclined: true },
      });
      expect(bounceResTwo.snapshot.movedCards).toHaveLength(1);
      expect(ramses.zone).toBe(ZONES.HAND);
      expect(p2.hand.map((c) => c.id)).toContain("c_ramses");
    });

    test("Attached Enhancement (attachedTo) and explicit actorCard evaluate protection strictly against the bearer", () => {
      const target = {
        id: "ec_prot",
        Name: "Protected EC",
        Type: "Evil Character",
        Alignment: "Evil",
        controllerId: "p2",
        isProtected: true,
        _protection: {
          card_sources: [{ target_type: "hero", alignment: "good", brigades: ["green"] }],
        },
      };
      const greenHero = { id: "h_green", Name: "Green Hero", Type: "Hero", Alignment: "Good", Brigade: "Green", IsCharacter: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const silverHero = { id: "h_silver", Name: "Silver Hero", Type: "Hero", Alignment: "Good", Brigade: "Silver", IsCharacter: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };

      const attachedToGreen = { id: "e_1", Name: "Attached GE", Type: "GE", Alignment: "Good", Brigade: "Green/Silver", IsEnhancement: true, attachedTo: "h_green", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const attachedToSilver = { id: "e_2", Name: "Attached GE 2", Type: "GE", Alignment: "Good", Brigade: "Green/Silver", IsEnhancement: true, attachedTo: "h_silver", zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const unattachedGE = { id: "e_3", Name: "Unattached GE", Type: "GE", Alignment: "Good", Brigade: "Green/Silver", IsEnhancement: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };

      const room = buildRoom({ battlefield: [target, greenHero, silverHero, attachedToGreen, attachedToSilver, unattachedGE] });

      expect(ProtectionService.isProtected(target, attachedToGreen, AST_ACTIONS.DISCARD, { room })).toBe(true);
      expect(ProtectionService.isProtected(target, attachedToSilver, AST_ACTIONS.DISCARD, { room })).toBe(false);
      expect(ProtectionService.isProtected(target, unattachedGE, AST_ACTIONS.DISCARD, { room, actorCard: greenHero })).toBe(true);
      expect(ProtectionService.isProtected(target, unattachedGE, AST_ACTIONS.DISCARD, { room, actorCard: silverHero })).toBe(false);
    });

    test("Unattached Enhancement in battle checks brigade-matching characters and preserves direct Enhancement / no-room semantics", () => {
      const targetProtGreenHero = {
        id: "ec_prot_g",
        Name: "Protected EC",
        Type: "Evil Character",
        Alignment: "Evil",
        controllerId: "p2",
        isProtected: true,
        _protection: {
          card_sources: [{ target_type: "hero", alignment: "good", brigades: ["green"] }],
        },
      };
      const greenHero = { id: "h_g", Name: "Green Hero", Type: "Hero", Alignment: "Good", Brigade: "Green", IsCharacter: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const purpleHero = { id: "h_p", Name: "Purple Hero", Type: "Hero", Alignment: "Good", Brigade: "Purple", IsCharacter: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const silverHero = { id: "h_s", Name: "Silver Hero", Type: "Hero", Alignment: "Good", Brigade: "Silver", IsCharacter: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };

      const greenEnh = { id: "enh_g", Name: "Green GE", Type: "GE", Alignment: "Good", Brigade: "Green", IsEnhancement: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };
      const dualEnh = { id: "enh_gp", Name: "Counsel for the King [K]", Type: "GE", Alignment: "Good", Brigade: "Green/Purple", IsEnhancement: true, zone: ZONES.BATTLEFIELD, controllerId: "p1" };

      // Single-brigade Green Enhancement can only be used by Green Hero -> blocked even with Silver Hero in battle
      const roomGreenAndSilver = buildRoom({ battlefield: [targetProtGreenHero, greenHero, silverHero, greenEnh, dualEnh] });
      expect(ProtectionService.isProtected(targetProtGreenHero, greenEnh, AST_ACTIONS.BOUNCE, { room: roomGreenAndSilver })).toBe(true);
      // Dual-brigade Green/Purple Enhancement only matches Green Hero here -> blocked when only Green + Silver are in battle
      expect(ProtectionService.isProtected(targetProtGreenHero, dualEnh, AST_ACTIONS.BOUNCE, { room: roomGreenAndSilver })).toBe(true);

      // With Green Hero + Purple Hero in battle, Purple Hero is NOT protected-from -> dualEnh is NOT blocked
      const roomGreenAndPurple = buildRoom({ battlefield: [targetProtGreenHero, greenHero, purpleHero, dualEnh] });
      expect(ProtectionService.isProtected(targetProtGreenHero, dualEnh, AST_ACTIONS.BOUNCE, { room: roomGreenAndPurple })).toBe(false);

      // Without room context, character-only protection does not block an unattached Enhancement
      expect(ProtectionService.isProtected(targetProtGreenHero, greenEnh, AST_ACTIONS.BOUNCE)).toBe(false);

      // Regression guard: direct protection against Enhancements still works without room context
      const targetProtEnh = {
        id: "ec_prot_enh",
        Name: "Enhancement Protected EC",
        Type: "Evil Character",
        Alignment: "Evil",
        controllerId: "p2",
        isProtected: true,
        _protection: {
          card_sources: [{ target_type: "enhancement", alignment: "good" }],
        },
      };
      expect(ProtectionService.isProtected(targetProtEnh, greenEnh, AST_ACTIONS.BOUNCE)).toBe(true);
    });

    test("BattleCalculator treats strength of lone Hero and its Enhancement as 0 against Ramses II [K], but counts both with 2 Heroes", () => {
      const ramses = CardFactory.createCard(CardRepository.getById("-422285470"), "p2", "c_ramses", ZONES.BATTLEFIELD);
      const counsel = CardFactory.createCard(CardRepository.getById("-265232813"), "p1", "c_counsel", ZONES.BATTLEFIELD);
      const hero1 = {
        id: "h1",
        Name: "Lone Green Hero",
        Type: "Hero",
        Alignment: "Good",
        Brigade: "Green",
        Strength: "8",
        Toughness: "8",
        IsCharacter: true,
        zone: ZONES.BATTLEFIELD,
        controllerId: "p1",
      };
      const room = buildRoom({ battlefield: [hero1, counsel, ramses] });
      applyRamsesProtection(room, ramses);

      const loneEval = BattleCalculator.evaluateBattle({
        battlefield: [hero1, counsel, ramses],
        activePlayerId: "p1",
        defenderPlayerId: "p2",
        lastBattleCardPlayerId: "p1",
        currentPhase: PHASES.BATTLE,
      });
      // Ramses (12/12) vs hero1 (8/8) + counsel (2/2): rescuer strength is zeroed -> blocker wins numbers -> attacker gets initiative
      expect(loneEval.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
      expect(loneEval.initiativePlayerId).toBe("p1");

      const hero2 = {
        id: "h2",
        Name: "Second Purple Hero",
        Type: "Hero",
        Alignment: "Good",
        Brigade: "Purple",
        Strength: "2",
        Toughness: "2",
        IsCharacter: true,
        zone: ZONES.BATTLEFIELD,
        controllerId: "p1",
      };
      const twoHeroEval = BattleCalculator.evaluateBattle({
        battlefield: [hero1, hero2, counsel, ramses],
        activePlayerId: "p1",
        defenderPlayerId: "p2",
        lastBattleCardPlayerId: "p1",
        currentPhase: PHASES.BATTLE,
      });
      // Now 8 + 2 + 2 = 12 >= 12 (Ramses defeated) and 12 >= 12 (Heroes defeated) -> mutual destruction
      expect(twoHeroEval.stateReason).toBe(BATTLE_STATE_REASON.MUTUAL_DESTRUCTION);
    });
  });
});
