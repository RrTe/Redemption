// server/state/Card.js
const { Schema, type, MapSchema } = require("@colyseus/schema");

class Card extends Schema {
  constructor() {
    super();
    // ✨ KORREKTUR: Jedes im Schema definierte Feld muss im Konstruktor initialisiert werden,
    // um eine zuverlässige Synchronisation zu gewährleisten.
    this.id = "";
    this.controllerId = "";
    this.originalOwnerId = ""; // ✨ SCHRITT 1.1: Neues, unveränderliches Feld für den Besitzer.
    this.Name = "";
    this.Set = "";
    this.ImageFile = "";
    this.OfficialSet = "";
    this.Type = "";
    this.Brigade = "";
    this.Strength = "";
    this.Toughness = "";
    this.Class = "";
    this.Identifier = "";
    this.SpecialAbility = "";
    this.Rarity = "";
    this.Reference = "";
    this.Sound = "";
    this.Alignment = "";
    this.Legality = "";
    this.IsCharacter = false; // Boolean: true if card is a character
    this.IsEnhancement = false; // Boolean: true if card is an enhancement
    this.IsGospel = false; // Boolean: true if card belongs to the Gospel
    this.Testament = "";
    this.isTapped = false;
    this.isFaceDown = false;
    this.isFaceUp = false;
    this.isFlipped = false;
    this.notes = "";
    this.isToken = false; // ✨ NEU: Initialisierung für Token-Karten
    this.zone = "";
    this.lastMoved = 0; // ✨ Neue Eigenschaft für den Zeitstempel
    this.x = 0;
    this.y = 0;
    this.counters = new MapSchema();
    this.attachedTo = null; // ✨ NEU: ID der Karte, an die diese Karte angehängt ist
    this.inGameType = ""; // ✨ NEU: Typ für den aktuellen "Im Spiel"-Zustand
    this.inGameAlignment = ""; // ✨ NEU: Alignment für den aktuellen "Im Spiel"-Zustand
  }
}

type("string")(Card.prototype, "id");
type("string")(Card.prototype, "controllerId"); // ✨ SCHRITT 3: Umbenannt von ownerId, repräsentiert den aktuellen Controller.
type("string")(Card.prototype, "originalOwnerId"); // ✨ SCHRITT 1.1: Das neue, unveränderliche Feld für den Besitzer.
type("string")(Card.prototype, "Name");
type("string")(Card.prototype, "Set");
type("string")(Card.prototype, "ImageFile");
type("string")(Card.prototype, "OfficialSet");
type("string")(Card.prototype, "Type");
type("string")(Card.prototype, "Brigade");
type("string")(Card.prototype, "Strength");
type("string")(Card.prototype, "Toughness");
type("string")(Card.prototype, "Class");
type("string")(Card.prototype, "Identifier");
type("string")(Card.prototype, "SpecialAbility");
type("string")(Card.prototype, "Rarity");
type("string")(Card.prototype, "Reference");
type("string")(Card.prototype, "Sound");
type("string")(Card.prototype, "Alignment");
type("string")(Card.prototype, "Legality");
type("boolean")(Card.prototype, "IsCharacter");
type("boolean")(Card.prototype, "IsEnhancement");
type("boolean")(Card.prototype, "IsGospel");
type("string")(Card.prototype, "Testament");
type("boolean")(Card.prototype, "isTapped");
type("boolean")(Card.prototype, "isFaceDown");
type("boolean")(Card.prototype, "isFaceUp");
type("boolean")(Card.prototype, "isFlipped");
type("boolean")(Card.prototype, "isToken"); // ✨ NEU: Schema-Definition für isToken
type("string")(Card.prototype, "zone");
type("string")(Card.prototype, "notes");
type("number")(Card.prototype, "lastMoved"); // ✨ Schema-Typ deklarieren
type("number")(Card.prototype, "x");
type("number")(Card.prototype, "y");
type({ map: "number" })(Card.prototype, "counters");
type("string")(Card.prototype, "attachedTo"); // ✨ NEU: Schema-Definition für attachedTo
type("string")(Card.prototype, "inGameType"); // ✨ NEU: Typ für den aktuellen "Im Spiel"-Zustand
type("string")(Card.prototype, "inGameAlignment"); // ✨ NEU: Alignment für den aktuellen "Im Spiel"-Zustand

module.exports = { Card };
