const colyseus = require("colyseus");
const fs = require("fs"); // ✨ NEU
const path = require("path"); // ✨ NEU
const logger = require("../utils/logger"); // ✨ NEU: Logger importieren

class LobbyRoom extends colyseus.Room {
  onCreate(options) {
    logger.info("LobbyRoom created!", options); // ✨ FIX: Logger nutzen

    // ✨ NEU: Musik-Playlist initialisieren (Kopie aus GameRoom)
    this.musicTracks = [];
    try {
      // Pfad zum Musik-Ordner im Client-Projekt (relativ zum Server-Ordner)
      const musicDir = path.join(
        __dirname,
        "../../../client/public/assets/sounds/background",
      );
      if (fs.existsSync(musicDir)) {
        this.musicTracks = fs
          .readdirSync(musicDir)
          .filter((file) => file.endsWith(".mp3") || file.endsWith(".ogg"));
        logger.info(
          `[LobbyRoom] Found ${this.musicTracks.length} music tracks.`,
        );
      } else {
        logger.warn(`[LobbyRoom] Music directory not found at: ${musicDir}`);
      }
    } catch (err) {
      logger.error("[LobbyRoom] Error loading music tracks:", err);
    }

    // ✨ FIX: Handler muss im Raum registriert werden (onCreate), nicht am Client (onJoin).
    this.onMessage("requestMusic", (client) => {
      if (this.musicTracks.length > 0) {
        // Zufälliges Lied auswählen
        const randomTrack =
          this.musicTracks[Math.floor(Math.random() * this.musicTracks.length)];
        // Pfad relativ zum 'assets'-Ordner des Clients senden
        // ✨ FIX: Pfad angepasst auf 'background', passend zum musicDir oben
        const trackPath = `assets/sounds/background/${randomTrack}`;
        logger.info(
          `[LobbyMusic] Client ${client.sessionId} requested music. Sending: ${randomTrack}`,
        );
        client.send("playMusic", { path: trackPath, name: randomTrack });
      }
    });

    // Sende alle 2 Sekunden ein Update der Raumliste an alle verbundenen Clients
    this.clock.setInterval(() => {
      this.broadcastRoomList();
    }, 2000);
  }

  async onJoin(client, options) {
    logger.info("Client joined LobbyRoom:", client.sessionId);
    // Sofortiges Update für den neuen Client
    const rooms = await this.getRooms();
    client.send("rooms", rooms);
  }

  async getRooms() {
    // Frage den MatchMaker nach allen öffentlichen, nicht gesperrten "game_room" Räumen
    const rooms = await colyseus.matchMaker.query({
      name: "game_room",
      locked: false,
      private: false,
    });
    return rooms;
  }

  async broadcastRoomList() {
    const rooms = await this.getRooms();
    this.broadcast("rooms", rooms);
  }
}

module.exports = { LobbyRoom };
