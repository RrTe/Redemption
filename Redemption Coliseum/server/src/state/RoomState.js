// server/state/RoomState.js
const { Schema, type, ArraySchema, MapSchema } = require("@colyseus/schema");
const { Card } = require("./Card");
const { PlayerState } = require("./PlayerState");

/**
 * RoomState enthält alle Spieler + globalen Zonen.
 */
class RoomState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.activePlayer = "";
    /**
     * @type {import('../../../shared/phases').Phase}
     */
    this.currentPhase = "";
    // ✨ NEU: Eine öffentliche "Bühne" für aufgedeckte Karten.
    // Änderungen hieran werden automatisch an alle Clients synchronisiert.
    this.revealedCards = new ArraySchema();
    // ✨ NEU: ID des Spielers, der eine öffentliche Aktion (Reveal, Search) auslöst.
    this.actionTakerId = "";
    // ✨ REFACTOR: Map für aktive Stapel-Sperren (pileId -> sessionId)
    this.activeActionPiles = new MapSchema(); 
    this.battlefield = new ArraySchema();
    // ✨ NEU: Game Over Status
    this.winnerId = "";
    this.gameOverReason = "";
  }
}

// Spieler (Map von PlayerState)
type({ map: PlayerState })(RoomState.prototype, "players");

// Aktiver Spieler und Phase
type("string")(RoomState.prototype, "activePlayer");
type("string")(RoomState.prototype, "currentPhase");

// Aufgedeckte Karten (Array von Card)
type([Card])(RoomState.prototype, "revealedCards");
type("string")(RoomState.prototype, "actionTakerId");
type({ map: "string" })(RoomState.prototype, "activeActionPiles"); // ✨ REFACTOR

// ✨ NEU: Game Over Status
type("string")(RoomState.prototype, "winnerId");
type("string")(RoomState.prototype, "gameOverReason");

// Battlefield (Array von Card)
type([Card])(RoomState.prototype, "battlefield");

module.exports = { RoomState };
