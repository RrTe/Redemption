// server/tests/zoneTransferAst.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { AstEffectRunner } = require("../src/ast/AstEffectRunner");
const { ZoneTransferHandler } = require("../src/ast/handlers/ZoneTransferHandler");
const { BattleService } = require("../src/services/BattleService");
const { AST_ACTIONS, AST_SELECTION_MODES, AST_SCOPES } = require("../../shared/astConstants");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");
const { MAX_HAND_SIZE } = require("../../shared/card-constants");

describe("AST Zone Transfer Handlers (REG v11.0.0)", () => {
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
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    const lookupMap = new Map();
    room = {
      state,
      clients: [
        { sessionId: "p1", send: jest.fn() },
        { sessionId: "p2", send: jest.fn() },
      ],
      cardLookup: lookupMap,
      broadcast: jest.fn(),
      chatHistory: [],
    };
  });

  describe("1. Bounce / Return to Hand (REG line 1056)", () => {
    test("Bounces hero from battle to owner hand and recalculates battle", () => {
      const hero = createCard({
        id: "hero_1",
        Name: "Faithful Hero",
        Type: "Hero",
        Alignment: "Good",
        Strength: "7",
        Toughness: "7",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(hero.id, hero);
      state.battlefield.push(hero);

      BattleService.onCardEnteredBattle(room, p1, hero, ZONES.BATTLEFIELD);
      expect(state.battle.rescuerStrength).toBe(7);

      const ability = {
        ability_id: "ab_bounce_hero",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BOUNCE,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.BATTLE],
              target_type: "hero",
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: hero.id },
      });

      expect(result.handled).toBe(true);
      expect(p1.hand.length).toBe(1);
      expect(p1.hand[0].id).toBe("hero_1");
      expect(state.battlefield.length).toBe(0);
      expect(state.battle.rescuerStrength).toBe(0);
    });

    test("Self-bounce returns the card itself to owner hand", () => {
      const evilChar = createCard({
        id: "ec_flee",
        Name: "Hadad",
        Strength: "6",
        Toughness: "6",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(evilChar.id, evilChar);
      state.battlefield.push(evilChar);

      const ability = {
        ability_id: "ab_self_bounce",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BOUNCE,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF,
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p2,
        item: { cardId: evilChar.id },
      });

      expect(result.handled).toBe(true);
      expect(p2.hand.some((c) => c.id === "ec_flee")).toBe(true);
      expect(state.battlefield.some((c) => c.id === "ec_flee")).toBe(false);
    });
  });

  describe("2. Topdeck and Underdeck (REG line 2809)", () => {
    test("Topdeck places targeted card at index 0 of owner deck", () => {
      const topExisting = createCard({ id: "card_existing", Name: "Existing Deck Card", zone: ZONES.DECK });
      p1.deck.push(topExisting);
      room.cardLookup.set(topExisting.id, topExisting);

      const hero = createCard({
        id: "hero_td",
        Name: "Prophet",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      p1.territory.push(hero);
      room.cardLookup.set(hero.id, hero);

      const ability = {
        ability_id: "ab_topdeck",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.TOPDECK,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.TERRITORY],
              card_titles: ["Prophet"],
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: hero.id },
      });

      expect(result.handled).toBe(true);
      expect(p1.deck.length).toBe(2);
      expect(p1.deck[0].id).toBe("hero_td");
      expect(p1.deck[1].id).toBe("card_existing");
      expect(p1.territory.length).toBe(0);
    });

    test("Underdeck places targeted card at bottom of owner deck", () => {
      const topCard = createCard({ id: "card_top", Name: "Top Deck Card", zone: ZONES.DECK });
      p2.deck.push(topCard);
      room.cardLookup.set(topCard.id, topCard);

      const evilChar = createCard({
        id: "ec_ud",
        Name: "Invader",
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.TERRITORY,
      });
      p2.territory.push(evilChar);
      room.cardLookup.set(evilChar.id, evilChar);

      const ability = {
        ability_id: "ab_underdeck",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.UNDERDECK,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.TERRITORY],
              card_titles: ["Invader"],
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p2,
        item: { cardId: evilChar.id },
      });

      expect(result.handled).toBe(true);
      expect(p2.deck.length).toBe(2);
      expect(p2.deck[0].id).toBe("card_top");
      expect(p2.deck[1].id).toBe("ec_ud");
      expect(p2.territory.length).toBe(0);
    });
  });

  describe("3. Banish and Remove from Game (REG line 992)", () => {
    test("Banish moves target card to owner banish pile", () => {
      const artifact = createCard({
        id: "art_1",
        Name: "Golden Calf",
        Type: "Artifact",
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.TERRITORY,
      });
      p2.territory.push(artifact);
      room.cardLookup.set(artifact.id, artifact);

      const ability = {
        ability_id: "ab_banish",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BANISH,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.TERRITORY],
              target_type: "artifact",
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: "src_card" },
      });

      expect(result.handled).toBe(true);
      expect(p2.banish.length).toBe(1);
      expect(p2.banish[0].id).toBe("art_1");
      expect(p2.territory.length).toBe(0);
    });
  });

  describe("4. Hand Limit Overflow per REG line 1074", () => {
    test("Characters overflow to territory when hand is full", () => {
      for (let i = 0; i < MAX_HAND_SIZE; i++) {
        p1.hand.push(createCard({ id: `hand_card_${i}`, Name: `Card ${i}`, zone: ZONES.HAND }));
      }
      expect(p1.hand.length).toBe(MAX_HAND_SIZE);

      const hero = createCard({
        id: "hero_overflow",
        Name: "Returning Hero",
        Type: "Hero",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      state.battlefield.push(hero);
      room.cardLookup.set(hero.id, hero);

      const ability = {
        ability_id: "ab_bounce_overflow",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BOUNCE,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF,
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: hero.id },
      });

      expect(result.handled).toBe(true);
      expect(p1.hand.length).toBe(MAX_HAND_SIZE);
      expect(p1.territory.some((c) => c.id === "hero_overflow")).toBe(true);
      expect(state.battlefield.length).toBe(0);
    });

    test("Enhancements overflow to discard when hand is full", () => {
      for (let i = 0; i < MAX_HAND_SIZE; i++) {
        p1.hand.push(createCard({ id: `hand_card_${i}`, Name: `Card ${i}`, zone: ZONES.HAND }));
      }

      const enh = createCard({
        id: "ge_overflow",
        Name: "Holy Weapon",
        Type: "Good Enhancement",
        IsEnhancement: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      state.battlefield.push(enh);
      room.cardLookup.set(enh.id, enh);

      const ability = {
        ability_id: "ab_bounce_enh",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BOUNCE,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF,
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: enh.id },
      });

      expect(result.handled).toBe(true);
      expect(p1.hand.length).toBe(MAX_HAND_SIZE);
      expect(p1.discard.some((c) => c.id === "ge_overflow")).toBe(true);
    });
  });

  describe("5. Special Initiative & Chained Target Integration", () => {
    test("Trigger Special Initiative when opponent character in battle is targeted", () => {
      const evilChar = createCard({
        id: "ec_si",
        Name: "Defending Demon",
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      state.battlefield.push(evilChar);
      room.cardLookup.set(evilChar.id, evilChar);

      const ability = {
        ability_id: "ab_si_bounce",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BOUNCE,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.BATTLE],
              target_type: "evil_character",
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: "hero_src" },
      });

      expect(result.handled).toBe(true);
      expect(result.awaitingSpecialInitiative).toBe(true);
      expect(state.battle.specialInitiativePlayerId).toBe("p2");
    });

    test("Chained target propagates previous step target to zone transfer", () => {
      const hero = createCard({
        id: "hero_chained",
        Name: "Target Hero",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      p1.territory.push(hero);
      room.cardLookup.set(hero.id, hero);

      const ability = {
        ability_id: "ab_multi_step",
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.MODIFY_NUMBERS,
            strength_mod: 1,
            target: {
              selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
              scope: [AST_SCOPES.TERRITORY],
              card_titles: ["Target Hero"],
            },
          },
          {
            step: 2,
            action: AST_ACTIONS.UNDERDECK,
            target: {
              selection_mode: "chained_target",
              ref_step: 1,
            },
          },
        ],
      };

      const result = AstEffectRunner.runAbility(ability, {
        room,
        player: p1,
        item: { cardId: hero.id },
      });

      expect(result.handled).toBe(true);
      expect(p1.deck.some((c) => c.id === "hero_chained")).toBe(true);
      expect(p1.territory.length).toBe(0);
    });
  });
});
