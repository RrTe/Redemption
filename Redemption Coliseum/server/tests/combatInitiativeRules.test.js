// server/tests/combatInitiativeRules.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { moveCard } = require("../src/services/cardService");
const { BattleService } = require("../src/services/BattleService");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { CARD_TYPES, ALIGNMENTS } = require("../../shared/card-constants");
const { ChronicleItem } = require("../src/state/EffectChronicleState");

describe("Combat Rules Expansion (Blocker Gates, Ability Lock & Initiative Enforcement)", () => {
  let state;
  let attacker;
  let defender;
  let cardLookup;
  let roomMock;

  beforeEach(() => {
    state = new RoomState();
    attacker = new PlayerState();
    attacker.sessionId = "p1";
    defender = new PlayerState();
    defender.sessionId = "p2";

    state.players.set("p1", attacker);
    state.players.set("p2", defender);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    cardLookup = new Map();
    roomMock = { state, cardLookup, broadcastGameLog: jest.fn(), broadcast: jest.fn() };
  });

  function createCard(id, name, type, alignment, brigade, ownerId, zone = ZONES.HAND, extra = {}) {
    const card = Object.assign(new Card(), {
      id,
      Name: name,
      Type: type,
      Alignment: alignment,
      Brigade: brigade,
      controllerId: ownerId,
      originalOwnerId: ownerId,
      zone,
      ...extra,
    });
    cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  describe("1. Blocker Presentation Gates", () => {
    test("1.1 Blocker (Evil Character) rejected when no Hero is in battle", () => {
      const ec = createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("No Hero in battle to block!");
      expect(ec.zone).toBe(ZONES.HAND);
      expect(state.battlefield.length).toBe(0);
    });

    test("1.2 Initial Blocker allowed into battle when a Hero is present", () => {
      // Hero enters battle for attacker
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      const ec = createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(1);
      expect(ec.zone).toBe(ZONES.BATTLEFIELD);
      expect(state.battlefield.length).toBe(2);
    });
  });

  describe("2. General Ability Lock", () => {
    test("2.1 Card move rejected when unresolved mandatory ability exists in chronicle", () => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      // Enqueue mandatory item in chronicle
      state.effectChronicle.items.push(
        new ChronicleItem({
          id: "item_mand_1",
          cardId: "hero_1",
          controllerId: "p1",
          isOptional: false,
        })
      );
      state.effectChronicle.isResolving = true;

      const ec = createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Abilities must resolve first!");
      expect(ec.zone).toBe(ZONES.HAND);
    });

    test("2.2 Blocker rejected when hero's optional ability prompt is open in chronicle", () => {
      createCard("hero_1", "Miriam", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      // Enqueue optional ability item (e.g. Miriam entrance prompt active)
      state.effectChronicle.items.push(
        new ChronicleItem({
          id: "item_opt_1",
          cardId: "hero_1",
          controllerId: "p1",
          isOptional: true,
        })
      );
      state.effectChronicle.isResolving = true;

      const ec = createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Abilities must resolve first!");
      expect(ec.zone).toBe(ZONES.HAND);
    });

    test("2.3 Card move allowed once chronicle items have resolved", () => {
      createCard("hero_1", "Miriam", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      // Chronicle is empty (ability resolved or passed)
      state.effectChronicle.items.length = 0;
      state.effectChronicle.isResolving = false;

      const ec = createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(1);
      expect(ec.zone).toBe(ZONES.BATTLEFIELD);
    });
  });

  describe("3. Initiative Enforcement in Battle", () => {
    test("3.1 Initial Hero allowed to enter battle without initiative to begin Rescue Attempt", () => {
      const hero = createCard("hero_init", "King David", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Red", "p1", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, hero.id);
      expect(res.movedCards.length).toBe(1);
      expect(hero.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("3.2 Subsequent Hero (Banding) rejected when player lacks initiative and has no active banding effect", () => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      const secondHero = createCard("hero_2", "Aaron", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.HAND, {
        IsCharacter: true,
      });

      state.battle.initiativePlayerId = "p2"; // Opponent has initiative

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, secondHero.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("You do not have initiative!");
      expect(secondHero.zone).toBe(ZONES.HAND);
    });

    test("3.3 Enhancement play allowed when player holds regular initiative and matching brigade", () => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });
      createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      state.battle.initiativePlayerId = "p1"; // Attacker has initiative

      const ge = createCard("ge_1", "Breastplate of Righteousness", CARD_TYPES.GE, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.HAND, {
        IsEnhancement: true,
      });

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(res.movedCards.length).toBe(1);
      expect(ge.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("3.4 Enhancement play rejected when player lacks initiative", () => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });
      createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      state.battle.initiativePlayerId = "p2"; // Opponent holds initiative

      const ge = createCard("ge_1", "Breastplate of Righteousness", CARD_TYPES.GE, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.HAND, {
        IsEnhancement: true,
      });

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("You do not have initiative!");
      expect(ge.zone).toBe(ZONES.HAND);
    });

    test("3.5 Dominant bypass: Dominants can be played even without initiative", () => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });
      createCard("ec_1", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });

      state.battle.initiativePlayerId = "p2"; // Attacker has NO initiative

      const dominant = createCard("dom_cm", "Christian Martyr", "Dominant", ALIGNMENTS.GOOD, "White", "p1", ZONES.HAND, {
        Type: "Dominant",
      });

      // Dominants cannot enter the Field of Battle
      const invalidRes = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, dominant.id);
      expect(invalidRes.error).toBe("Invalid card for battle!");

      // Dominants can be played to Territory during battle even without initiative
      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, dominant.id);
      expect(res.movedCards.length).toBe(1);
      expect(dominant.zone).toBe(ZONES.TERRITORY);
    });
  });

  describe("4. Special Initiative Strict Rules (REG v11.0.0)", () => {
    beforeEach(() => {
      createCard("hero_1", "Moses", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });
      createCard("ec_1", "Only Blocker", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.BATTLEFIELD, {
        IsCharacter: true,
      });
      // Player 2 is in Special Initiative
      state.battle.specialInitiativePlayerId = "p2";
    });

    test("4.1 Playing Evil Enhancement in Special Initiative succeeds and clears SI on battle entry", () => {
      const ee = createCard("ee_1", "Darkness", CARD_TYPES.EE, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsEnhancement: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ee.id);
      expect(res.movedCards.length).toBe(1);
      expect(ee.zone).toBe(ZONES.BATTLEFIELD);

      // BattleService clears specialInitiativePlayerId upon card entering battle
      BattleService.onCardEnteredBattle(roomMock, defender, ee, ZONES.BATTLEFIELD);
      expect(state.battle.specialInitiativePlayerId).toBe("");
    });

    test("4.2 Playing Dominant during Special Initiative is strictly rejected", () => {
      const dominant = createCard("dom_evil", "Mayhem", "Dominant", ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        Type: "Dominant",
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, dominant.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Only Enhancements in Special Initiative!");
      expect(dominant.zone).toBe(ZONES.HAND);
    });

    test("4.3 Playing non-enhancement (Character) during Special Initiative is strictly rejected", () => {
      const ec2 = createCard("ec_2", "Pharaoh", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Gold", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec2.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Only Enhancements in Special Initiative!");
      expect(ec2.zone).toBe(ZONES.HAND);
    });

    test("4.4 Moving card to Territory during Special Initiative is strictly rejected", () => {
      const fortress = createCard("fort_1", "Herod's Temple", "Fortress", ALIGNMENTS.EVIL, "None", "p2", ZONES.HAND, {
        Type: "Fortress",
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, fortress.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Only Enhancements in Special Initiative!");
      expect(fortress.zone).toBe(ZONES.HAND);
    });
  });

  describe("5. Arena Mode Bypass", () => {
    test("5.1 In Arena Mode, blocker gates and initiative checks are bypassed", () => {
      state.isArenaMode = true;

      // 0 heroes in battle, no initiative
      state.battle.initiativePlayerId = "";

      const ec = createCard("ec_arena", "Goliath", CARD_TYPES.EC, ALIGNMENTS.EVIL, "Black", "p2", ZONES.HAND, {
        IsCharacter: true,
      });

      const res = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(res.movedCards.length).toBe(1);
      expect(ec.zone).toBe(ZONES.BATTLEFIELD);
    });
  });

  describe("6. Condition Guards (Paralyzed & Set-Aside)", () => {
    test("6.1 Paralyzed card rejected from entering battle (via boolean or counter)", () => {
      const hero = createCard("hero_para", "Peter", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.TERRITORY, {
        IsCharacter: true,
        isParalyzed: true,
      });

      const resBool = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, hero.id);
      expect(resBool.movedCards.length).toBe(0);
      expect(resBool.error).toBe("Paralyzed cards cannot enter the Field of Battle!");
      expect(hero.zone).toBe(ZONES.TERRITORY);

      // Test via counter
      hero.isParalyzed = false;
      hero.counters.set("paralyze", 2);

      const resCounter = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, hero.id);
      expect(resCounter.movedCards.length).toBe(0);
      expect(resCounter.error).toBe("Paralyzed cards cannot enter the Field of Battle!");
      expect(hero.zone).toBe(ZONES.TERRITORY);
    });

    test("6.2 Set-Aside card rejected from entering battle (via boolean or counter)", () => {
      const hero = createCard("hero_sa", "John", CARD_TYPES.HERO, ALIGNMENTS.GOOD, "Silver", "p1", ZONES.TERRITORY, {
        IsCharacter: true,
        isSetAside: true,
      });

      const resBool = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, hero.id);
      expect(resBool.movedCards.length).toBe(0);
      expect(resBool.error).toBe("Cards in Set Aside cannot enter the Field of Battle!");
      expect(hero.zone).toBe(ZONES.TERRITORY);

      // Test via counter
      hero.isSetAside = false;
      hero.counters.set("setaside", 1);

      const resCounter = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, hero.id);
      expect(resCounter.movedCards.length).toBe(0);
      expect(resCounter.error).toBe("Cards in Set Aside cannot enter the Field of Battle!");
      expect(hero.zone).toBe(ZONES.TERRITORY);
    });
  });
});
