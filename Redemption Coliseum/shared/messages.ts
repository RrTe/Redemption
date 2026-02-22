// shared/messages.ts
import type { Zone } from "./zones.js";

export interface MoveCardMessage {
  from: Zone;
  to: Zone;
  cardId?: string; // ✨ Hinzugefügt, um Karten per ID zu bewegen
  index?: number; // Behalten für Züge, die auf einem Index basieren (z.B. vom Deck ziehen)
  count?: number; // 🆕 optional, Standardwert bleibt 1
  coords?: {
    x?: number; // ✨ KORREKTUR: x und y sind optional
    y?: number; // ✨ KORREKTUR: x und y sind optional
    targetPlayerId?: string;
    position?: "bottom";
    attachTo?: string; // ✨ NEU: ID der Zielkarte für Attach-Aktionen
  }; // ✨ Erweitert um die ID des Zielspielers
}

export interface GameRoomMessages {
  moveCard: MoveCardMessage;
}
