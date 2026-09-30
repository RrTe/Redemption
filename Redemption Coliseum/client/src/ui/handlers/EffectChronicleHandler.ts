// client/src/ui/handlers/EffectChronicleHandler.ts
import { type Room } from "colyseus.js";
import { type RoomState } from "../../../../shared/types";
import {
  CHRONICLE_ACTIONS,
  CHRONICLE_MESSAGES,
} from "../../../../shared/effectChronicleConstants";

import { log } from "../../utils/logger";

/**
 * Handles outgoing network communication for Effect Chronicle operations.
 */
export class EffectChronicleHandler {
  private room: Room<RoomState>;

  constructor(room: Room<RoomState>) {
    this.room = room;
  }

  /**
   * Sends an execute request for the active or specified chronicle item.
   * @param itemId Optional ID of the item to execute.
   */
  public executeItem(itemId?: string): void {
    try {
      this.room.send(CHRONICLE_MESSAGES.RESOLVE_ITEM, {
        action: CHRONICLE_ACTIONS.EXECUTE,
        itemId,
      });
      log("EffectChronicleHandler", `Sent execute request for item: ${itemId || "active"}`);
    } catch (err) {
      log("EffectChronicleHandler", `Failed to send execute request: ${err}`);
    }
  }

  /**
   * Sends a pass request for the active or specified chronicle item.
   * @param itemId Optional ID of the item to pass.
   */
  public passItem(itemId?: string): void {
    try {
      this.room.send(CHRONICLE_MESSAGES.RESOLVE_ITEM, {
        action: CHRONICLE_ACTIONS.PASS,
        itemId,
      });
      log("EffectChronicleHandler", `Sent pass request for item: ${itemId || "active"}`);
    } catch (err) {
      log("EffectChronicleHandler", `Failed to send pass request: ${err}`);
    }
  }

  /**
   * Sends a pass-all request to skip all remaining pending items.
   */
  public passAll(): void {
    try {
      this.room.send(CHRONICLE_MESSAGES.RESOLVE_ITEM, {
        action: CHRONICLE_ACTIONS.PASS_ALL,
      });
      log("EffectChronicleHandler", "Sent passAll request");
    } catch (err) {
      log("EffectChronicleHandler", `Failed to send passAll request: ${err}`);
    }
  }
}
