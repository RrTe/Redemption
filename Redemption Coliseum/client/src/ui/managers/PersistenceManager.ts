import { type TypedRoom } from "../gameUI";
import { FileService } from "../../utils/FileService";
import { log } from "../../utils/logger";

/**
 * Manages saving and loading game states via network and file system.
 */
export class PersistenceManager {
  private room: TypedRoom;

  constructor(room: TypedRoom) {
    this.room = room;
  }

  /**
   * Registers listeners for save-related messages from the server.
   */
  public registerHandlers() {
    this.room.onMessage("saveGameData", (data: any) => {
      log("Persistence", "Received save data from server.");
      FileService.downloadJson(data);
    });
  }

  public requestSave() {
    log("Persistence", "Requesting save game from server...");
    this.room.send("requestSaveGame", {});
  }
}
