// server/tests/conditionEvaluatorAdvantage.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ConditionEvaluator } = require("../src/ast/ConditionEvaluator");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { PhaseTransitionService } = require("../src/services/PhaseTransitionService");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { CardRepository } = require("../../shared/CardRepository");
const { cardDatabase } = require("../src/data/cardDatabase");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");

describe("ConditionEvaluator: Advantage, Turn, and Cost Conditions", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;

  beforeAll(() => {
    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
  });

  beforeEach(() => {
    state = new RoomState();
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.PREP;

    client1 = { sessionId: "p1", send: jest.fn() };
    client2 = { sessionId: "p2", send: jest.fn() };

    room = {
      roomId: "cond-eval-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
      phaseService: {
        advancePhase: jest.fn((st) => {
          st.activePlayer = st.activePlayer === "p1" ? "p2" : "p1";
          st.currentPhase = PHASES.DRAW;
          return { movedCards: [] };
        }),
      },
    };
  });

  function createCard(id, name, zone, ownerId, extra = {}) {
    const card = Object.assign(
      new Card(),
      {
        id,
        templateId: extra.templateId || id,
        Name: name,
        zone,
        ownerId,
        originalOwnerId: ownerId,
        controllerId: ownerId,
      },
      extra
    );
    room.cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  describe("1. board_advantage (all 6 real variants)", () => {
    test("counts in-play + set_aside + non-soul LoR cards and excludes Lost Souls / Redeemed Souls / hand", () => {
      const condNeb = AbilityLookup.getCardLogic("61588602").sides.top.abilities[1].conditions; // == "opponent"
      const condDepraved = AbilityLookup.getCardLogic("375985827").sides.top.abilities[1].conditions[1]; // < 0
      const condNineveh = AbilityLookup.getCardLogic("-949708643").sides.shared.abilities[1].conditions; // == (no value)

      const src = createCard("src_p1", "Source", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good" });
      createCard("sa_p2", "Set Aside Fortress", ZONES.SET_ASIDE, "p2", { Type: "Fortress" });
      createCard("hand_p1", "Hand Card", ZONES.HAND, "p1", { Type: "Hero" });
      createCard("ls_p1", "Lost Soul 1", ZONES.LAND_OF_BONDAGE, "p1", { Type: "Lost Soul" });
      createCard("lor_p1", "Redeemed Soul", ZONES.LAND_OF_REDEMPTION, "p1", { Type: "Lost Soul" });

      // p1 board: 1 (src_p1); p2 board: 1 (sa_p2) -> tie => false
      expect(ConditionEvaluator.evaluate(condNeb, { room, player: p1, card: src }).valid).toBe(false);
      expect(ConditionEvaluator.evaluate([condDepraved], { room, player: p1, card: src }).valid).toBe(false);
      expect(ConditionEvaluator.evaluate(condNineveh, { room, player: p1, card: src }).valid).toBe(false);

      // Give p2 a second board card in battlefield -> opponent has board advantage => true across all 3 variants
      createCard("bf_p2", "Blocker", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil" });
      expect(ConditionEvaluator.evaluate(condNeb, { room, player: p1, card: src }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate([condDepraved], { room, player: p1, card: src }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(condNineveh, { room, player: p1, card: src }).valid).toBe(true);
    });

    test("evaluates Outsiders (in_play except Lost Souls), Jethro (tie vs leader), and Eli the Judge (evil card advantage)", () => {
      const condOutsiders = AbilityLookup.getCardLogic("416866607").sides.top.abilities[1].conditions;
      const condJethro = AbilityLookup.getCardLogic("681205968").sides.top.abilities[0].conditions;
      const condEliJudge = AbilityLookup.getCardLogic("-227062172").sides.top.abilities[0].conditions;

      // Outsiders: ignores set_aside and Lost Souls; counts in_play
      createCard("sa_p2", "Set Aside", ZONES.SET_ASIDE, "p2", { Type: "Fortress" });
      createCard("ls_p2", "LS in Terr", ZONES.TERRITORY, "p2", { Type: "Lost Soul" });
      const ecSelf = createCard("ec_self", "Outsiders", ZONES.BATTLEFIELD, "p1", { Type: "Evil Character", Alignment: "Evil" });
      expect(ConditionEvaluator.evaluate(condOutsiders, { room, player: p1, card: ecSelf }).valid).toBe(false);

      createCard("h_p2_1", "Hero 1", ZONES.TERRITORY, "p2", { Type: "Hero", Alignment: "Good", Gender: "male", Testament: "OT" });
      createCard("h_p2_2", "Hero 2", ZONES.BATTLEFIELD, "p2", { Type: "Hero", Alignment: "Good", Gender: "male", Testament: "OT" });
      expect(ConditionEvaluator.evaluate(condOutsiders, { room, player: p1, card: ecSelf }).valid).toBe(true);

      // Jethro: OT male Hero in territory tie vs leader
      createCard("h_p1_ot", "David", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good", Gender: "male", Testament: "OT" });
      expect(ConditionEvaluator.evaluate(condJethro, { room, player: p1 }).valid).toBe(false); // 1 vs 1 in territory
      createCard("h_p1_ot2", "Solomon", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good", Gender: "male", Testament: "OT" });
      expect(ConditionEvaluator.evaluate(condJethro, { room, player: p1 }).valid).toBe(true); // 2 vs 1 in territory

      // Eli, the Judge: opponent evil card advantage in play (p1 has ec_self=1, p2 has 0 -> false; add 2 evil to p2 -> true)
      expect(ConditionEvaluator.evaluate(condEliJudge, { room, player: p1 }).valid).toBe(false);
      createCard("e_p2_1", "Evil 1", ZONES.TERRITORY, "p2", { Type: "Evil Character", Alignment: "Evil" });
      createCard("e_p2_2", "Evil 2", ZONES.TERRITORY, "p2", { Type: "Evil Character", Alignment: "Evil" });
      expect(ConditionEvaluator.evaluate(condEliJudge, { room, player: p1 }).valid).toBe(true);
    });
  });

  describe("2. play_advantage (in-play, battle initiative, and enhancements played this turn)", () => {
    test("1199649699 King Xerxes counts only cards in play (excludes set_aside and Lost Souls)", () => {
      const condXerxes = AbilityLookup.getCardLogic("1199649699").sides.top.abilities[1].conditions;
      createCard("sa_p2", "Set Aside", ZONES.SET_ASIDE, "p2", { Type: "Fortress" });
      createCard("ls_p2", "LS", ZONES.LAND_OF_BONDAGE, "p2", { Type: "Lost Soul" });
      const xerxes = createCard("xerxes", "Xerxes", ZONES.BATTLEFIELD, "p1", { Type: "Evil Character", Alignment: "Evil" });

      expect(ConditionEvaluator.evaluate(condXerxes, { room, player: p1, card: xerxes }).valid).toBe(false);

      createCard("h_p2_1", "Hero 1", ZONES.TERRITORY, "p2", { Type: "Hero", Alignment: "Good" });
      createCard("h_p2_2", "Hero 2", ZONES.BATTLEFIELD, "p2", { Type: "Hero", Alignment: "Good" });
      expect(ConditionEvaluator.evaluate(condXerxes, { room, player: p1, card: xerxes }).valid).toBe(true);
    });

    test("1853558370 / -966672416 evaluate initiative in battle and in-play advantage outside battle", () => {
      const condNameOfLord = AbilityLookup.getCardLogic("1853558370").sides.top.abilities[1].conditions;

      state.currentPhase = PHASES.BATTLE;
      state.battle.initiativePlayerId = "p2";
      expect(ConditionEvaluator.evaluate(condNameOfLord, { room, player: p1 }).valid).toBe(false);

      state.battle.initiativePlayerId = "p1";
      expect(ConditionEvaluator.evaluate(condNameOfLord, { room, player: p1 }).valid).toBe(true);

      // Outside battle with no initiative set -> pure REG play advantage (cards in play)
      state.currentPhase = PHASES.PREP;
      state.battle.initiativePlayerId = "";
      createCard("c_p1", "Hero 1", ZONES.TERRITORY, "p1", { Type: "Hero" });
      expect(ConditionEvaluator.evaluate(condNameOfLord, { room, player: p1 }).valid).toBe(true);
    });

    test("-804546233 Proud Pharisee tracks Enhancements played this turn across MoveCardCommand, Undo, and Turn End", () => {
      const condPharisee = AbilityLookup.getCardLogic("-804546233").sides.top.abilities[1].conditions;

      // Carried weapon from previous turn in territory must NOT block Proud Pharisee
      createCard("old_weapon", "Sword", ZONES.TERRITORY, "p1", {
        Type: "GE",
        Alignment: "Good",
        IsEnhancement: true,
      });
      expect(ConditionEvaluator.evaluate(condPharisee, { room, player: p1 }).valid).toBe(true);

      // Playing an enhancement via MoveCardCommand marks this turn as having played an enhancement
      state.currentPhase = PHASES.BATTLE;
      state.battle.initiativePlayerId = "p1";
      createCard("hero_bf", "Battle Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      const enhHand = createCard("enh_hand", "New Enh", ZONES.HAND, "p1", {
        Type: "GE",
        Alignment: "Good",
        IsEnhancement: true,
      });
      const moveEnh = new MoveCardCommand(room, client1);
      moveEnh.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: enhHand.id });
      expect(ConditionEvaluator.evaluate(condPharisee, { room, player: p1 }).valid).toBe(false);

      // Undo reverts turn play count
      moveEnh.undo();
      expect(ConditionEvaluator.evaluate(condPharisee, { room, player: p1 }).valid).toBe(true);

      // Re-play enhancement, then advance to next turn -> resets turn play tracking
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.TERRITORY, cardId: enhHand.id });
      expect(ConditionEvaluator.evaluate(condPharisee, { room, player: p1 }).valid).toBe(false);

      PhaseTransitionService.executePhaseAdvance(room, state, p1);
      expect(ConditionEvaluator.evaluate(condPharisee, { room, player: p1 }).valid).toBe(true);
    });
  });

  describe("3. redeemed_soul_advantage, lost_soul_advantage, is_turn_of, and was_cost_paid", () => {
    test("redeemed_soul_advantage evaluates < 0 (872731732) and == 'opponent' (1664898214)", () => {
      const condSow = [AbilityLookup.getCardLogic("872731732").sides.top.abilities[0].conditions[1]];
      const condPhinehas = AbilityLookup.getCardLogic("1664898214").sides.top.abilities[1].conditions;

      p1.redeemedSouls = 1;
      p2.redeemedSouls = 1;
      expect(ConditionEvaluator.evaluate(condSow, { room, player: p1 }).valid).toBe(false);
      expect(ConditionEvaluator.evaluate(condPhinehas, { room, player: p1 }).valid).toBe(false);

      // Opponent gains a Redeemed Soul in Land of Redemption
      createCard("lor_p2_1", "LS", ZONES.LAND_OF_REDEMPTION, "p2", { Type: "Lost Soul" });
      createCard("lor_p2_2", "LS 2", ZONES.LAND_OF_REDEMPTION, "p2", { Type: "Lost Soul" });
      expect(ConditionEvaluator.evaluate(condSow, { room, player: p1 }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(condPhinehas, { room, player: p1 }).valid).toBe(true);
    });

    test("lost_soul_advantage (1308914268 Alexander) counts Land of Bondage / captured humans and excludes non-humans and LoR", () => {
      const condAlex = AbilityLookup.getCardLogic("1308914268").sides.top.abilities[1].conditions;

      createCard("ls_p1", "LS 1", ZONES.LAND_OF_BONDAGE, "p1", { Type: "Lost Soul" });
      createCard("ls_p2", "LS 2", ZONES.LAND_OF_BONDAGE, "p2", { Type: "Lost Soul" });
      // Non-human captured character in LoB does NOT count as Lost Soul (REG line 3504); LoR does not count
      createCard("cap_angel", "Captured Angel", ZONES.LAND_OF_BONDAGE, "p2", { Type: "Hero", IsCharacter: true, IsHuman: false });
      createCard("lor_p2", "Rescued Soul", ZONES.LAND_OF_REDEMPTION, "p2", { Type: "Lost Soul" });
      expect(ConditionEvaluator.evaluate(condAlex, { room, player: p1 }).valid).toBe(false);

      // Captured human in opponent LoB DOES count as Lost Soul
      createCard("cap_human", "Captured Prophet", ZONES.LAND_OF_BONDAGE, "p2", { Type: "Hero", IsCharacter: true, IsHuman: true });
      expect(ConditionEvaluator.evaluate(condAlex, { room, player: p1 }).valid).toBe(true);
    });

    test("is_turn_of evaluates value: 1 (338958662) and value: true (1689524727) against activePlayer", () => {
      const condWanderer = [AbilityLookup.getCardLogic("338958662").sides.top.abilities[0].conditions[0]];
      const condNewBeg = AbilityLookup.getCardLogic("1689524727").sides.top.abilities[1].conditions;

      state.activePlayer = "p1";
      expect(ConditionEvaluator.evaluate(condWanderer, { room, player: p1 }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(condNewBeg, { room, player: p1 }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(condWanderer, { room, player: p2 }).valid).toBe(false);

      state.activePlayer = "p2";
      expect(ConditionEvaluator.evaluate(condWanderer, { room, player: p1 }).valid).toBe(false);
      expect(ConditionEvaluator.evaluate(condNewBeg, { room, player: p2 }).valid).toBe(true);
    });

    test("was_cost_paid (-293124111 Judith) evaluates explicit context, card._lastCostPaid, and boolean variants", () => {
      const condJudith = AbilityLookup.getCardLogic("-293124111").sides.top.abilities[1].conditions;
      const judith = createCard("judith_c", "-293124111", "Judith", ZONES.BATTLEFIELD, "p2");

      expect(ConditionEvaluator.evaluate(condJudith, { room, player: p2, card: judith }).valid).toBe(true);

      judith._lastCostPaid = true;
      expect(ConditionEvaluator.evaluate(condJudith, { room, player: p2, card: judith }).valid).toBe(false);
      expect(ConditionEvaluator.evaluate([{ condition_type: "was_cost_paid", operator: "==", value: true }], { room, player: p2, card: judith }).valid).toBe(true);
      expect(ConditionEvaluator.evaluate(condJudith, { room, player: p2, card: judith, wasCostPaid: false }).valid).toBe(true);
    });
  });
});
