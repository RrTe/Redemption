// src/network/connection.ts
import { Client, getStateCallbacks } from "colyseus.js";

const DEBUG = localStorage.getItem("debug") === "true";
const log = (...a: any[]) => DEBUG && console.log("[CLIENT DEBUG][NET]", ...a);

export async function connectToRoom() {
  try {
    const client = new Client("ws://localhost:2567");
    const room = await client.joinOrCreate("game_room");

    log("Verbunden mit Raum", room.roomId);
    return room;
  } catch (err) {
    console.error("[NET] Verbindung fehlgeschlagen:", err);
    throw err;
  }
}

export { getStateCallbacks };
