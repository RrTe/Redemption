const {
  CombatRules,
  PhaseLockRule,
  SpecialInitiativeRule,
  ChronicleLockRule,
  ConditionGuardRule,
  AlignmentRoleRule,
  BlockerGateRule,
  BrigadeMatchRule,
  InitiativeRule,
} = require("../../../shared/rules/CombatRules.js");
const { ZONES } = require("../../../shared/zones.js");
const { PHASES } = require("../../../shared/phases.js");
const { CARD_TYPES, ALIGNMENTS } = require("../../../shared/card-constants.js");

describe("CombatRules (Isolated Pure Function Unit Tests)", () => {
  const p1 = "p1";
  const p2 = "p2";

  test("PhaseLockRule rejects non-battle moves to battlefield", () => {
    const ctx = {
      card: { Name: "Hero", Type: CARD_TYPES.HERO },
      toZone: ZONES.BATTLEFIELD,
      state: { currentPhase: PHASES.PREP },
    };
    expect(PhaseLockRule(ctx)).toEqual({ valid: false, error: "Only allowed during Battle!" });
    expect(PhaseLockRule({ ...ctx, state: { currentPhase: PHASES.BATTLE } })).toEqual({ valid: true });
    expect(PhaseLockRule({ ...ctx, isArena: true })).toEqual({ valid: true });
  });

  test("SpecialInitiativeRule allows only Enhancements", () => {
    const state = { battle: { specialInitiativePlayerId: p2 } };
    const goodEnh = { Name: "Sword", Type: CARD_TYPES.GE, Alignment: ALIGNMENTS.GOOD, IsEnhancement: true };
    const dominant = { Name: "Angel", Type: "Dominant" };
    const hero = { Name: "David", Type: CARD_TYPES.HERO };

    expect(SpecialInitiativeRule({ card: dominant, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: false, error: "Only Enhancements in Special Initiative!" });
    expect(SpecialInitiativeRule({ card: hero, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: false, error: "Only Enhancements in Special Initiative!" });
    expect(SpecialInitiativeRule({ card: goodEnh, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: true });
  });

  test("ChronicleLockRule blocks card play when abilities are unresolved", () => {
    const state = {
      currentPhase: PHASES.BATTLE,
      effectChronicle: { items: [{ id: "item1" }] },
    };
    const card = { Name: "Card" };
    expect(ChronicleLockRule({ card, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, state }))
      .toEqual({ valid: false, error: "Abilities must resolve first!" });
    expect(ChronicleLockRule({ card, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, state, options: { isAbilityAction: true } }))
      .toEqual({ valid: true });
  });

  test("ConditionGuardRule rejects Paralyzed and Set-Aside cards", () => {
    const state = { currentPhase: PHASES.BATTLE };
    const paralyzed = { Name: "P", isParalyzed: true };
    const setAside = { Name: "S", isSetAside: true };
    const normal = { Name: "N" };

    expect(ConditionGuardRule({ card: paralyzed, toZone: ZONES.BATTLEFIELD, state }))
      .toEqual({ valid: false, error: "Paralyzed cards cannot enter the Field of Battle!" });
    expect(ConditionGuardRule({ card: setAside, toZone: ZONES.BATTLEFIELD, state }))
      .toEqual({ valid: false, error: "Cards in Set Aside cannot enter the Field of Battle!" });
    expect(ConditionGuardRule({ card: normal, toZone: ZONES.BATTLEFIELD, state })).toEqual({ valid: true });
  });

  test("AlignmentRoleRule enforces attacker good and defender evil cards", () => {
    const state = { activePlayer: p1, currentPhase: PHASES.BATTLE };
    const evilChar = { Name: "Goliath", Type: CARD_TYPES.EC, Alignment: ALIGNMENTS.EVIL, IsCharacter: true };
    const hero = { Name: "David", Type: CARD_TYPES.HERO, Alignment: ALIGNMENTS.GOOD, IsCharacter: true };
    const site = { Name: "Site", Type: "Site" };
    const dominant = { Name: "Son of God", Type: "Dominant" };

    // Attacker tests
    expect(AlignmentRoleRule({ card: evilChar, toZone: ZONES.BATTLEFIELD, targetPlayerId: p1, state }))
      .toEqual({ valid: false, error: "Evil cards cannot attack!" });
    expect(AlignmentRoleRule({ card: site, toZone: ZONES.BATTLEFIELD, targetPlayerId: p1, state }))
      .toEqual({ valid: false, error: "Invalid card for battle!" });
    expect(AlignmentRoleRule({ card: dominant, toZone: ZONES.BATTLEFIELD, targetPlayerId: p1, state }))
      .toEqual({ valid: false, error: "Invalid card for battle!" });
    expect(AlignmentRoleRule({ card: hero, toZone: ZONES.BATTLEFIELD, targetPlayerId: p1, state }))
      .toEqual({ valid: true });

    // Defender tests
    expect(AlignmentRoleRule({ card: hero, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: false, error: "Good cards cannot block!" });
    expect(AlignmentRoleRule({ card: site, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: false, error: "Invalid card for battle!" });
    expect(AlignmentRoleRule({ card: dominant, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: false, error: "Invalid card for battle!" });
    expect(AlignmentRoleRule({ card: evilChar, toZone: ZONES.BATTLEFIELD, targetPlayerId: p2, state }))
      .toEqual({ valid: true });
  });

  test("BlockerGateRule requires Hero in battle to block", () => {
    const stateNoHero = { activePlayer: p1, battlefield: [] };
    const hero = { controllerId: p1, Type: CARD_TYPES.HERO, Alignment: ALIGNMENTS.GOOD, IsCharacter: true };
    const stateWithHero = { activePlayer: p1, battlefield: [hero] };
    const evilChar = { Name: "Goliath", Type: CARD_TYPES.EC, Alignment: ALIGNMENTS.EVIL, IsCharacter: true };

    expect(BlockerGateRule({ card: evilChar, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p2, state: stateNoHero }))
      .toEqual({ valid: false, error: "No Hero in battle to block!" });
    expect(BlockerGateRule({ card: evilChar, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p2, state: stateWithHero }))
      .toEqual({ valid: true });
  });

  test("BrigadeMatchRule verifies matching brigade for Enhancements", () => {
    const heroRed = { controllerId: p1, Type: CARD_TYPES.HERO, Brigade: "Red", IsCharacter: true };
    const enhRed = { Name: "GE1", Type: CARD_TYPES.GE, Brigade: "Red", IsEnhancement: true };
    const enhBlue = { Name: "GE2", Type: CARD_TYPES.GE, Brigade: "Blue", IsEnhancement: true };

    const stateNoHeroes = { activePlayer: p1, battlefield: [] };
    const stateRedHero = { activePlayer: p1, battlefield: [heroRed] };

    expect(BrigadeMatchRule({ card: enhRed, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateNoHeroes }))
      .toEqual({ valid: false, error: "No Hero in battle!" });
    expect(BrigadeMatchRule({ card: enhBlue, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateRedHero }))
      .toEqual({ valid: false, error: "Brigade mismatch!" });
    expect(BrigadeMatchRule({ card: enhRed, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateRedHero }))
      .toEqual({ valid: true });
  });

  test("InitiativeRule allows initial character and checks initiative for subsequent cards", () => {
    const hero1 = { Name: "David", Type: CARD_TYPES.HERO, IsCharacter: true, controllerId: p1 };
    const hero2 = { Name: "Jonathan", Type: CARD_TYPES.HERO, IsCharacter: true };

    const stateInitial = { activePlayer: p1, battlefield: [], battle: { initiativePlayerId: "" } };
    const stateHeroPresent = { activePlayer: p1, battlefield: [hero1], battle: { initiativePlayerId: p2 } };
    const stateWithInit = { activePlayer: p1, battlefield: [hero1], battle: { initiativePlayerId: p1 } };

    expect(InitiativeRule({ card: hero1, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateInitial }))
      .toEqual({ valid: true });
    expect(InitiativeRule({ card: hero2, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateHeroPresent }))
      .toEqual({ valid: false, error: "You do not have initiative!" });
    expect(InitiativeRule({ card: hero2, toZone: ZONES.BATTLEFIELD, fromZone: ZONES.HAND, targetPlayerId: p1, state: stateWithInit }))
      .toEqual({ valid: true });
  });
});
