import type { TypedRoom, StateCallback } from "../ui/gameUI.js";
import type { GameUI } from "../ui/gameUI.js";
import type { SelectedCardInfo } from "../scenes/SelectionDialogScene.js";
import { type Zone } from "../../../shared/zones.js";
import type { MoveCardMessage } from "../../../shared/messages.js";
import { log } from "../utils/logger.js";
import { type DialogManager } from "../ui/managers/DialogManager.js";
import { getClient } from "./connection.js";
import { GameMessageSender } from "./GameMessageSender.js";
import { NETWORK_CONFIG } from "../../../shared/networkConfig.js";

/**
 * Manages connection lifecycle, heartbeats, reconnections, and delegates outgoing messages.
 */
export class GameNetworkManager {
  private room: TypedRoom;
  private scene: Phaser.Scene;
  private ui: GameUI;
  private $: StateCallback;
  private sender: GameMessageSender;
  private heartbeatInterval: number | null = null;
  private isReconnecting: boolean = false;
  private onLeaveListener: any;
  private instanceId: string;
  private dialogManager!: DialogManager;

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
    this.sender = new GameMessageSender(room);
    this.instanceId = Phaser.Utils.String.UUID().slice(0, 8);
    log("Network", `[NetworkManager ${this.instanceId}] Created for room ${room.roomId}`);

    this.registerGlobalDebugHooks();
  }

  private registerGlobalDebugHooks(): void {
    // @ts-ignore
    window.resolveSearch = (cardIds: string[], toZone: Zone) => {
      const mappedCards = cardIds.map(id => ({ id, position: "top" as const }));
      this.sendResolveSearch(mappedCards, toZone);
    };
    // @ts-ignore
    window.lookAtCards = (zone: Zone, count: number, pos: "top" | "bottom" = "top") => {
      this.sendLookAtCards(zone, count, pos);
    };
    // @ts-ignore
    window.revealCards = (zone: Zone, count: number, pos: "top" | "bottom" = "top") => {
      this.sendRevealCards(zone, count, pos);
    };
    // @ts-ignore
    window.saveGame = () => this.sendRequestSaveGame();
  }

  public setDialogManager(dialogManager: DialogManager): void {
    this.dialogManager = dialogManager;
  }

  public registerHandlers(): void {
    log("Network", `[NetworkManager ${this.instanceId}] Registering handlers & heartbeat...`);
    this.startHeartbeat();

    window.addEventListener("offline", () => {
      log("Network", "Browser went offline.");
      this.scene.events.emit("net:offline", { message: "Connection lost. Waiting for network..." });
    });

    window.addEventListener("online", () => {
      log("Network", "Browser went online.");
      if (this.room?.connection?.isOpen) {
        this.scene.events.emit("net:online", { message: "Network restored." });
      }
    });

    this.onLeaveListener = this.room.onLeave((code) => {
      log("Network", `[NetworkManager ${this.instanceId}] Disconnected with code ${code}`);

      if (!this.scene.sys.isActive()) {
        return;
      }

      // Normal room closure after game end (do not treat as connection failure)
      if (this.room.state.winnerId) {
        log("Network", "Room closed normally after game end.");
        return;
      }

      if (code === 4000) {
        localStorage.removeItem("reconnectionToken");
        localStorage.removeItem("reconnectionRoomId");
        this.scene.events.emit("net:disconnected", {
          message: "Game is already over. Please return to lobby.",
          fatal: true,
        });
        return;
      }

      if (code > 1000 && !this.isReconnecting) {
        this.handleDisconnect();
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.room?.connection?.isOpen) {
        this.room.send("ping");
      }
    }, NETWORK_CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.isReconnecting = true;
    this.scene.events.emit("net:reconnecting", { message: "Connection lost. Reconnecting..." });

    const token = localStorage.getItem("reconnectionToken");
    const client = getClient();

    if (!token || !client) {
      this.scene.events.emit("net:disconnected", {
        message: "Connection lost. Please return to lobby.",
        fatal: true,
      });
      this.isReconnecting = false;
      return;
    }

    try {
      log("Network", "Attempting silent reconnect...");
      const newRoom = await client.reconnect(token);
      log("Network", "Silent reconnect successful!", newRoom);
      this.scene.scene.restart({ room: newRoom });
    } catch (e) {
      log("Network", "Reconnect failed:", e);
      localStorage.removeItem("reconnectionToken");
      localStorage.removeItem("reconnectionRoomId");
      this.scene.events.emit("net:disconnected", {
        message: "Connection failed. Please return to lobby.",
        fatal: true,
      });
    } finally {
      this.isReconnecting = false;
    }
  }

  // Delegated sender methods
  public sendCreateToken(p: { cardId: string; zone: string; ownerId: string }) { this.sender.sendCreateToken(p); }
  public sendConcede() { this.sender.sendConcede(); }
  public sendRequestSaveGame() { this.sender.sendRequestSaveGame(); }
  public sendUpdateCardState(p: { cardId: string; updates: any }) { this.sender.sendUpdateCardState(p); }
  public sendChangeRedeemedSouls(amount: number) { this.sender.sendChangeRedeemedSouls(amount); }
  public sendChatMessage(text: string) { this.sender.sendChatMessage(text); }
  public sendResolveSearch(s: { id: string; position: "top" | "bottom" }[], z: Zone, c?: MoveCardMessage["coords"], r?: SelectedCardInfo[]) { this.sender.sendResolveSearch(s, z, c, r); }
  public sendRequestSearchPile(zone: Zone, targetPlayerId?: string) { this.sender.sendRequestSearchPile(zone, targetPlayerId); }
  public sendLookAtCards(z: string, count: number, p: "top" | "bottom", target?: string) { this.sender.sendLookAtCards(z, count, p, target); }
  public sendRevealCards(z: string, count: number, p: "top" | "bottom", target?: string) { this.sender.sendRevealCards(z, count, p, target); }
  public sendMoveCard(msg: MoveCardMessage) { this.sender.sendMoveCard(msg); }
  public sendResolveReveal(pos: SelectedCardInfo[] = []) { this.sender.sendResolveReveal(pos); }
  public sendNextPhase() { this.sender.sendNextPhase(); }
  public sendPlayerReady() { this.sender.sendPlayerReady(); }
  public sendRequestUndo(count: number = 1) { this.sender.sendRequestUndo(count); }
  public sendResolveUndo(accepted: boolean, count: number) { this.sender.sendResolveUndo(accepted, count); }

  public destroy(): void {
    log("Network", `[NetworkManager ${this.instanceId}] Destroying...`);
    this.stopHeartbeat();
    if (this.onLeaveListener) {
      this.onLeaveListener.remove();
      this.onLeaveListener = null;
    }
  }
}
