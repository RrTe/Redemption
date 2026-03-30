import { Client, type Room, type RoomAvailable } from "colyseus.js";
import Phaser from "phaser";
import { log, error } from "../utils/logger";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager";
import { type DeckData } from "../utils/DeckUtils";

export class LobbyNetworkManager {
  private client!: Client;
  private lobbyRoom?: Room;
  private scene: Phaser.Scene;
  public endpoint!: string;
  public httpEndpoint!: string;
  private soundManager: SoundManager;

  // Callbacks für UI-Updates
  public onRoomsUpdated?: (rooms: RoomAvailable[]) => void;
  public onGameJoined?: (room: TypedRoom) => void;
  public onStatusChange?: (status: string) => void;
  public onPlayMusic?: (data: { path: string; name: string }) => void;
  public onMusicRequest?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initializeClient();
  }

  private initializeClient() {
    const protocol = window.location.protocol.replace("http", "ws");
    const port = window.location.port ? `:${window.location.port}` : "";
    let serverPort = port;

    // Dev-Port Logik
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      port === ":5173"
    ) {
      serverPort = ":2567";
    }

    this.endpoint = `${protocol}//${window.location.hostname}${serverPort}`;

    // Prod-URL Logik (Beispiel)
    if (window.location.hostname.includes("vercel.app")) {
      this.endpoint = "wss://redemptionctcg-server.onrender.com";
    }

    this.httpEndpoint = this.endpoint
      .replace("wss", "https")
      .replace("ws", "http");

    log("LobbyNetwork", "Initializing Client with endpoint:", this.endpoint);
    this.client = new Client(this.endpoint);
  }

  public async connectToLobby() {
    try {
      this.onStatusChange?.("Joining Lobby...");
      this.lobbyRoom = await this.client.joinOrCreate("lobby");

      log("LobbyNetwork", "Joined Lobby Room successfully.");
      this.onStatusChange?.("Ready");

      this.lobbyRoom.onMessage("rooms", (rooms: RoomAvailable[]) => {
        log("LobbyNetwork", "Received rooms update", rooms);

        // ✨ NEU: Filtere den Raum aus, für den wir eine aktive Sitzung haben
        const activeRoomId = localStorage.getItem("reconnectionRoomId");
        const filteredRooms = activeRoomId
          ? rooms.filter((r) => r.roomId !== activeRoomId)
          : rooms;

        this.onRoomsUpdated?.(filteredRooms);
      });

      // Musik-Handler
      this.lobbyRoom.onMessage(
        "playMusic",
        (message: { path: string; name: string }) => {
          this.onPlayMusic?.(message);
        },
      );

      this.onMusicRequest?.();
    } catch (e: any) {
      error("LobbyNetwork", "Failed to connect to lobby:", e);
      this.onStatusChange?.("Lobby Error: " + e.message);
    }
  }

  public requestNextMusic() {
    log("LobbyNetwork", "Requesting next music track from server.");
    this.lobbyRoom?.send("requestMusic");
  }

  public async createGame(options: {
    playerName: string;
    deck: DeckData;
    savedState?: any;
  }) {
    try {
      const roomOptions = {
        roomName: `${options.playerName}'s Game`,
        deck: options.deck,
        playerName: options.playerName,
        deckName: options.deck.name || "Random Deck",
        savedState: options.savedState,
      };

      const room = await this.client.create("game_room", roomOptions);
      this.handleJoinSuccess(room as TypedRoom);
    } catch (e: any) {
      throw e; // Fehler an UI weitergeben
    }
  }

  public async joinGame(
    roomId: string,
    options: { playerName: string; deck: DeckData },
  ) {
    try {
      const joinOptions = {
        deck: options.deck,
        playerName: options.playerName,
        deckName: options.deck.name || "Random Deck",
      };
      const room = await this.client.joinById(roomId, joinOptions);
      this.handleJoinSuccess(room as TypedRoom);
    } catch (e: any) {
      throw e;
    }
  }

  public async reconnectToGame(token: string) {
    try {
      const room = await this.client.reconnect(token);
      this.handleJoinSuccess(room as TypedRoom);
    } catch (e: any) {
      throw e;
    }
  }

  public hasActiveSession(): boolean {
    return !!localStorage.getItem("reconnectionToken");
  }

  public clearSession() {
    localStorage.removeItem("reconnectionToken");
    localStorage.removeItem("reconnectionRoomId");
  }

  private handleJoinSuccess(room: TypedRoom) {
    // Token speichern
    localStorage.setItem("reconnectionToken", room.reconnectionToken);
    localStorage.setItem("reconnectionRoomId", room.roomId); // ✨ NEU: RoomId für Filterung merken
    // Lobby verlassen
    this.lobbyRoom?.leave();
    // Callback feuern
    this.onGameJoined?.(room);
  }
}
