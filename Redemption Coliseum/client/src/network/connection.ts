// src/network/connection.ts
import { Client, getStateCallbacks } from "colyseus.js";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) => DEBUG && console.log("[CLIENT DEBUG][NET]", ...a);

let globalClient: Client | null = null;

export function getDefaultEndpoint(): string {
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
  return endpoint;
}

export function setClient(client: Client): void {
  globalClient = client;
}

export function getClient(endpoint?: string): Client {
  if (!globalClient) {
    const ep = endpoint || getDefaultEndpoint();
    globalClient = new Client(ep);
  }
  return globalClient;
}

export async function connectToRoom() {
  try {
    const client = getClient();
    const room = await client.joinOrCreate("game_room");

    log("Connected to room", room.roomId);
    return room;
  } catch (err) {
    console.error("[NET] Connection failed:", err);
    throw err;
  }
}

export { getStateCallbacks };
