// server/state/PlayerState.js
const { Schema, type, ArraySchema, defineTypes } = require("@colyseus/schema");
const { Card } = require("./Card");
const { ZONES, ALL_ZONES } = require("../../../shared/zones");

/**
 * ✨ NEU: Ein Schema für den Kontext einer Kartensuche.
 */
class SearchContext extends Schema {
  constructor() {
    super();
    this.cards = new ArraySchema();
  }
}
/**
 * PlayerState speichert alle Zonen eines Spielers.
 * Nutzt die globale ZONES-Definition für Konsistenz.
 */
class PlayerState extends Schema {
  constructor() {
    super();
    this.redeemedSouls = 0;
    this.turn = 0;
    this.name = "Unknown Player"; // ✨ NEU: Spielername
    this.deckName = "Unknown Deck"; // ✨ NEU: Name des Decks

    // Initialisiere Arrays für alle Spieler-spezifischen Zonen
    for (const zone of ALL_ZONES) {
      this[zone] = new ArraySchema();
    }

    this.status = "playing"; // z.B. 'playing', 'searching'
    this.searchContext = new SearchContext();
    this.connected = true; // ✨ NEU: Standardmäßig verbunden
    this.ready = false; // ✨ NEU: Standardmäßig nicht bereit
  }
}

// Schema-Deklarationen für alle Spieler-Zonen
for (const zone of ALL_ZONES) {
  type([Card])(PlayerState.prototype, zone);
}

// Schema-Deklaration für die erlösten Seelen
type("number")(PlayerState.prototype, "redeemedSouls");

// Schema-Deklaration für den Zugzähler
type("number")(PlayerState.prototype, "turn");

// ✨ NEU: Schema für Namen
type("string")(PlayerState.prototype, "name");
type("string")(PlayerState.prototype, "deckName");

// ✨ NEU: Schema-Deklarationen für den Such-Status
type("string")(PlayerState.prototype, "status");
type(SearchContext)(PlayerState.prototype, "searchContext");

// ✨ NEU: Verbindungsstatus
type("boolean")(PlayerState.prototype, "connected");
type("boolean")(PlayerState.prototype, "ready"); // ✨ NEU

// ✨ NEU: Typ-Definitionen für die SearchContext-Klasse
defineTypes(SearchContext, {
  zone: "string",
  cards: [Card],
  originalOwnerId: "string", // ✨ NEU: Wessen Stapel wird durchsucht?
  isInteractive: "boolean", // ✨ NEU: War es eine interaktive Suche (true) oder nur ein "Look" (false)?
});

module.exports = { PlayerState };
