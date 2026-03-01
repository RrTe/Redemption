// src/network/connection.ts
import { Client, getStateCallbacks } from "colyseus.js";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) => DEBUG && console.log("[CLIENT DEBUG][NET]", ...a);

let globalClient: Client | null = null; // ✨ NEU: Client-Instanz speichern

export async function connectToRoom() {
  try {
    // ✨ FIX: Robustere Endpoint-Erkennung (analog zu LobbyScene)
    const protocol = window.location.protocol.replace("http", "ws");
    const port = window.location.port ? `:${window.location.port}` : "";
    let serverPort = port;
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      port === ":5173"
    ) {
      serverPort = ":2567";
    }
    let endpoint = `${protocol}//${window.location.hostname}${serverPort}`;
    if (window.location.hostname.includes("vercel.app")) {
        endpoint = "wss://redemptionctcg-server.onrender.com";
    }

    const client = new Client(endpoint);
    globalClient = client; // ✨ NEU: Speichern
    const room = await client.joinOrCreate("game_room");

    log("Verbunden mit Raum", room.roomId);
    return room;
  } catch (err) {
    console.error("[NET] Verbindung fehlgeschlagen:", err);
    throw err;
  }
}

// ✨ NEU: Getter für den Client (für Reconnects)
export function getClient() {
    return globalClient;
}

export { getStateCallbacks };
