const colyseus = require("colyseus");
// ✨ Erhöhe die Puffergröße für den Schema-Encoder, um den "buffer overflow"-Fehler zu beheben.
const { Encoder } = require("@colyseus/schema");
Encoder.BUFFER_SIZE = 512 * 1024; // 512 KB
const fs = require("fs"); // ✨ NEU: Dateisystem-Zugriff
const path = require("path"); // ✨ NEU: Pfad-Operationen
const crypto = require("crypto"); // ✨ NEU: Für HMAC Signatur

// ✨ FIX: Secret Key aus Umgebungsvariablen laden (Sicherheit!)
const SECRET_KEY =
  process.env.SAVE_GAME_SECRET || "RedemptionColiseum_SuperSecretKey_2026";

const logger = require("../utils/logger");
const { Room } = require("@colyseus/core");
const { StateView } = require("@colyseus/schema");
const { logGameEvent } = require("../utils/gameLogger");
const { RoomState } = require("../state/RoomState");
const { Card } = require("../state/Card");
const { PlayerState } = require("../state/PlayerState");
const { moveCard, findCardById } = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");
const { cardDatabase } = require("../data/cardDatabase");
const { DeckService } = require("../services/DeckService");
const { CommandDispatcher } = require("../commands/CommandDispatcher");
const GameStateService = require("../services/GameStateService"); // ✨ FIX: Sicherer Import
const MatchService = require("../services/MatchService"); // ✨ NEU: MatchService
const RoomLifecycleService = require("../services/RoomLifecycleService"); // ✨ NEU
const GameLogService = require("../services/GameLogService"); // ✨ NEU
const CommandService = require("../services/CommandService"); // ✨ FIX: Fehlender Import
const { UndoManager } = require("../managers/UndoManager");

class GameRoom extends colyseus.Room {
  // ✨ SCHRITT 1.3: Importiere den neuen Service für die zukünftige Verwendung.
  phaseService = require("../services/phaseService");

  maxClients = 2;

  constructor() {
    super();

    // Delegation der DB-Initialisierung an den DeckService
    DeckService.initDatabase();

    // ✨ NEU: Chat-Historie speichern
    this.chatHistory = [];
  }

  // ✨ NEU: Zentrale Methode für Game-Logs (senden + speichern)
  broadcastGameLog(text) {
    GameLogService.broadcastGameLog(this, text);
  }

  onCreate(options) {
    this.startTime = Date.now(); // Startzeit speichern
    logGameEvent("started", { startedAt: this.startTime });

    this.setState(new RoomState());
    
    // ✨ DEBUG/BUGFIX: Zentrale View-Map für alle verbundenen Clients (für StateView)
    this.clientViews = new Map();
    this.state._clientViews = this.clientViews;

    // ✨ DEINE IDEE: Eine zentrale, nicht-synchronisierte Map für schnellen Kartenzugriff.
    this.cardLookup = new Map();

    // ✨ NEU: Map zum Zuordnen alter zu neuen Session-IDs beim Laden eines Spiels (für GameStateService)
    this.oldToNewSessionIdMap = new Map();
    this.savedPlayers = [];

    if (options.savedState) {
      logger.info(`[LOAD_GAME] savedState option found in onCreate.`);

      // ✨ FIX: Direkter Zugriff auf den Service, da wir den Export auf Default umgestellt haben
      if (typeof GameStateService.restoreState === "function") {
        GameStateService.restoreState(this, options.savedState, SECRET_KEY);
      } else {
        logger.error(
          `[LOAD_GAME_ERROR] restoreState not found! Check Export of GameStateService.`,
        );
      }

      logger.debug(
        `[LOAD_GAME] Restoration state check: phase='${this.state.currentPhase}', active='${this.state.activePlayer}', savedCount=${this.savedPlayers?.length || 0}`,
      );
    }

    // ✨ NEU: Set, um zu speichern, welche Clients fertig geladen haben.
    this.readyClients = new Set();

    // ✨ NEU: Metadaten für die Lobby setzen (Name des Raums)
    // Diese werden automatisch an den LobbyRoom übertragen.
    const roomName = options.roomName || `Game ${this.roomId}`;
    this.setMetadata({
      name: roomName,
    });

    // ✨ Dispatcher & UndoManager initialisieren und Commands registrieren
    this.undoManager = new UndoManager(this);
    this.dispatcher = new CommandDispatcher(this);
    CommandService.registerCommands(this);

    // ✨ FIX: Register empty ping handler to prevent "not registered" errors
    this.onMessage("ping", (client) => {});

    logger.info(`[GameRoom] Room created! roomId: ${this.roomId}`);

    this.onMessage("requestSaveGame", (client) => {
      const payload = {
        state: this.state.toJSON(),
        savedBySessionId: client.sessionId,
        chatHistory: this.chatHistory,
      };

      // ✨ NEU: Signiere die Daten, um Manipulation zu verhindern.
      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(payloadString)
        .digest("hex");

      const saveData = { data: payload, signature: signature };
      client.send("saveGameData", saveData);
    });

    // ✨ NEU: Handler für das "Ready"-Signal vom Client (nach dem Laden der Assets)
    this.onMessage("playerReady", (client) =>
      MatchService.handlePlayerReady(this, client),
    );
  }

  onDispose() {
    const finishedAt = Date.now();
    const durationSec = Math.floor((finishedAt - this.startTime) / 1000);

    logGameEvent("finished", {
      startedAt: this.startTime,
      finishedAt,
      duration: durationSec,
    });
  }

  onJoin(client, options) {
    // ✨ DEBUG/BUGFIX: Jedem Client seine eigene StateView geben
    const clientView = new StateView();
    client.view = clientView;
    this.clientViews.set(client.sessionId, clientView);

    RoomLifecycleService.handleJoin(this, client, options);

    client.send("undoStateChanged", {
      availableCount: this.undoManager ? this.undoManager.getAvailableUndoCount() : 0,
    });
  }

  async onLeave(client, consented) {
    
    await RoomLifecycleService.handleLeave(this, client, consented);
  }

  // ✨ NEU: Beendet das Spiel und setzt den Gewinner
  _endGame(winnerId, loserId, reason) {
    MatchService.endGame(this, winnerId, loserId, reason);
  }
}

module.exports = { GameRoom };
