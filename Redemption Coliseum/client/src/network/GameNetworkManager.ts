import type { TypedRoom, StateCallback } from "../ui/gameUI.js";
import type { GameUI } from "../ui/gameUI.js";
import type { SelectionDialogData } from "../scenes/SelectionDialogScene.js";
import { SelectionDialogScene } from "../scenes/SelectionDialogScene.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type {
  GameRoomMessages,
  MoveCardMessage,
} from "../../../shared/messages.js";
import { log, DEBUG } from "../utils/logger.js";
import { type DialogManager } from "../ui/managers/DialogManager.js"; // ✨ REFACTOR
import { getClient } from "./connection.js"; // ✨ NEU
import { GameEventCoordinator } from "./GameEventCoordinator.js"; // ✨ NEU

/**
 * ✨ NEU (SCHRITT 3): Verwaltet die gesamte Netzwerkkommunikation mit dem Colyseus-Raum.
 * Diese Klasse entkoppelt die UI von der direkten Server-Interaktion.
 */
export class GameNetworkManager {
  private room: TypedRoom;
  private scene: Phaser.Scene;
  private ui: GameUI;
  private $: StateCallback;
  private heartbeatInterval: number | null = null; // ✨ NEU
  private isReconnecting: boolean = false; // ✨ NEU
  private onLeaveListener: any; // ✨ FIX: To store and remove the listener on destroy
  private instanceId: string; // ✨ NEU: Für Debugging
  private dialogManager!: DialogManager; // ✨ FIX: Eigenschaft deklariert

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    ui: GameUI,
    stateCallback: StateCallback,
  ) {
    this.scene = scene;
    this.room = room;
    this.ui = ui;
    this.$ = stateCallback;
    this.instanceId = Phaser.Utils.String.UUID().slice(0, 8); // ✨ FIX: Use slice() instead of deprecated substr()
    log("Network", `[NetworkManager ${this.instanceId}] Created for room ${room.roomId}`);

    // ✨ NEU: Debugging Hooks hierher verschoben
    // @ts-ignore
    window.resolveSearch = (cardIds: string[], toZone: Zone) => {
      this.sendResolveSearch(cardIds, toZone);
    };

    // @ts-ignore
    window.lookAtCards = (
      zone: Zone,
      count: number,
      position: "top" | "bottom" = "top",
    ) => {
      this.sendLookAtCards(zone, count, position);
    };

    // @ts-ignore
    window.revealCards = (
      zone: Zone,
      count: number,
      position: "top" | "bottom" = "top",
    ) => {
      this.sendRevealCards(zone, count, position);
    };

    // @ts-ignore
    window.saveGame = () => this.sendRequestSaveGame();
  }

  /** ✨ NEU: Spezifische Methode zum Erstellen von Tokens. */
  public sendCreateToken(payload: {
    cardId: string;
    zone: string;
    ownerId: string;
  }) {
    log("Network", `Sending 'createToken' message:`, payload);
    // Wir nutzen hier 'as any' für den Zugriff auf send, um Änderungen an shared/messages.ts zu vermeiden
    (this.room as any).send("createToken", payload);
  }

  /** ✨ NEU: Sendet die Aufgabe (Concede) an den Server. */
  public sendConcede() {
    log("Network", "Sending 'concede' message.");
    this.room.send("concede", {});
  }

  /** ✨ NEU: Fordert das Speichern des Spielstands an. */
  public sendRequestSaveGame() {
    log("Network", "Sending 'requestSaveGame' message.");
    this.room.send("requestSaveGame", {});
  }

  /** ✨ NEU: Sendet Status-Updates für eine Karte (z.B. flippen). */
  public sendUpdateCardState(payload: { cardId: string; updates: any }) {
    log("Network", "Sending 'updateCardState' message:", payload);
    this.room.send("updateCardState", payload);
  }

  /** ✨ NEU: Sendet Änderung der Redeemed Souls. */
  public sendChangeRedeemedSouls(amount: number) {
    log("Network", `Sending 'changeRedeemedSouls' with amount: ${amount}`);
    this.room.send("changeRedeemedSouls", { amount });
  }

  /** ✨ NEU: Sendet eine Chat-Nachricht. */
  public sendChatMessage(text: string) {
    // Wir nutzen hier 'as any', da Chat nicht im strengen Interface definiert ist
    (this.room as any).send("chat", { text });
  }

  /** ✨ NEU: Setter zur Vermeidung zirkulärer Abhängigkeiten */
  public setDialogManager(dialogManager: DialogManager) {
    this.dialogManager = dialogManager;
  }

  /** Registriert alle Handler für eingehende Server-Nachrichten. */
  public registerHandlers() {
    log(
      "Network",
      `[NetworkManager ${this.instanceId}] Registering message handlers...`,
    );

    // ✨ NEU: Heartbeat starten (alle 15s)
    this.startHeartbeat();

    // ✨ NEU: Browser-Events für sofortiges Feedback beim lokalen Testen ("Offline"-Modus)
    window.addEventListener("offline", () => {
      log("Network", "Browser went offline (Event).");
      this.scene.events.emit("net:offline", { message: "Connection lost. Waiting for network..." });
    });

    window.addEventListener("online", () => {
      log("Network", "Browser went online (Event).");
      // Wenn der Socket noch offen ist (kein onLeave gefeuert), Overlay entfernen.
      if (this.room && this.room.connection && this.room.connection.isOpen) {
        this.scene.events.emit("net:online", { message: "Network restored." });
      }
    });

    // ✨ NEU: Automatischen Reconnect bei Verbindungsabbruch behandeln
    // ✨ FIX: Store the listener so it can be removed.
    this.onLeaveListener = this.room.onLeave((code) => {
      log(
        "Network",
        `[NetworkManager ${this.instanceId}] [onLeave] Disconnected with code ${code}`,
      );

      // ✨ FIX: Zombie-Schutz! Wenn die Szene nicht mehr aktiv ist (z.B. Wechsel zur Lobby),
      // dürfen wir nicht mehr auf Events reagieren.
      if (!this.scene.sys.isActive()) {
        log(
          "Network",
          `[NetworkManager ${this.instanceId}] Scene is inactive. Ignoring onLeave.`,
        );
        return;
      }

      // ✨ NEU: Spezifische Behandlung für "Game Over" (Zombie Room)
      if (code === 4000) {
        this.scene.events.emit("net:disconnected", { message: "Game is already over. Please return to lobby.", fatal: true });
        return;
      }

      // Code > 1000 bedeutet meistens Fehler/Timeout (nicht consented).
      // Wir prüfen auch isReconnecting, um Endlosschleifen zu vermeiden.
      if (code > 1000 && !this.isReconnecting) {
        this.handleDisconnect();
      }
    });
  }

  // ✨ NEU: Heartbeat-Methoden
  private startHeartbeat() {
    this.stopHeartbeat();
    log("Network", "Starting Heartbeat (15s interval)");
    // Sende alle 15 Sekunden einen Ping, um Render/Heroku Timeouts zu verhindern.
    this.heartbeatInterval = window.setInterval(() => {
      if (this.room) {
        // log("Network", "❤️ Sending Heartbeat (ping)"); // ✨ FIX: Log für Produktion deaktiviert
        this.room.send("ping");
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ✨ NEU: Reconnect-Logik
  private async handleDisconnect() {
    this.isReconnecting = true;
    this.scene.events.emit("net:reconnecting", { message: "Connection lost. Reconnecting..." });

    const token = localStorage.getItem("reconnectionToken");
    const client = getClient();

    if (!token || !client) {
      this.scene.events.emit("net:disconnected", { message: "Connection lost. Please return to lobby.", fatal: true });
      return;
    }

    try {
      log("Network", "Attempting silent reconnect...");
      // Versuche Reconnect mit dem gespeicherten Token
      const newRoom = await client.reconnect(token);
      log("Network", "Silent reconnect successful!", newRoom);

      // WICHTIG: Wir haben eine neue Raum-Instanz. Wir müssen die Szene neu starten,
      // damit alle Listener auf den neuen Raum gebunden werden.
      this.scene.scene.restart({ room: newRoom });
    } catch (e) {
      log("Network", "Reconnect failed:", e);
      this.scene.events.emit("net:disconnected", { message: "Connection failed. Please return to lobby.", fatal: true });
    } finally {
      this.isReconnecting = false;
    }
  }

  // --- Methoden zum Senden von Nachrichten ---

  public sendResolveSearch(
    selectedCardIds: string[],
    toZone: Zone,
    coords?: MoveCardMessage["coords"],
  ) {
    log(
      "Network",
      `Sending 'resolveSearchPile' with cards: ${selectedCardIds.join(
        ", ",
      )} to zone: ${toZone} for player: ${coords?.targetPlayerId || "self"}`,
    );
    this.room.send("resolveSearchPile", { selectedCardIds, toZone, coords });
  }

  // ✨ NEU: Methode zum Anfordern einer Stapelsuche.
  public sendRequestSearchPile(zone: Zone, targetPlayerId?: string) {
    log(
      "Network",
      `Sending 'requestSearchPile' for zone: ${zone} of player: ${
        targetPlayerId || "self"
      }`,
    );
    this.room.send("requestSearchPile", { zone, targetPlayerId });
  }

  public sendLookAtCards(
    zone: string,
    count: number,
    position: "top" | "bottom",
    targetPlayerId?: string, // ✨ NEU: Optionaler Parameter für den Zielspieler
  ) {
    log(
      "Network",
      `Sending 'requestLookAtCards' for ${count} cards from ${position} of ${zone} (target: ${targetPlayerId}).`,
    );
    this.room.send("requestLookAtCards", {
      zone,
      count,
      position,
      targetPlayerId,
    });
  }

  public sendRevealCards(
    zone: string,
    count: number,
    position: "top" | "bottom",
    targetPlayerId?: string, // ✨ NEU: Optionaler Parameter für den Zielspieler
  ) {
    log(
      "Network",
      `Sending 'requestRevealCards' for ${count} cards from ${position} of ${zone} (target: ${targetPlayerId}).`,
    );
    this.room.send("requestRevealCards", {
      zone,
      count,
      position,
      targetPlayerId,
    });
  }

  // ✨ NEU: Methode zum Senden einer Kartenbewegung.
  public sendMoveCard(message: MoveCardMessage) {
    log(
      "Network",
      `[1/4] Sending moveCard message via NetworkManager:`,
      message,
    );
    this.room.send("moveCard", message);
  }

  // ✨ NEU: Methode zum Schließen des "Reveal"-Dialogs.
  public sendResolveReveal() {
    log("Network", `Sending 'resolveReveal' message.`);
    this.room.send("resolveReveal");
  }

  // ✨ NEU: Methode zum Senden der "Next Phase"-Aktion.
  public sendNextPhase() {
    this.room.send("nextPhase");
  }

  // ✨ NEU: Signalisiert dem Server, dass die Szene geladen ist und das Spiel beginnen kann.
  public sendPlayerReady() {
    this.room.send("playerReady");
  }

  // ✨ NEU: Aufräumen
  public destroy() {
    log("Network", `[NetworkManager ${this.instanceId}] Destroying...`);
    this.stopHeartbeat();
    // ✨ FIX: Unregister the onLeave listener to prevent "zombie listeners"
    // from firing in a new scene.
    if (this.onLeaveListener) {
      this.onLeaveListener.remove();
      this.onLeaveListener = null;
    }
  }
}
