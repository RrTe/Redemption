// server/tests/GameRoom.test.js
const { GameRoom, handleRequestSearchPile, handleResolveSearchPile, handleRequestLookAtCards, handleRequestRevealCards } = require("../rooms/GameRoom");
const { RoomState } = require("../state/RoomState");
const { PlayerState } = require("../state/PlayerState");
const { Card } = require("../state/Card");
const { ZONES } = require("../../shared/zones");

describe("GameRoom Actions", () => {
  let room;
  let player1;
  let player1State;
  let player2;

  beforeEach(() => {
    // Mock Colyseus Room
    room = { 
      state: new RoomState(), 
      send: jest.fn(),
      cardLookup: new Map() // Mock cardLookup direkt auf dem Raum
    };
    
    // Mock Clients
    player1 = { sessionId: "p1", send: jest.fn() };
    player2 = { sessionId: "p2", send: jest.fn() };

    // Create Player States
    player1State = new PlayerState();
    player1State.sessionId = "p1";
    const playerState2 = new PlayerState();
    playerState2.sessionId = "p2";

    // Add cards to player 1's deck
    const c1 = new Card();
    c1.id = "c1";
    c1.Name = "Angel";
    c1.controllerId = "p1"; // ✨ KORREKTUR: Controller-ID für den Test setzen.
    c1.zone = ZONES.DECK;

    const c2 = new Card();
    c2.id = "c2";
    c2.Name = "Sword";
    c2.controllerId = "p1"; // ✨ KORREKTUR: Controller-ID für den Test setzen.
    c2.zone = ZONES.DECK;

    const c3 = new Card();
    c3.id = "c3";
    c3.Name = "Shield";
    c3.controllerId = "p1";
    c3.zone = ZONES.DECK;

    const c4 = new Card();
    c4.id = "c4";
    c4.Name = "Helmet";
    c4.controllerId = "p1";
    c4.zone = ZONES.DECK;

    player1State.deck.push(c1, c2, c3, c4);

    room.state.players.set("p1", player1State);
    room.state.players.set("p2", playerState2);

    // Mock the cardLookup map
    room.cardLookup.set(c1.id, c1);
    room.cardLookup.set(c2.id, c2);
    room.cardLookup.set(c3.id, c3);
    room.cardLookup.set(c4.id, c4);
  });

  describe("requestSearchPile", () => {
    test("sollte einem Spieler erlauben, sein eigenes Deck zu durchsuchen", () => {
      // ✨ REFACTORING: Rufe die extrahierte, testbare Funktion direkt auf.
      handleRequestSearchPile(room, player1, { zone: ZONES.DECK });

      const p1State = room.state.players.get("p1");

      // 1. Überprüfen: Der Status des Spielers wurde auf "searching" gesetzt
      expect(p1State.status).toBe("searching");

      // 2. Überprüfen: Der Suchkontext wurde korrekt befüllt
      expect(p1State.searchContext.zone).toBe(ZONES.DECK); // Deck hat 4 Karten
      expect(p1State.searchContext.cards.length).toBe(4);
      expect(p1State.searchContext.cards[0].Name).toBe("Angel");

      // 3. Überprüfen: Eine private Nachricht wurde an den richtigen Spieler gesendet
      expect(player1.send).toHaveBeenCalledTimes(1);
      expect(player1.send).toHaveBeenCalledWith("presentPileSearchResult", {
        cards: [
          expect.objectContaining({ Name: "Angel" }),
          expect.objectContaining({ Name: "Sword" }),
          expect.objectContaining({ Name: "Shield" }),
          expect.objectContaining({ Name: "Helmet" }),
        ],
      });

      // 4. Überprüfen: Der andere Spieler hat keine Nachricht erhalten
      expect(player2.send).not.toHaveBeenCalled();
    });

    test("sollte eine ausgewählte Karte vom Deck auf die Hand verschieben und den Rest mischen", () => {
      // Phase 1: Suche starten (Setup für den eigentlichen Test)
      handleRequestSearchPile(room, player1, { zone: ZONES.DECK });
      expect(player1State.status).toBe("searching");
      expect(player1State.deck.length).toBe(4); // Deck ist noch unverändert

      // Phase 2: Suche auflösen
      handleResolveSearchPile(room, player1, {
        selectedCardIds: ["c1"], // Spieler wählt "Angel"
        toZone: ZONES.HAND,
      });

      // 1. Überprüfen: Spielerstatus wurde zurückgesetzt
      expect(player1State.status).toBe("playing");

      // 2. Überprüfen: Suchkontext wurde geleert
      expect(player1State.searchContext.cards.length).toBe(0);

      // 3. Überprüfen: Die Karte ist auf der Hand
      expect(player1State.hand.length).toBe(1);
      expect(player1State.hand[0].Name).toBe("Angel");
      expect(player1State.hand[0].zone).toBe(ZONES.HAND);

      // 4. Überprüfen: Die restlichen 3 Karten sind im Deck.
      // Da das Deck gemischt wird, prüfen wir nicht die genaue Reihenfolge,
      // sondern nur, ob die richtigen Karten noch vorhanden sind.
      expect(player1State.deck.length).toBe(3);
      expect(player1State.deck.map(c => c.Name)).toEqual(
        expect.arrayContaining(["Sword", "Shield", "Helmet"])
      );
    });
  });

  describe("requestLookAtCards", () => {
    test("sollte die obersten 2 Karten des Decks zum Anschauen bereitstellen", () => {
      // Aktion: Schaue die obersten 2 Karten an
      handleRequestLookAtCards(room, player1, { zone: ZONES.DECK, count: 2, position: 'top' });

      // 1. Überprüfen: Der Status des Spielers wurde auf "searching" gesetzt
      expect(player1State.status).toBe("searching");

      // 2. Überprüfen: Der Suchkontext enthält genau die 2 obersten Karten
      expect(player1State.searchContext.zone).toBe(ZONES.DECK);
      expect(player1State.searchContext.cards.length).toBe(2);
      expect(player1State.searchContext.cards[0].Name).toBe("Angel"); // Oberste Karte
      expect(player1State.searchContext.cards[1].Name).toBe("Sword"); // Zweitoberste Karte

      // 3. Überprüfen: Das Original-Deck ist unverändert
      expect(player1State.deck.length).toBe(4);

      // 4. Überprüfen: Eine private Nachricht wurde mit den 2 Karten gesendet
      expect(player1.send).toHaveBeenCalledTimes(1);
      expect(player1.send).toHaveBeenCalledWith("presentPileSearchResult", expect.objectContaining({
        cards: expect.any(Array)
      }));
      expect(player1.send.mock.calls[0][1].cards.length).toBe(2);
    });
  });

  describe("requestRevealCards", () => {
    test("sollte die oberste Karte des Decks für alle sichtbar aufdecken", () => {
      // Aktion: Decke die oberste Karte auf
      handleRequestRevealCards(room, player1, { zone: ZONES.DECK, count: 1 });

      // 1. Überprüfen: Das `revealedCards`-Array im State wurde befüllt.
      expect(room.state.revealedCards.length).toBe(1);

      // 2. Überprüfen: Die korrekte Karte wurde aufgedeckt.
      const revealedCard = room.state.revealedCards[0];
      expect(revealedCard.Name).toBe("Angel");
      // ✨ KORREKTUR: Ein Klon hat dieselbe ID, ist aber ein anderes Objekt.
      // Wir prüfen, ob das aufgedeckte Kartenobjekt nicht dasselbe Objekt ist wie das Original im Deck.
      expect(revealedCard).not.toBe(player1State.deck[0]);

      // 3. Überprüfen: Das Original-Deck ist unverändert.
      expect(player1State.deck.length).toBe(4);
    });
  });
});