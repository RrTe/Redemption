import type { TypedRoom } from "../ui/gameUI.js";
import { type Zone } from "../../../shared/zones.js";
import type { MoveCardMessage } from "../../../shared/messages.js";
import type { SelectedCardInfo } from "../scenes/SelectionDialogScene.js";
import { log } from "../utils/logger.js";

/**
 * Handles constructing and dispatching network messages to the Colyseus GameRoom.
 */
export class GameMessageSender {
  private room: TypedRoom;

  constructor(room: TypedRoom) {
    this.room = room;
  }

  public setRoom(room: TypedRoom): void {
    this.room = room;
  }

  public sendCreateToken(payload: { cardId: string; zone: string; ownerId: string }): void {
    log("Network", "Sending 'createToken' message:", payload);
    (this.room as any).send("createToken", payload);
  }

  public sendConcede(): void {
    log("Network", "Sending 'concede' message.");
    this.room.send("concede", {});
  }

  public sendRequestSaveGame(): void {
    log("Network", "Sending 'requestSaveGame' message.");
    this.room.send("requestSaveGame", {});
  }

  public sendUpdateCardState(payload: { cardId: string; updates: any }): void {
    log("Network", "Sending 'updateCardState' message:", payload);
    this.room.send("updateCardState", payload);
  }

  public sendChangeRedeemedSouls(amount: number): void {
    log("Network", `Sending 'changeRedeemedSouls' with amount: ${amount}`);
    this.room.send("changeRedeemedSouls", { amount });
  }

  public sendChatMessage(text: string): void {
    (this.room as any).send("chat", { text });
  }

  public sendResolveSearch(
    selectedCards: { id: string; position: "top" | "bottom" }[],
    toZone: Zone,
    coords?: MoveCardMessage["coords"],
    remainingPositions?: SelectedCardInfo[],
  ): void {
    log("Network", `Sending 'resolveSearchPile' with ${selectedCards.length} cards to zone: ${toZone}`);
    this.room.send("resolveSearchPile", {
      selectedCards,
      toZone,
      coords,
      remainingPositions,
    });
  }

  public sendRequestSearchPile(zone: Zone, targetPlayerId?: string): void {
    log("Network", `Sending 'requestSearchPile' for zone: ${zone} of player: ${targetPlayerId || "self"}`);
    this.room.send("requestSearchPile", { zone, targetPlayerId });
  }

  public sendLookAtCards(
    zone: string,
    count: number,
    position: "top" | "bottom",
    targetPlayerId?: string,
  ): void {
    log("Network", `Sending 'requestLookAtCards' for ${count} cards from ${position} of ${zone} (target: ${targetPlayerId}).`);
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
    targetPlayerId?: string,
  ): void {
    log("Network", `Sending 'requestRevealCards' for ${count} cards from ${position} of ${zone} (target: ${targetPlayerId}).`);
    this.room.send("requestRevealCards", {
      zone,
      count,
      position,
      targetPlayerId,
    });
  }

  public sendMoveCard(message: MoveCardMessage): void {
    log("Network", "[1/4] Sending moveCard message via NetworkManager:", message);
    this.room.send("moveCard", message);
  }

  public sendResolveReveal(cardPositions: SelectedCardInfo[] = []): void {
    log("Network", `Sending 'resolveReveal' with ${cardPositions.length} card positions.`);
    this.room.send("resolveReveal", { cardPositions });
  }

  public sendNextPhase(): void {
    this.room.send("nextPhase");
  }

  public sendPlayerReady(): void {
    this.room.send("playerReady");
  }

  public sendRequestUndo(count: number = 1): void {
    log("Network", `Sending 'requestUndo' for ${count} action(s).`);
    this.room.send("requestUndo", { count });
  }

  public sendResolveUndo(accepted: boolean, count: number): void {
    log("Network", `Sending 'resolveUndo' accepted=${accepted} for ${count} action(s).`);
    this.room.send("resolveUndo", { accepted, count });
  }
}
