const { MoveValidator } = require("../../../shared/rules/MoveValidator.js");
const { ZONES } = require("../../../shared/zones.js");
const { PHASES } = require("../../../shared/phases.js");
const { CARD_TYPES, ALIGNMENTS, MAX_HAND_SIZE } = require("../../../shared/card-constants.js");

describe("MoveValidator (Rule Engine Orchestrator Tests)", () => {
  const p1 = "p1";
  const p2 = "p2";

  test("bypasses all rules when options.isUndo is true", () => {
    const card = { Name: "Paralyzed Card", isParalyzed: true };
    const result = MoveValidator.validate({
      card,
      toZone: ZONES.BATTLEFIELD,
      state: { currentPhase: PHASES.PREP },
      options: { isUndo: true },
    });
    expect(result).toEqual({ valid: true });
  });

  test("supports both object context and positional arguments", () => {
    const card = { Name: "Hero", Type: CARD_TYPES.HERO, originalOwnerId: p1 };
    const state = { currentPhase: PHASES.BATTLE, activePlayer: p1, battlefield: [] };

    const resObj = MoveValidator.validate({
      card,
      state,
      cardControllerId: p1,
      targetPlayerId: p1,
      fromZone: ZONES.HAND,
      toZone: ZONES.BATTLEFIELD,
    });
    expect(resObj).toEqual({ valid: true });

    const resPos = MoveValidator.validate(card, state, p1, p1, ZONES.HAND, ZONES.BATTLEFIELD, {});
    expect(resPos).toEqual({ valid: true });
  });

  test("applies dual-card resolution using inGameType and inGameAlignment", () => {
    // A dual card that is Evil Character in print, but played as Good Hero via inGame options
    const dualCard = {
      Name: "Dual Card",
      Type: CARD_TYPES.EC,
      Alignment: ALIGNMENTS.EVIL,
      IsCharacter: true,
      originalOwnerId: p1,
    };
    const state = { currentPhase: PHASES.BATTLE, activePlayer: p1, battlefield: [] };

    // Without inGame options, Evil cards cannot attack:
    const failRes = MoveValidator.validate({
      card: dualCard,
      state,
      targetPlayerId: p1,
      toZone: ZONES.BATTLEFIELD,
    });
    expect(failRes).toEqual({ valid: false, error: "Evil cards cannot attack!" });

    // With inGame options: Good Hero, attacking is allowed:
    const passRes = MoveValidator.validate({
      card: dualCard,
      state,
      targetPlayerId: p1,
      toZone: ZONES.BATTLEFIELD,
      options: { inGameType: CARD_TYPES.HERO, inGameAlignment: ALIGNMENTS.GOOD },
    });
    expect(passRes).toEqual({ valid: true });
  });

  test("early exits on first failing rule", () => {
    const paralyzedHero = {
      Name: "Hero",
      Type: CARD_TYPES.HERO,
      isParalyzed: true,
      originalOwnerId: p1,
    };
    // If not in battle, PhaseLock fails before ConditionGuard:
    const resPhase = MoveValidator.validate({
      card: paralyzedHero,
      toZone: ZONES.BATTLEFIELD,
      state: { currentPhase: PHASES.PREP },
    });
    expect(resPhase.error).toBe("Only allowed during Battle!");

    // In battle, ConditionGuard fails:
    const resCond = MoveValidator.validate({
      card: paralyzedHero,
      toZone: ZONES.BATTLEFIELD,
      state: { currentPhase: PHASES.BATTLE },
    });
    expect(resCond.error).toBe("Paralyzed cards cannot enter the Field of Battle!");
  });

  test("handles Lost Souls as terminal checks", () => {
    const soul = { Name: "Lost Soul", Type: CARD_TYPES.LOST_SOUL, originalOwnerId: p1 };
    const players = new Map([[p1, { [ZONES.HAND]: new Array(MAX_HAND_SIZE) }]]);
    const state = { players };

    // Moving to Bondage is valid and terminates (doesn't check hand limit or other rules)
    const validRes = MoveValidator.validate({
      card: soul,
      toZone: ZONES.LAND_OF_BONDAGE,
      targetPlayerId: p1,
      state,
    });
    expect(validRes).toEqual({ valid: true });

    // Moving to Hand is invalid for Lost Soul
    const invalidRes = MoveValidator.validate({
      card: soul,
      toZone: ZONES.HAND,
      targetPlayerId: p1,
      state,
    });
    expect(invalidRes).toEqual({ valid: false, error: "Invalid move for Lost Soul!" });
  });
});
