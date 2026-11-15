const { Encoder, Decoder, StateView } = require("@colyseus/schema");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { ZONES } = require("../../shared/zones");
const { CARD_TYPES } = require("../../shared/card-constants");
const {
  moveCard,
  shuffle,
  addAvailableAction,
} = require("../src/services/cardService");
const {
  RequestSearchPileCommand,
} = require("../src/commands/RequestSearchPileCommand");
const {
  ResolveSearchPileCommand,
} = require("../src/commands/ResolveSearchPileCommand");
const {
  RequestLookAtCardsCommand,
} = require("../src/commands/RequestLookAtCardsCommand");
const {
  RequestRevealCardsCommand,
} = require("../src/commands/RequestRevealCardsCommand");
const {
  ResolveRevealCommand,
} = require("../src/commands/ResolveRevealCommand");
const {
  DiscardFromDeckCommand,
} = require("../src/commands/DiscardFromDeckCommand");
const {
  MoveCardCommand,
} = require("../src/commands/MoveCardCommand");
const {
  MoveCardSnapshotHelper,
} = require("../src/commands/MoveCardSnapshotHelper");

const SYNC_BUFFER_SIZE = 512 * 1024;

function createCard(id, ownerId, opts = {}) {
  const card = new Card();
  card.id = id;
  card.templateId = opts.templateId || id;
  card.Name = opts.Name || `Card ${id}`;
  card.Type = opts.Type || "Hero";
  card.controllerId = ownerId;
  card.originalOwnerId = ownerId;
  card.zone = opts.zone || ZONES.DECK;
  return card;
}

function createColyseusHarness() {
  Encoder.BUFFER_SIZE = SYNC_BUFFER_SIZE;

  const state = new RoomState();
  state._clientViews = new Map();

  const p1State = new PlayerState();
  p1State.sessionId = "p1";
  p1State.name = "Player 1";

  const p2State = new PlayerState();
  p2State.sessionId = "p2";
  p2State.name = "Player 2";

  state.players.set("p1", p1State);
  state.players.set("p2", p2State);

  const encoder = new Encoder(state);
  const clients = new Map();

  const room = {
    state,
    cardLookup: new Map(),
    send: jest.fn(),
    broadcast: jest.fn(),
    broadcastGameLog: jest.fn(),
  };

  function makeMockClient(sessionId, playerName) {
    return {
      sessionId,
      userData: { playerName },
      send: jest.fn(),
    };
  }

  function populateDeck(ownerId, count, options = {}) {
    const owner = state.players.get(ownerId);
    for (let i = 0; i < count; i++) {
      const id = `${ownerId}_c${i + 1}`;
      const isLostSoul = options.lostSoulIndex === i;
      const card = createCard(id, ownerId, {
        Name: isLostSoul ? "Lost Soul" : `Hero ${i + 1}`,
        Type: isLostSoul ? CARD_TYPES.LOST_SOUL : "Hero",
        zone: ZONES.DECK,
      });
      owner.deck.push(card);
      room.cardLookup.set(card.id, card);
    }
  }

  function connectClient(sessionId) {
    const view = new StateView();
    state._clientViews.set(sessionId, view);

    const clientState = new RoomState();
    const decoder = new Decoder(clientState);

    const buffer = Buffer.allocUnsafe(SYNC_BUFFER_SIZE);
    const sharedIt = { offset: 0 };
    encoder.encodeAll(sharedIt, buffer);
    const fullBytes = Buffer.from(
      encoder.encodeAllView(view, sharedIt.offset, { ...sharedIt }, buffer),
    );
    decoder.decode(fullBytes);

    const handle = {
      sessionId,
      view,
      state: clientState,
      decoder,
      mockClient: makeMockClient(sessionId, sessionId.toUpperCase()),
    };
    clients.set(sessionId, handle);
    return handle;
  }

  function syncPatch() {
    if (!encoder.hasChanges) {
      for (const client of clients.values()) {
        if (client.view.changes.size > 0) {
          const it = { offset: 0 };
          const viewBytes = Buffer.from(encoder.encodeView(client.view, 0, it));
          client.decoder.decode(viewBytes);
        }
      }
      return;
    }

    const buffer = Buffer.allocUnsafe(SYNC_BUFFER_SIZE);
    const sharedIt = { offset: 0 };
    encoder.encode(sharedIt, undefined, buffer);
    const sharedOffset = sharedIt.offset;

    for (const client of clients.values()) {
      const viewBytes = Buffer.from(
        encoder.encodeView(
          client.view,
          sharedOffset,
          { offset: sharedOffset },
          buffer,
        ),
      );
      client.decoder.decode(viewBytes);
    }

    encoder.discardChanges();
  }

  function flushInitialChanges() {
    if (encoder.hasChanges) {
      encoder.discardChanges();
    }
  }

  function assertAllZonesInSync(ownerId) {
    const serverPlayer = state.players.get(ownerId);
    const zones = [
      ZONES.DECK,
      ZONES.HAND,
      ZONES.DISCARD,
      ZONES.RESERVE,
      ZONES.TERRITORY,
      ZONES.LAND_OF_BONDAGE,
    ];

    for (const [sessionId, client] of clients.entries()) {
      const clientPlayer = client.state.players.get(ownerId);
      expect(clientPlayer).toBeDefined();

      for (const zone of zones) {
        const serverIds = Array.from(serverPlayer[zone]).map((c) => c.id);
        const clientIds = Array.from(clientPlayer[zone]).map((c) => c.id);
        expect({
          client: sessionId,
          zone,
          length: clientIds.length,
          ids: clientIds,
        }).toEqual({
          client: sessionId,
          zone,
          length: serverIds.length,
          ids: serverIds,
        });
      }
    }
  }

  return {
    state,
    room,
    encoder,
    clients,
    populateDeck,
    connectClient,
    syncPatch,
    flushInitialChanges,
    assertAllZonesInSync,
  };
}

describe("Colyseus binary Encoder/Decoder deck synchronization", () => {
  test("repeated shuffle() calls keep server and both clients synchronized down to 0 cards", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 8);
    harness.connectClient("p1");
    harness.connectClient("p2");
    harness.flushInitialChanges();
    harness.assertAllZonesInSync("p1");

    // Repeated shuffles trigger both i !== j and i === j swaps in ArraySchema.
    for (let round = 0; round < 15; round++) {
      shuffle(harness.state.players.get("p1").deck);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    // Drain the deck card-by-card until completely empty.
    const p1 = harness.state.players.get("p1");
    for (let step = 0; step < 20 && p1.deck.length > 0; step++) {
      const prevLen = p1.deck.length;
      moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(p1.deck.length).toBeLessThan(prevLen);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    expect(p1.deck.length).toBe(0);
    // Simulate late reconnect while deck is empty.
    const lateP2 = harness.connectClient("p2_reconnected");
    expect(lateP2.state.players.get("p1").deck.length).toBe(0);
  });

  test("search deck + resolve (splice + shuffle in same tick) keeps clients synced to 0 cards", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 7);
    const c1 = harness.connectClient("p1");
    harness.connectClient("p2");
    harness.flushInitialChanges();

    const p1 = harness.state.players.get("p1");
    for (let step = 0; step < 20 && p1.deck.length > 0; step++) {
      const prevLen = p1.deck.length;
      const targetCard = p1.deck[0];
      new RequestSearchPileCommand(harness.room, c1.mockClient).execute({
        zone: ZONES.DECK,
      });
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");

      new ResolveSearchPileCommand(harness.room, c1.mockClient).execute({
        selectedCards: [{ id: targetCard.id }],
        toZone: ZONES.HAND,
      });
      expect(p1.deck.length).toBeLessThan(prevLen);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    expect(p1.deck.length).toBe(0);
    expect(harness.clients.get("p1").state.players.get("p1").deck.length).toBe(0);
    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
  });

  test("look at cards + resolve (splice + bottom + top unshift in same tick) stays synced", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 6);
    const c1 = harness.connectClient("p1");
    harness.connectClient("p2");
    harness.flushInitialChanges();

    const p1 = harness.state.players.get("p1");

    new RequestLookAtCardsCommand(harness.room, c1.mockClient).execute({
      zone: ZONES.DECK,
      count: 4,
      position: "top",
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    const topIds = Array.from(p1.deck)
      .slice(0, 4)
      .map((c) => c.id);

    new ResolveSearchPileCommand(harness.room, c1.mockClient).execute({
      selectedCards: [{ id: topIds[1] }],
      toZone: ZONES.HAND,
      remainingPositions: [
        { id: topIds[0], position: "top" },
        { id: topIds[2], position: "bottom" },
        { id: topIds[3], position: "top" },
      ],
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Repeat with bottom look and drain remainder.
    new RequestLookAtCardsCommand(harness.room, c1.mockClient).execute({
      zone: ZONES.DECK,
      count: 3,
      position: "bottom",
    });
    harness.syncPatch();

    const bottomIds = Array.from(p1.deck)
      .slice(-3)
      .map((c) => c.id);

    new ResolveSearchPileCommand(harness.room, c1.mockClient).execute({
      selectedCards: [],
      toZone: ZONES.HAND,
      remainingPositions: [
        { id: bottomIds[0], position: "top" },
        { id: bottomIds[1], position: "bottom" },
        { id: bottomIds[2], position: "top" },
      ],
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    for (let step = 0; step < 20 && p1.deck.length > 0; step++) {
      const prevLen = p1.deck.length;
      moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(p1.deck.length).toBeLessThan(prevLen);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    expect(harness.clients.get("p1").state.players.get("p1").deck.length).toBe(0);
    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
  });

  test("reveal cards + ResolveRevealCommand (slice + unshift/push) keeps both clients synced to 0", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 5);
    const c1 = harness.connectClient("p1");
    harness.connectClient("p2");
    harness.flushInitialChanges();

    const p1 = harness.state.players.get("p1");
    new RequestRevealCardsCommand(harness.room, c1.mockClient).execute({
      zone: ZONES.DECK,
      count: 3,
      position: "top",
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    new ResolveRevealCommand(harness.room, c1.mockClient).execute({
      cardPositions: [
        { id: "p1_c1", position: "bottom" },
        { id: "p1_c2", position: "top" },
        { id: "p1_c3", position: "top" },
      ],
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    for (let step = 0; step < 20 && p1.deck.length > 0; step++) {
      const prevLen = p1.deck.length;
      moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(p1.deck.length).toBeLessThan(prevLen);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
  });

  test("DiscardFromDeckCommand (top/bottom slice) drains deck to 0 cleanly on both clients", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 5);
    harness.connectClient("p1");
    const c2 = harness.connectClient("p2");
    harness.flushInitialChanges();

    const discardCmd = new DiscardFromDeckCommand(harness.room, c2.mockClient);
    discardCmd.execute({ targetPlayerId: "p1", count: 2, position: "top" });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    discardCmd.execute({ targetPlayerId: "p1", count: 2, position: "bottom" });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    discardCmd.execute({ targetPlayerId: "p1", count: 1, position: "top" });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    expect(harness.state.players.get("p1").deck.length).toBe(0);
    expect(harness.clients.get("p1").state.players.get("p1").deck.length).toBe(0);
    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
  });

  test("draw + Lost Soul diversion + undo to top + StateView action + staggered reconnect stays synced", () => {
    const harness = createColyseusHarness();
    harness.populateDeck("p1", 7, { lostSoulIndex: 2 });

    // Simulate P1 joining first, deck shuffled before P2 connects.
    const c1 = harness.connectClient("p1");
    harness.flushInitialChanges();

    const p1 = harness.state.players.get("p1");
    shuffle(p1.deck);
    harness.syncPatch();

    // P2 connects mid-setup (staggered join), creating asymmetric patch history.
    harness.connectClient("p2");
    harness.assertAllZonesInSync("p1");

    // Attach StateView action to a Hero on territory, return it to deck top, then shuffle.
    const targetHero = Array.from(p1.deck).find((c) => c.Type !== CARD_TYPES.LOST_SOUL);
    const moved = moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.TERRITORY, targetHero.id, 1);
    const fieldCard = moved.movedCards[0];
    const action = new CardAction();
    action.id = "act_1";
    action.type = "draw";
    action.description = "Draw 1";
    addAvailableAction(harness.state, fieldCard, action);
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Take snapshot, move back to deck top (unshift) and shuffle before late joiner.
    const snapshot = MoveCardSnapshotHelper.createSnapshot(fieldCard, ZONES.TERRITORY, p1);
    moveCard(p1, harness.state, harness.room.cardLookup, ZONES.TERRITORY, ZONES.DECK, fieldCard.id, 1, {
      position: "top",
      isUndo: true,
      snapshot,
    });
    shuffle(p1.deck);
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    const lateSpectator = harness.connectClient("p3_spectator");
    expect(lateSpectator.state.players.get("p1").deck.length).toBe(p1.deck.length);

    // Draw using MoveCardCommand and trigger Undo back to deck top.
    const drawCmd = new MoveCardCommand(harness.room, c1.mockClient);
    drawCmd.execute({ from: ZONES.DECK, to: ZONES.HAND, count: 1 });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");
    drawCmd.undo();
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Perform search + select Hero + shuffle after search.
    new RequestSearchPileCommand(harness.room, c1.mockClient).execute({
      zone: ZONES.DECK,
    });
    harness.syncPatch();

    new ResolveSearchPileCommand(harness.room, c1.mockClient).execute({
      selectedCards: [{ id: fieldCard.id }],
      toZone: ZONES.HAND,
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Draw all remaining cards (triggering Lost Soul diversion) until empty.
    for (let step = 0; step < 20 && p1.deck.length > 0; step++) {
      const prevLen = p1.deck.length;
      moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(p1.deck.length).toBeLessThan(prevLen);
      harness.syncPatch();
      harness.assertAllZonesInSync("p1");
    }

    expect(p1.deck.length).toBe(0);
    expect(harness.clients.get("p1").state.players.get("p1").deck.length).toBe(0);
    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
    expect(lateSpectator.state.players.get("p1").deck.length).toBe(0);
  });

  test("1-card deck reveal & Lost Soul multi-card undo on non-empty deck remain synchronized", () => {
    const harness = createColyseusHarness();
    const p1 = harness.state.players.get("p1");

    // Order top->bottom: [LostSoul, Hero1, Hero2, Hero3]
    const ls = createCard("ls_top", "p1", { Name: "Lost Soul", Type: CARD_TYPES.LOST_SOUL });
    const h1 = createCard("hero_1", "p1", { Name: "Hero 1" });
    const h2 = createCard("hero_2", "p1", { Name: "Hero 2" });
    const h3 = createCard("hero_3", "p1", { Name: "Hero 3" });
    p1.deck.push(ls, h1, h2, h3);
    [ls, h1, h2, h3].forEach((c) => harness.room.cardLookup.set(c.id, c));

    const c1 = harness.connectClient("p1");
    harness.connectClient("p2");
    harness.flushInitialChanges();

    // Draw 1 hits Lost Soul + draws replacement Hero1, leaving [Hero2, Hero3] in deck.
    const cmd = new MoveCardCommand(harness.room, c1.mockClient);
    cmd.execute({ from: ZONES.DECK, to: ZONES.HAND, count: 1 });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Undo returns BOTH Hero1 and LostSoul to deck top in the same tick.
    cmd.undo();
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");
    expect(Array.from(p1.deck).map((c) => c.id)).toEqual(["ls_top", "hero_1", "hero_2", "hero_3"]);

    // Reduce to a 1-card deck, reveal that 1 card, and resolve back to top.
    new DiscardFromDeckCommand(harness.room, c1.mockClient).execute({
      targetPlayerId: "p1",
      count: 3,
      position: "top",
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");
    expect(p1.deck.length).toBe(1);

    new RequestRevealCardsCommand(harness.room, c1.mockClient).execute({
      zone: ZONES.DECK,
      count: 1,
      position: "top",
    });
    harness.syncPatch();
    new ResolveRevealCommand(harness.room, c1.mockClient).execute({
      cardPositions: [{ id: "hero_3", position: "top" }],
    });
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");

    // Draw final card so deck hits 0 on server and all clients.
    moveCard(p1, harness.state, harness.room.cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
    harness.syncPatch();
    harness.assertAllZonesInSync("p1");
    expect(p1.deck.length).toBe(0);
    expect(harness.clients.get("p2").state.players.get("p1").deck.length).toBe(0);
  });
});
