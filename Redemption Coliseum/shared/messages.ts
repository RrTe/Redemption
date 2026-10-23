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
    targetPlayerId?: string; // ✨ NEU: Zielspieler für die Bewegung
    position?: "bottom";
    attachTo?: string; // ✨ NEU: ID der Zielkarte für Attach-Aktionen
  }; // ✨ Erweitert um die ID des Zielspielers
  inGameType?: string; // ✨ NEU: Zwingend erforderlich beim Ausspielen ins Territory/Battlefield
  inGameAlignment?: string; // ✨ NEU: Zwingend erforderlich beim Ausspielen ins Territory/Battlefield
}

export interface ResolveSearchPileMessage {
  selectedCards: { id: string; position: "top" | "bottom" }[];
  toZone: Zone;
  coords?: MoveCardMessage["coords"];
}

export interface RequestUndoMessage {
  count: number;
}

export interface ResolveUndoMessage {
  accepted: boolean;
  count: number;
}

export interface SubmitDrawSequenceMessage {
  step: string;
  orderedCardIds: string[];
}

export interface ResolveChronicleItemMessage {
  action: "execute" | "pass" | "pass_all";
  itemId?: string;
}

export interface RequestTargetSelectionMessage {
  abilityId: string;
  itemId?: string;
  sourceCardId?: string;
  promptText: string;
  targetType: "card" | "pile";
  eligibleCardIds?: string[];
  eligiblePiles?: Array<{ id: string; label: string; ownerId: string; zone: Zone }>;
  minTargets: number;
  maxTargets: number;
  canCancel: boolean;
}

export interface ActionTelegraphMessage {
  sourceCardId: string;
  targetCardIds?: string[];
  targetPileId?: string;
  durationMs?: number;
  action?: string;
  isSpecialInitiative?: boolean;
  persistent?: boolean;
}

export interface ClearActionTelegraphMessage {
  sourceCardId?: string;
}

export interface SelectTargetMessage {
  abilityId: string;
  itemId?: string;
  selectedCardIds?: string[];
  selectedPileId?: string;
  cancelled?: boolean;
}

export interface RequestOptionalAbilityMessage {
  abilityId: string;
  itemId: string;
  cardId?: string;
  cardTitle: string;
  promptText: string;
  action: string;
  cardImageFile?: string;
  templateId?: string;
}

export interface RespondOptionalAbilityMessage {
  itemId: string;
  accepted: boolean;
}

export interface RequestNextPhaseMessage {
  requestedPhase?: string;
}

export interface PromptPhaseTransitionMessage {
  requestingPlayerId: string;
  requestingPlayerName: string;
  fromPhase: string;
  toPhase: string;
}

export interface RespondPhaseTransitionMessage {
  accept: boolean;
}

export interface ResolvePhaseTransitionMessage {
  accepted: boolean;
  fromPhase?: string;
  toPhase?: string;
}

export interface GameRoomMessages {
  moveCard: MoveCardMessage;
  requestUndo: RequestUndoMessage;
  resolveUndo: ResolveUndoMessage;
  submitDrawSequence: SubmitDrawSequenceMessage;
  resolveChronicleItem: ResolveChronicleItemMessage;
  selectTarget: SelectTargetMessage;
  respondOptionalAbility: RespondOptionalAbilityMessage;
  requestNextPhase: RequestNextPhaseMessage;
  respondPhaseTransition: RespondPhaseTransitionMessage;
}
