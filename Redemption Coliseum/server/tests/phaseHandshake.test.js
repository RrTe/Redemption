const { NextPhaseCommand } = require("../src/commands/NextPhaseCommand");
const { TogglePhaseHandshakeCommand } = require("../src/commands/TogglePhaseHandshakeCommand");
const { RespondPhaseTransitionCommand } = require("../src/commands/RespondPhaseTransitionCommand");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");

describe("Bilateral Phase Transition Handshake", () => {
  let room;
  let client1;
  let client2;
  let player1;
  let player2;

  beforeEach(() => {
    room = {
      roomId: "test-room",
      state: new RoomState(),
      clients: [],
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
      cardLookup: new Map(),
      undoManager: { clear: jest.fn(), getAvailableUndoCount: () => 0 },
      phaseService: {
        advancePhase: jest.fn((state, player) => {
          if (state.currentPhase === PHASES.PREP) {
            state.currentPhase = PHASES.BATTLE;
          } else if (state.currentPhase === PHASES.BATTLE) {
            state.currentPhase = PHASES.DISCARD;
          }
          return null;
        }),
      },
      pendingPhaseTransition: null,
    };

    client1 = {
      sessionId: "p1",
      send: jest.fn(),
    };

    client2 = {
      sessionId: "p2",
      send: jest.fn(),
    };

    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Player 1";
    player1.turn = 1;
    room.state.players.set("p1", player1);

    player2 = new PlayerState();
    player2.sessionId = "p2";
    player2.name = "Player 2";
    player2.turn = 1;
    room.state.players.set("p2", player2);

    room.state.activePlayer = "p1";
    room.state.currentPhase = PHASES.PREP;
  });

  test("Solo Mode: directly advances phase when no opponent client exists", () => {
    room.clients = [client1];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute();

    expect(room.phaseService.advancePhase).toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.BATTLE);
    expect(client1.send).not.toHaveBeenCalledWith("phaseTransitionWaiting", expect.anything());
    expect(room.pendingPhaseTransition).toBeNull();
  });

  test("Multiplayer Default: directly advances phase when requireHandshake is false/omitted", () => {
    room.clients = [client1, client2];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute();

    expect(room.phaseService.advancePhase).toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.BATTLE);
    expect(room.pendingPhaseTransition).toBeNull();
  });

  test("Opponent Preference: initiates handshake if opponent has toggle enabled even when active player passes no flag", () => {
    room.clients = [client1, client2];

    const toggleCmd = new TogglePhaseHandshakeCommand(room, client2);
    toggleCmd.execute({ enabled: true });

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute();

    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(client2.send).toHaveBeenCalledWith("phaseTransitionPrompt", expect.anything());
  });

  test("Multiplayer Handshake: initiates waiting and prompt when requireHandshake is true", () => {
    room.clients = [client1, client2];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute({ requireHandshake: true });

    // Phase must NOT advance yet
    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.PREP);

    // Requester receives waiting state
    expect(client1.send).toHaveBeenCalledWith("phaseTransitionWaiting", {
      fromPhase: PHASES.PREP,
      toPhase: PHASES.BATTLE,
    });

    // Opponent receives confirmation prompt
    expect(client2.send).toHaveBeenCalledWith("phaseTransitionPrompt", {
      requestingPlayerId: "p1",
      requestingPlayerName: "Player 1",
      fromPhase: PHASES.PREP,
      toPhase: PHASES.BATTLE,
    });

    expect(room.pendingPhaseTransition).toEqual(
      expect.objectContaining({
        requestingPlayerId: "p1",
        fromPhase: PHASES.PREP,
        toPhase: PHASES.BATTLE,
      }),
    );
  });

  test("Multiplayer Handshake: requester cannot resolve own prompt", () => {
    room.clients = [client1, client2];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute({ requireHandshake: true });

    const respondCmd = new RespondPhaseTransitionCommand(room, client1); // Requester attempts to resolve
    respondCmd.execute({ accept: true });

    // Transition should still be pending and phase not advanced
    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(room.pendingPhaseTransition).not.toBeNull();
  });

  test("Opponent Declines ('Wait / React'): holds priority and closes dialogs without advancing phase", () => {
    room.clients = [client1, client2];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute({ requireHandshake: true });

    const respondCmd = new RespondPhaseTransitionCommand(room, client2);
    respondCmd.execute({ accept: false });

    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.PREP);
    expect(room.pendingPhaseTransition).toBeNull();

    expect(room.broadcast).toHaveBeenCalledWith("phaseTransitionResolved", {
      accepted: false,
      fromPhase: PHASES.PREP,
      toPhase: PHASES.BATTLE,
    });

    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Player 2 holds priority to react."),
    );
    expect(client1.send).toHaveBeenCalledWith("gameToast", {
      message: "Opponent holds priority to react.",
      type: "info",
    });
  });

  test("Opponent Accepts ('Pass'): advances phase and broadcasts resolved", () => {
    room.clients = [client1, client2];

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute({ requireHandshake: true });

    const respondCmd = new RespondPhaseTransitionCommand(room, client2);
    respondCmd.execute({ accept: true });

    expect(room.phaseService.advancePhase).toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.BATTLE);
    expect(room.pendingPhaseTransition).toBeNull();

    expect(room.broadcast).toHaveBeenCalledWith("phaseTransitionResolved", {
      accepted: true,
      fromPhase: PHASES.PREP,
      toPhase: PHASES.BATTLE,
    });
  });

  test("Battle Phase End: always enforces handshake even when requireHandshake and preferences are false", () => {
    room.clients = [client1, client2];
    room.state.currentPhase = PHASES.BATTLE;

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute({ requireHandshake: false });

    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(room.state.currentPhase).toBe(PHASES.BATTLE);
    expect(client1.send).toHaveBeenCalledWith("phaseTransitionWaiting", {
      fromPhase: PHASES.BATTLE,
      toPhase: PHASES.DISCARD,
    });
    expect(client2.send).toHaveBeenCalledWith(
      "phaseTransitionPrompt",
      expect.objectContaining({
        requestingPlayerId: "p1",
        fromPhase: PHASES.BATTLE,
        toPhase: PHASES.DISCARD,
      }),
    );
  });

  test("Battle Phase End: blocks nextPhase when Special Initiative is active", () => {
    room.clients = [client1, client2];
    room.state.currentPhase = PHASES.BATTLE;
    room.state.battle.specialInitiativePlayerId = "p1";

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute();

    expect(room.phaseService.advancePhase).not.toHaveBeenCalled();
    expect(room.pendingPhaseTransition).toBeNull();
  });

  test("Battle Phase End: accepting handshake cleans up surviving characters and enhancements via BattleService.reset", () => {
    room.clients = [client1, client2];
    room.state.currentPhase = PHASES.BATTLE;

    const hero = Object.assign(new Card(), {
      id: "hero-1",
      Name: "Hero",
      Type: "Hero",
      Brigade: "White",
      Strength: "5",
      Toughness: "5",
      controllerId: "p1",
      originalOwnerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });

    const enh = Object.assign(new Card(), {
      id: "enh-1",
      Name: "Enhancement",
      Type: "GE",
      Brigade: "White",
      Strength: "2",
      Toughness: "2",
      controllerId: "p1",
      originalOwnerId: "p1",
      zone: ZONES.BATTLEFIELD,
    });

    room.state.battlefield.push(hero, enh);
    room.cardLookup.set(hero.id, hero);
    room.cardLookup.set(enh.id, enh);

    const nextCmd = new NextPhaseCommand(room, client1);
    nextCmd.execute();

    expect(room.state.battlefield.length).toBe(2);

    const respondCmd = new RespondPhaseTransitionCommand(room, client2);
    respondCmd.execute({ accept: true });

    expect(room.state.currentPhase).toBe(PHASES.DISCARD);
    expect(room.state.battlefield.length).toBe(0);
    expect(player1.territory.map((c) => c.id)).toContain("hero-1");
    expect(player1.discard.map((c) => c.id)).toContain("enh-1");
  });
});
