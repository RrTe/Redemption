import Phaser from "phaser";
import { type TypedRoom } from "../gameUI.js";
import { type NetworkManager } from "../../network/NetworkManager.js";
import { type TokenManager } from "../managers/TokenManager.js";
import { type CardState } from "../../../../shared/types.js";
import { log } from "../../utils/logger.js";

/**
 * Manages keyboard inputs and shortcuts.
 */
export class KeyboardHandler {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: NetworkManager;
  private tokenManager: TokenManager;

  // ✨ Logik aus CardGameScene hierher verschoben
  private static readonly KEY_BINDINGS = [
    {
      key: "R", // R für "Reveal" / "Turn"
      action: (card: CardState) => ({ isFaceDown: !card.isFaceDown }),
    },
    {
      key: "F", // F für "Flip"
      action: (card: CardState) => ({ isFlipped: !card.isFlipped }),
    },
    {
      key: "C",
      action: (card: CardState) => {
        const currentCounter = card.counters.get("+1") || 0;
        return { counters: { "+1": currentCounter + 1 } };
      },
    },
  ];

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
    tokenManager: TokenManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
    this.tokenManager = tokenManager;
  }

  public registerHandlers() {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;

    // Taste 'T' für Token-Auswahl
    const keyT = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    keyT.on("down", () => {
      this.tokenManager.startTokenCreationProcess();
    });

    keyboard.on("keydown-UP", () => {
      if (this.room.state.activePlayer) this.networkManager.sendChangeRedeemedSouls(1);
    });

    keyboard.on("keydown-DOWN", () => {
      if (this.room.state.activePlayer) this.networkManager.sendChangeRedeemedSouls(-1);
    });

    KeyboardHandler.KEY_BINDINGS.forEach(({ key, action }) => {
      keyboard.addKey(key).on("down", () => {
        const me = this.room.state.players?.get(this.room.sessionId);
        const firstCardInHand = me?.hand[0];
        if (firstCardInHand && this.room.state.activePlayer) {
          const updates = action(firstCardInHand);
          this.networkManager.sendUpdateCardState({ cardId: firstCardInHand.id, updates });
        }
      });
    });
  }
}