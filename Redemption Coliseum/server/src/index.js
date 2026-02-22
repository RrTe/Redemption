require("dotenv").config(); // ✨ FIX: Muss ganz oben stehen, bevor andere Module geladen werden!
const http = require("http");
const express = require("express"); // ✨ NEU: Express für CORS
const cors = require("cors"); // ✨ NEU: CORS Paket
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GameRoom } = require("./rooms/GameRoom");
const { LobbyRoom } = require("./rooms/LobbyRoom"); // ✨ NEU: Hinzufügen

const logger = require("./utils/logger"); // <-- Logger importieren

const PORT = process.env.PORT || 2567;

// ✨ NEU: Express App erstellen und CORS konfigurieren
const app = express();
app.use(cors()); // Erlaubt Anfragen von überall (für den Start ok)
app.use(express.json());

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
// ✨ FIX: enableRealtimeListing() muss HIER aufgerufen werden, nicht im Raum selbst.
gameServer.define("game_room", GameRoom).enableRealtimeListing();
gameServer.define("lobby", LobbyRoom); // ✨ NEU: Hinzufügen

gameServer.listen(PORT, () => {
  logger.info(`Colyseus läuft: ws://localhost:${PORT}`);
});
