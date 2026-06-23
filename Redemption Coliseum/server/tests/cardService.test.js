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
});
