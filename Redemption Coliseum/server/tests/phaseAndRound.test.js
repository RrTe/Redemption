const { handleEndTurn, isFirstRound } = require("../src/services/phaseService");
const MatchService = require("../src/services/MatchService");
const SearchHelper = require("../src/utils/SearchHelper");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { ZONES } = require("../../shared/zones");

describe("Phase & Round Service", () => {
  let room;
  let state;
  let client1;
  let client2;
  let player1;
  let player2;
  let cardLookup;

  beforeEach(() => {
    state = new RoomState();
    cardLookup = new Map();

    client1 = { sessionId: "p1", send: jest.fn(), userData: { playerName: "Player 1" } };
    client2 = { sessionId: "p2", send: jest.fn(), userData: { playerName: "Player 2" } };

    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Player 1";

    player2 = new PlayerState();
    player2.sessionId = "p2";
    player2.name = "Player 2";

    state.players.set("p1", player1);
    state.players.set("p2", player2);

    room = {
      roomId: "test-room",
      clients: [client1, client2],
      state,
      cardLookup,
      lock: jest.fn(),
      broadcastGameLog: jest.fn(),
      clock: { setTimeout: jest.fn() },
    };
  });

  describe("MatchService.initializeGame", () => {
    test("sollte round auf 1 und startingPlayerId initialisieren", () => {
      MatchService.initializeGame(room);

      expect(room.state.round).toBe(1);
      expect(room.state.startingPlayerId).toBeTruthy();
      expect(["p1", "p2"]).toContain(room.state.startingPlayerId);
      expect(room.state.activePlayer).toBe(room.state.startingPlayerId);
    });
  });

  describe("handleEndTurn & Round Progression", () => {
    test("sollte die Runde nach einem kompletten Durchlauf beider Spieler inkrementieren", () => {
      // Setup: Startspieler p1, Startrunde 1
      state.startingPlayerId = "p1";
      state.activePlayer = "p1";
      state.round = 1;
      player1.turn = 1;
      player2.turn = 0;

      // 1. Zugende von Spieler 1 -> Spieler 2 ist am Zug (immer noch Runde 1)
      handleEndTurn(state, [client1, client2], cardLookup);

      expect(state.activePlayer).toBe("p2");
      expect(player2.turn).toBe(1);
      expect(state.round).toBe(1);
      expect(isFirstRound(state)).toBe(true);

      // 2. Zugende von Spieler 2 -> Spieler 1 (Startspieler) ist wieder am Zug -> Runde 2!
      handleEndTurn(state, [client1, client2], cardLookup);

      expect(state.activePlayer).toBe("p1");
      expect(player1.turn).toBe(2);
      expect(state.round).toBe(2);
      expect(isFirstRound(state)).toBe(false);
    });
  });

  describe("SearchHelper.getPossibleActions (Reserve)", () => {
    test("sollte in Runde 1 keine Aktionen für die Reserve zurückgeben", () => {
      state.round = 1;
      const actions = SearchHelper.getPossibleActions(ZONES.RESERVE, state);
      expect(actions).toEqual([]);
    });

    test("sollte ab Runde 2 Entnahme-Aktionen für die Reserve zurückgeben", () => {
      state.round = 2;
      const actions = SearchHelper.getPossibleActions(ZONES.RESERVE, state);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.toZone === ZONES.HAND)).toBe(true);
      expect(actions.some((a) => a.toZone === ZONES.TERRITORY)).toBe(true);
    });

    test("sollte für das Deck auch in Runde 1 Entnahme-Aktionen zurückgeben", () => {
      state.round = 1;
      const actions = SearchHelper.getPossibleActions(ZONES.DECK, state);
      expect(actions.length).toBeGreaterThan(0);
    });
  });
});
