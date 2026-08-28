// server/tests/cardService.test.js
const { moveCard } = require("../src/services/cardService");
const { Card } = require("../src/state/Card");
const { PlayerState } = require("../src/state/PlayerState");
const { RoomState } = require("../src/state/RoomState");
const { ZONES } = require("../../shared/zones");

describe("cardService (moveCard)", () => {
  let player;
  let state;
  let cardLookup;
  let c1, c2;

  beforeEach(() => {
    // Erstelle einen sauberen Zustand für jeden Test
    player = new PlayerState();
    player.sessionId = "p1";

    state = new RoomState();
    state.players.set("p1", player);

    cardLookup = new Map();

    c1 = new Card();
    c1.id = "c1";
    c1.Name = "Feuerball";
    c1.controllerId = "p1";
    c1.originalOwnerId = "p1";
    c1.zone = ZONES.DECK;

    c2 = new Card();
    c2.id = "c2";
    c2.Name = "Krieger";
    c2.controllerId = "p1";
    c2.originalOwnerId = "p1";
    c2.zone = ZONES.DECK;

    player[ZONES.DECK].push(c1, c2);
    cardLookup.set(c1.id, c1);
    cardLookup.set(c2.id, c2);
  });

  // HINWEIS: Das direkte Ziehen vom Deck (ohne cardId) wird jetzt durch eine
  // spezielle Logik (_drawCardsWithLostSoulRule) gehandhabt und ist nicht mehr
  // Teil der generischen moveCard-Funktion. Wir testen daher ID-basierte Züge.

  test("sollte eine Karte von der Hand in den Ablagestapel verschieben", () => {
    // Setup: Eine Karte auf die Hand legen
    player[ZONES.HAND].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.HAND;

    moveCard(player, state, cardLookup, ZONES.HAND, ZONES.DISCARD, "c2");

    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.DISCARD].length).toBe(1);
    expect(player[ZONES.DISCARD][0].Name).toBe("Krieger");
    expect(c2.zone).toBe(ZONES.DISCARD);
  });

  test("sollte eine Karte vom Ablagestapel zurück auf die Hand verschieben", () => {
    // Setup: Eine Karte auf den Ablagestapel legen
    player[ZONES.DISCARD].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.DISCARD;

    moveCard(player, state, cardLookup, ZONES.DISCARD, ZONES.HAND, "c2");

    expect(player[ZONES.HAND].length).toBe(1);
    expect(player[ZONES.DISCARD].length).toBe(0);
    expect(c2.zone).toBe(ZONES.HAND);
  });

  test("sollte eine Karte von der Hand ins Territorium verschieben", () => {
    // Setup
    player[ZONES.HAND].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.HAND;

    moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "c2");

    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.TERRITORY].length).toBe(1);
    expect(c2.zone).toBe(ZONES.TERRITORY);
  });

  test("sollte eine Karte vom Deck unter den Stapel legen, wenn position: 'bottom' angegeben ist", () => {
    // Die Karte "Krieger" (c2) ist unten, "Feuerball" (c1) ist oben.
    // Wir bewegen "Feuerball" von oben nach ganz unten.
    moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DECK, "c1", 1, { position: "bottom" });

    expect(player[ZONES.DECK].length).toBe(2);
    expect(player[ZONES.DECK][0].Name).toBe("Krieger"); // "Krieger" ist jetzt oben
    expect(player[ZONES.DECK][1].Name).toBe("Feuerball"); // "Feuerball" ist jetzt unten
  });

  test("sollte eine Karte vom Deck in den Discard verschieben, wenn _clientViews aktiv sind", () => {
    const mockView = {
      add: jest.fn(),
      remove: jest.fn(),
    };
    state._clientViews = new Map();
    state._clientViews.set("p1", mockView);

    moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DISCARD, "c1");

    expect(player[ZONES.DECK].length).toBe(1);
    expect(player[ZONES.DISCARD].length).toBe(1);
    expect(player[ZONES.DISCARD][0].Name).toBe("Feuerball");
    expect(mockView.remove).toHaveBeenCalled();
    expect(mockView.add).toHaveBeenCalled();
  });

  describe("Reserve-Regeln (Runde 1)", () => {
    let r1;

    beforeEach(() => {
      state.round = 1;
      player.turn = 1;

      r1 = new Card();
      r1.id = "r1";
      r1.Name = "ReserveCard";
      r1.controllerId = "p1";
      r1.originalOwnerId = "p1";
      r1.zone = ZONES.RESERVE;

      player[ZONES.RESERVE].push(r1);
      cardLookup.set(r1.id, r1);
    });

    test("sollte in Runde 1 das Entnehmen einer Karte aus der Reserve blockieren", () => {
      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.RESERVE,
        ZONES.HAND,
        "r1"
      );

      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.RESERVE].length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(0);
      expect(r1.zone).toBe(ZONES.RESERVE);
    });

    test("sollte in Runde 1 das Ablegen einer Karte IN die Reserve erlauben", () => {
      // Karte c1 ist im Deck -> in Reserve verschieben
      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.DECK,
        ZONES.RESERVE,
        "c1"
      );

      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.RESERVE].length).toBe(2);
      expect(player[ZONES.DECK].length).toBe(1);
    });

    test("sollte ab Runde 2 das Entnehmen einer Karte aus der Reserve erlauben", () => {
      state.round = 2;
      player.turn = 2;

      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.RESERVE,
        ZONES.HAND,
        "r1"
      );

      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.RESERVE].length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(1);
      expect(player[ZONES.HAND][0].Name).toBe("ReserveCard");
    });
  });

  describe("Handlimit (MAX_HAND_SIZE = 16)", () => {
    test("sollte Kartenbewegungen in die Hand blockieren, wenn bereits 16 Karten auf der Hand liegen", () => {
      // 16 Dummy-Karten auf die Hand legen
      for (let i = 0; i < 16; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }
      expect(player[ZONES.HAND].length).toBe(16);

      // Versuch, c1 vom Deck auf die Hand zu ziehen per moveCard (ID-basiert)
      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, "c1");
      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(c1.zone).toBe(ZONES.DECK);
    });

    test("sollte beim Ziehen vom Deck bei 15 Karten nur 1 Karte ziehen (Multi-Draw Cap)", () => {
      // 15 Dummy-Karten auf die Hand
      for (let i = 0; i < 15; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }
      // 3 Karten im Deck
      const c3 = new Card();
      c3.id = "c3";
      c3.Name = "Schild";
      c3.controllerId = "p1";
      c3.originalOwnerId = "p1";
      c3.zone = ZONES.DECK;
      player[ZONES.DECK].push(c3);
      cardLookup.set(c3.id, c3);

      // Versuche 3 Karten vom Deck zu ziehen
      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, 0, 3);
      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(player[ZONES.DECK].length).toBe(2); // 2 Karten verbleiben im Deck
    });

    test("sollte das Ziehen komplett verweigern, wenn bereits 16 Karten auf der Hand sind", () => {
      for (let i = 0; i < 16; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }

      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(result.error).toBe("Hand limit reached (16/16)!");
    });
  });

  describe("Lost Soul und Zonen-Validierungsregeln", () => {
    test("sollte Lost Souls nur in erlaubte Zonen (Bondage, eigenes Deck, eigener Discard, gegnerisches Redemption) erlauben", () => {
      const ls = new Card();
      ls.id = "ls_1";
      ls.Name = "Lost Soul (Hopper)";
      ls.Type = "Lost Soul";
      ls.controllerId = "p1";
      ls.originalOwnerId = "p1";
      ls.zone = ZONES.HAND;
      player[ZONES.HAND].push(ls);
      cardLookup.set(ls.id, ls);

      // Versuch 1: Lost Soul ins eigene Territorium -> ungültig
      const resTerritory = moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "ls_1");
      expect(resTerritory.movedCards.length).toBe(0);
      expect(resTerritory.error).toBe("Invalid move for Lost Soul!");

      // Versuch 2: Lost Soul in eigenes Land of Bondage -> gültig
      const resBondage = moveCard(player, state, cardLookup, ZONES.HAND, ZONES.LAND_OF_BONDAGE, "ls_1");
      expect(resBondage.movedCards.length).toBe(1);
      expect(player[ZONES.LAND_OF_BONDAGE].length).toBe(1);

      // Versuch 3: Lost Soul aus Land of Bondage in eigenen Discard-Stapel -> gültig
      const resDiscard = moveCard(player, state, cardLookup, ZONES.LAND_OF_BONDAGE, ZONES.DISCARD, "ls_1");
      expect(resDiscard.movedCards.length).toBe(1);
      expect(player[ZONES.DISCARD].length).toBe(1);
    });

    test("sollte Kartenbewegungen auf gegnerische Pile-Zonen blockieren", () => {
      const opponent = new PlayerState();
      opponent.sessionId = "p2";
      state.players.set("p2", opponent);

      // Versuch, c1 (Besitzer p1) in gegnerisches Deck zu legen
      const res = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DECK, "c1", 1, { targetPlayerId: "p2" });
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Cannot move cards to opponent's pile!");
    });

    test("sollte das Bewegen von Karten aus dem Land of Redemption blockieren", () => {
      const redCard = new Card();
      redCard.id = "red_1";
      redCard.Name = "Redeemed Soul";
      redCard.controllerId = "p1";
      redCard.originalOwnerId = "p1";
      redCard.zone = ZONES.LAND_OF_REDEMPTION;
      player[ZONES.LAND_OF_REDEMPTION].push(redCard);
      cardLookup.set(redCard.id, redCard);

      const res = moveCard(player, state, cardLookup, ZONES.LAND_OF_REDEMPTION, ZONES.HAND, "red_1");
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Cards in Land of Redemption are permanent!");
    });
  });
});


