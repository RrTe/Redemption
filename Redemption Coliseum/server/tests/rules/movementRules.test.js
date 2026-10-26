const {
  MovementRules,
  LostSoulMovementRule,
  ForeignPileRule,
  ReserveFirstRoundRule,
  HandLimitRule,
} = require("../../../shared/rules/MovementRules.js");
const { ZONES } = require("../../../shared/zones.js");
const { CARD_TYPES, MAX_HAND_SIZE } = require("../../../shared/card-constants.js");

describe("MovementRules (Isolated Pure Function Unit Tests)", () => {
  const p1 = "p1";
  const p2 = "p2";

  describe("LostSoulMovementRule", () => {
    const lostSoul = { Name: "Lost Soul", Type: CARD_TYPES.LOST_SOUL, originalOwnerId: p1, controllerId: p1 };
    const hero = { Name: "Hero", Type: CARD_TYPES.HERO, originalOwnerId: p1 };

    test("passes non-Lost Soul cards automatically", () => {
      expect(LostSoulMovementRule({ card: hero, toZone: ZONES.HAND })).toEqual({ valid: true });
    });

    test("allows moving Lost Soul to Land of Bondage", () => {
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.LAND_OF_BONDAGE, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.LAND_OF_BONDAGE, targetPlayerId: p2 })).toEqual({ valid: true });
    });

    test("allows moving Lost Soul to own Deck or Discard", () => {
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.DECK, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.DISCARD, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.DECK, targetPlayerId: p2 })).toEqual({ valid: false, error: "Invalid move for Lost Soul!" });
    });

    test("allows rescue move to opponent Redemption only from Land of Bondage", () => {
      const validRescue = {
        card: lostSoul,
        toZone: ZONES.LAND_OF_REDEMPTION,
        fromZone: ZONES.LAND_OF_BONDAGE,
        targetPlayerId: p2,
        cardControllerId: p1,
      };
      expect(LostSoulMovementRule(validRescue)).toEqual({ valid: true });

      const invalidRescue = { ...validRescue, fromZone: ZONES.HAND };
      expect(LostSoulMovementRule(invalidRescue)).toEqual({ valid: false, error: "Invalid move for Lost Soul!" });
    });

    test("rejects invalid Lost Soul moves like Hand or Territory", () => {
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.HAND, targetPlayerId: p1 })).toEqual({ valid: false, error: "Invalid move for Lost Soul!" });
      expect(LostSoulMovementRule({ card: lostSoul, toZone: ZONES.TERRITORY, targetPlayerId: p1 })).toEqual({ valid: false, error: "Invalid move for Lost Soul!" });
    });
  });

  describe("ForeignPileRule", () => {
    const cardP1 = { Name: "Card", originalOwnerId: p1 };

    test("allows placement in own piles", () => {
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.DECK, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.DISCARD, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.RESERVE, targetPlayerId: p1 })).toEqual({ valid: true });
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.BANISH, targetPlayerId: p1 })).toEqual({ valid: true });
    });

    test("rejects placement in opponent piles", () => {
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.DECK, targetPlayerId: p2 }))
        .toEqual({ valid: false, error: "Cannot move cards to opponent's pile!" });
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.DISCARD, targetPlayerId: p2 }))
        .toEqual({ valid: false, error: "Cannot move cards to opponent's pile!" });
    });

    test("allows non-pile zones regardless of target player", () => {
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.TERRITORY, targetPlayerId: p2 })).toEqual({ valid: true });
      expect(ForeignPileRule({ card: cardP1, toZone: ZONES.HAND, targetPlayerId: p2 })).toEqual({ valid: true });
    });
  });

  describe("ReserveFirstRoundRule", () => {
    test("blocks taking cards from Reserve in round 1", () => {
      const stateRound1 = { round: 1 };
      expect(ReserveFirstRoundRule({ fromZone: ZONES.RESERVE, toZone: ZONES.HAND, state: stateRound1 }))
        .toEqual({ valid: false, error: "Cannot take cards from Reserve in Round 1!" });
    });

    test("allows reordering within Reserve in round 1", () => {
      const stateRound1 = { round: 1 };
      expect(ReserveFirstRoundRule({ fromZone: ZONES.RESERVE, toZone: ZONES.RESERVE, state: stateRound1 }))
        .toEqual({ valid: true });
    });

    test("allows taking cards from Reserve in round 2+", () => {
      const stateRound2 = { round: 2 };
      expect(ReserveFirstRoundRule({ fromZone: ZONES.RESERVE, toZone: ZONES.HAND, state: stateRound2 }))
        .toEqual({ valid: true });
    });
  });

  describe("HandLimitRule", () => {
    test("allows move to Hand when limit is not reached", () => {
      const players = new Map();
      players.set(p1, { [ZONES.HAND]: new Array(MAX_HAND_SIZE - 1) });
      const state = { players };

      expect(HandLimitRule({ toZone: ZONES.HAND, targetPlayerId: p1, state })).toEqual({ valid: true });
    });

    test("blocks move to Hand when limit is reached", () => {
      const players = new Map();
      players.set(p1, { [ZONES.HAND]: new Array(MAX_HAND_SIZE) });
      const state = { players };

      expect(HandLimitRule({ toZone: ZONES.HAND, targetPlayerId: p1, state }))
        .toEqual({ valid: false, error: `Hand limit reached (${MAX_HAND_SIZE}/${MAX_HAND_SIZE})!` });
    });
  });
});
