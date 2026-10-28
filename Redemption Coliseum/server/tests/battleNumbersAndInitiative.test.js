// server/tests/battleNumbersAndInitiative.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { BattleCalculator } = require("../../shared/BattleCalculator");
const { BattleService } = require("../src/services/BattleService");
const { BATTLE_STATE_REASON } = require("../../shared/battleConstants");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");

describe("Battle Numbers & Regular Initiative Tracker (REG v11.0.0)", () => {
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
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Attacker (Rescuer)" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Defender (Blocker)" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    room = {
      state,
      clients: [{ sessionId: "p1" }, { sessionId: "p2" }],
    };
  });

  test("1. Unblocked Rescue Attempt: Hero enters battle, 0 blockers -> UNBLOCKED and no enhancement initiative", () => {
    const hero = createCard({
      id: "hero1",
      Name: "King David",
      IsCharacter: true,
      Strength: "8",
      Toughness: "6",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero);

    BattleService.onCardEnteredBattle(room, p1, hero, ZONES.BATTLEFIELD);

    expect(state.battle.rescuerStrength).toBe(8);
    expect(state.battle.rescuerToughness).toBe(6);
    expect(state.battle.blockerStrength).toBe(0);
    expect(state.battle.blockerToughness).toBe(0);
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.UNBLOCKED);
    expect(state.battle.initiativePlayerId).toBe("");
  });

  test("2. Blocker Removed: Blocker is discarded/withdrawn -> transitions to RESCUER_UNOPPOSED", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Peter",
      IsCharacter: true,
      Strength: "7",
      Toughness: "7",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const blocker = createCard({
      id: "ec1",
      Name: "Pharaoh",
      IsCharacter: true,
      Strength: "5",
      Toughness: "5",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero, blocker);
    BattleService.onCardEnteredBattle(room, p2, blocker, ZONES.BATTLEFIELD);

    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
    expect(state.battle.blockOccurred).toBe(true);

    // Blocker removed from battlefield
    state.battlefield.pop(); // remove blocker
    BattleService.recalculate(room);

    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.RESCUER_UNOPPOSED);
    expect(state.battle.blockerStrength).toBe(0);
    expect(state.battle.blockerToughness).toBe(0);
    expect(state.battle.initiativePlayerId).toBe("");
  });

  test("3. Hero Removed: All heroes removed from battle, blocker remains -> transitions to BLOCKER_UNOPPOSED", () => {
    const blocker = createCard({
      id: "ec1",
      Name: "Goliath",
      IsCharacter: true,
      Strength: "10",
      Toughness: "10",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(blocker);
    BattleService.recalculate(room);

    expect(state.battle.rescuerStrength).toBe(0);
    expect(state.battle.rescuerToughness).toBe(0);
    expect(state.battle.blockerStrength).toBe(10);
    expect(state.battle.blockerToughness).toBe(10);
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.BLOCKER_UNOPPOSED);
    expect(state.battle.initiativePlayerId).toBe("");
  });

  test("4. Losing by Numbers (Blocker losing): Hero 8/6 vs Blocker 4/4 -> Blocker receives initiative", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Mighty Warrior",
      IsCharacter: true,
      Strength: "8",
      Toughness: "6",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Weak Guard",
      IsCharacter: true,
      Strength: "4",
      Toughness: "4",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero, ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);

    // Hero (8/6) defeats Blocker (4/4) because 8 >= 4 and 4 < 6.
    // Blocker is losing -> Blocker (p2) gets initiative!
    expect(state.battle.rescuerStrength).toBe(8);
    expect(state.battle.rescuerToughness).toBe(6);
    expect(state.battle.blockerStrength).toBe(4);
    expect(state.battle.blockerToughness).toBe(4);
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
    expect(state.battle.initiativePlayerId).toBe("p2");
  });

  test("5. Losing by Numbers (Rescuer losing): Hero 5/5 vs Blocker 8/8 -> Rescuer receives initiative", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Small Hero",
      IsCharacter: true,
      Strength: "5",
      Toughness: "5",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Giant Warrior",
      IsCharacter: true,
      Strength: "8",
      Toughness: "8",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero, ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);

    // Blocker (8/8) defeats Hero (5/5) because 8 >= 5 and 5 < 8.
    // Rescuer is losing -> Rescuer (p1) gets initiative!
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
    expect(state.battle.initiativePlayerId).toBe("p1");
  });

  test("6. Stalemate (Patt): Neither side reaches toughness -> Player who did NOT play last card gets initiative", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Defensive Hero",
      IsCharacter: true,
      Strength: "5",
      Toughness: "10",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Defensive Blocker",
      IsCharacter: true,
      Strength: "4",
      Toughness: "8",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero);
    BattleService.onCardEnteredBattle(room, p1, hero, ZONES.BATTLEFIELD);

    state.battlefield.push(ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);

    // RS (5) < BT (8) and BS (4) < RT (10) -> Stalemate!
    // Defender (p2) played the last card -> Rescuer (p1) gets initiative!
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.STALEMATE);
    expect(state.battle.initiativePlayerId).toBe("p1");
    expect(state.battle.lastCardPlayedPlayerId).toBe("p2");
  });

  test("7. Stalemate Initiative Flip: Playing an enhancement that maintains stalemate flips initiative to opponent", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Defensive Hero",
      IsCharacter: true,
      Strength: "5",
      Toughness: "10",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Defensive Blocker",
      IsCharacter: true,
      Strength: "4",
      Toughness: "8",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero, ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);
    expect(state.battle.initiativePlayerId).toBe("p1");

    // Rescuer (p1) plays Good Enhancement (+2/+2) -> totals now 7/12 vs 4/8 (still stalemate!)
    const ge = createCard({
      id: "ge1",
      Name: "Shield of Faith",
      IsEnhancement: true,
      Strength: "2",
      Toughness: "2",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(ge);
    BattleService.onCardEnteredBattle(room, p1, ge, ZONES.BATTLEFIELD);

    expect(state.battle.rescuerStrength).toBe(7);
    expect(state.battle.rescuerToughness).toBe(12);
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.STALEMATE);
    // Since p1 played the last card, initiative flips to p2!
    expect(state.battle.lastCardPlayedPlayerId).toBe("p1");
    expect(state.battle.initiativePlayerId).toBe("p2");
  });

  test("8. Mutual Destruction: Both sides reach toughness -> Non-last-card player receives initiative", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Berserker Hero",
      IsCharacter: true,
      Strength: "8",
      Toughness: "6",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Deadly Beast",
      IsCharacter: true,
      Strength: "6",
      Toughness: "8",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero);
    BattleService.onCardEnteredBattle(room, p1, hero, ZONES.BATTLEFIELD);

    state.battlefield.push(ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);

    // RS (8) >= BT (8) and BS (6) >= RT (6) -> Mutual Destruction!
    // Defender (p2) played last card -> Rescuer (p1) receives initiative!
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.MUTUAL_DESTRUCTION);
    expect(state.battle.initiativePlayerId).toBe("p1");
  });

  test("9. Dominants do NOT affect last card played in battle tracker", () => {
    const hero = createCard({
      id: "hero1",
      Name: "Hero",
      IsCharacter: true,
      Strength: "5",
      Toughness: "10",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ec = createCard({
      id: "ec1",
      Name: "Blocker",
      IsCharacter: true,
      Strength: "4",
      Toughness: "8",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    state.battlefield.push(hero, ec);
    BattleService.onCardEnteredBattle(room, p2, ec, ZONES.BATTLEFIELD);

    expect(state.battle.lastCardPlayedPlayerId).toBe("p2");
    expect(state.battle.initiativePlayerId).toBe("p1");

    // Rescuer (p1) plays a Dominant (goes to DISCARD, not BATTLEFIELD)
    const domCard = createCard({
      id: "dom1",
      Name: "Son of God",
      inGameType: "Dominant",
      controllerId: "p1",
      zone: ZONES.DISCARD,
    });
    BattleService.onCardEnteredBattle(room, p1, domCard, ZONES.DISCARD);

    // Tracker must NOT change!
    expect(state.battle.lastCardPlayedPlayerId).toBe("p2");
    expect(state.battle.initiativePlayerId).toBe("p1");
  });

  test("10. Banding & Cumulative Values: Multi-character band + enhancements summation", () => {
    const hero1 = createCard({
      id: "h1",
      Name: "Hero A",
      IsCharacter: true,
      Strength: "5",
      Toughness: "5",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const hero2 = createCard({
      id: "h2",
      Name: "Hero B",
      IsCharacter: true,
      Strength: "4",
      Toughness: "4",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    const ge = createCard({
      id: "ge1",
      Name: "Sword",
      IsEnhancement: true,
      Strength: "3",
      Toughness: "3",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });

    const ec1 = createCard({
      id: "ec1",
      Name: "Evil A",
      IsCharacter: true,
      Strength: "6",
      Toughness: "6",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    const ec2 = createCard({
      id: "ec2",
      Name: "Evil B",
      IsCharacter: true,
      Strength: "5",
      Toughness: "5",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });
    const ee = createCard({
      id: "ee1",
      Name: "Dark Spear",
      IsEnhancement: true,
      Strength: "2",
      Toughness: "2",
      controllerId: "p2",
      zone: ZONES.BATTLEFIELD,
    });

    state.battlefield.push(hero1, hero2, ge, ec1, ec2, ee);
    BattleService.recalculate(room);

    // Rescuer: 5+4+3 = 12 Str, 5+4+3 = 12 Tough
    // Blocker: 6+5+2 = 13 Str, 6+5+2 = 13 Tough
    expect(state.battle.rescuerStrength).toBe(12);
    expect(state.battle.rescuerToughness).toBe(12);
    expect(state.battle.blockerStrength).toBe(13);
    expect(state.battle.blockerToughness).toBe(13);
    // 13 >= 12, so Blocker defeats Rescuer. 12 < 13, so Rescuer does not defeat Blocker.
    // Rescuer is losing -> Rescuer has initiative!
    expect(state.battle.stateReason).toBe(BATTLE_STATE_REASON.LOSING_NUMBERS);
    expect(state.battle.initiativePlayerId).toBe("p1");
  });

  test("11. Counter Modifiers: Dynamic strength and toughness counters apply correctly", () => {
    const hero = createCard({
      id: "h1",
      Name: "Buffed Hero",
      IsCharacter: true,
      Strength: "6",
      Toughness: "6",
      controllerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });
    hero.counters.set("strength", 4);
    hero.counters.set("toughness", -2);

    state.battlefield.push(hero);
    BattleService.recalculate(room);

    // 6 + 4 = 10 Strength, 6 - 2 = 4 Toughness
    expect(state.battle.rescuerStrength).toBe(10);
    expect(state.battle.rescuerToughness).toBe(4);
  });
});
