import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type ElementManager } from "../managers/ElementManager";
import { type AnimationManager } from "../managers/AnimationManager";
import { type CardUI } from "../CardUI";
import { type TypedRoom } from "../gameUI.js";
import { type PlayerState, type CardState } from "../../../../shared/types";
import { ZONES } from "../../../../shared/zones";
import { log } from "../../utils/logger";

/** Konfiguration für den Kartenfächer */
const HAND_FAN_CONFIG = {
  MAX_TOTAL_ANGLE: 100,
  MAX_ANGLE_PER_CARD: 12,
  RADIUS_FACTOR: 1.2,
  PLAYER_PIVOT_OFFSET: 0.65,
  OPPONENT_PIVOT_OFFSET: 1.2,
};

type CardProcessor = (
  cardData: CardState,
  targetX: number,
  targetY: number,
  targetAngle: number,
  attachmentMap: Map<string, CardState[]>,
  renderedCardIds: Set<string>,
  targetWidth: number,
  targetHeight: number,
) => CardUI;

export class HandRenderer {
  private layout: GameLayout;
  private elementManager: ElementManager;
  private animationManager: AnimationManager;
  private processCard: CardProcessor;
  private settingsManager: any;
  private room?: TypedRoom;
  private isCardRevealedFn?: (cardId: string) => boolean;

  constructor(
    layout: GameLayout,
    elementManager: ElementManager,
    animationManager: AnimationManager,
    processCard: CardProcessor,
    settingsManager: any, // ✨ NEU
    room?: TypedRoom,
    isCardRevealedFn?: (cardId: string) => boolean,
  ) {
    this.layout = layout;
    this.elementManager = elementManager;
    this.animationManager = animationManager;
    this.processCard = processCard;
    this.settingsManager = settingsManager; // ✨ NEU
    this.room = room;
    this.isCardRevealedFn = isCardRevealedFn;
  }

  /** ✨ FIX: Aktualisiert das Layout, wenn sich die Fenstergröße ändert. */
  public setLayout(newLayout: GameLayout) {
    this.layout = newLayout;
  }

  public renderHandCards(
    player: PlayerState,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const handSize = player.hand.length;
    if (handSize === 0) return;

    const animationsToStart: {
      cardUI: CardUI;
      endPos: { x: number; y: number; angle: number };
    }[] = [];

    player.hand.forEach((cardData, index) => {
      // Validate zone to prevent rendering phantom cards that left hand
      if (cardData.zone && cardData.zone !== ZONES.HAND) {
        log("HandRenderer", `[WARN] Skipping card ${cardData.id} in player.hand with mismatching zone: ${cardData.zone}`);
        return;
      }

      const { x, y, angle } = this.getHandCardTargetPosition(index, handSize);

      const cardUI = this.processCard(
        cardData,
        x,
        y,
        angle,
        attachmentMap,
        renderedCardIds,
        this.layout.handCardWidth,
        this.layout.handCardHeight,
      );

      cardUI.setDepth(100 + index);

      if (this.animationManager.pendingDrawAnimations.has(cardData.id)) {
        animationsToStart.push({ cardUI, endPos: { x, y, angle } });
      }
    });

    if (animationsToStart.length > 0) {
      const startRect =
        this.elementManager.zoneElements.playerDeckPile.getBounds();
      animationsToStart.forEach(({ cardUI, endPos }, index) => {
        this.animationManager.playCardDrawAnimation(
          cardUI,
          startRect,
          endPos,
          index * 200,
        );
      });
    }
  }

  public renderOpponentHandCards(
    opponent: PlayerState,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const handSize = opponent.hand.length;
    // Identify revealed star cards for horizontal row placement
    const validHandCards = opponent.hand.filter(
      (c) => !c.zone || c.zone === ZONES.HAND,
    );
    const isCardRevealed = (cardId: string): boolean => {
      if (this.isCardRevealedFn) return this.isCardRevealedFn(cardId);
      const seq = this.room?.state?.activeSequenceCardIds;
      const inSeq = Boolean(seq && (seq.some ? seq.some((id: string) => id === cardId) : Array.from(seq).includes(cardId)));
      return inSeq || Boolean(this.room?.state?.effectChronicle?.items?.some?.((item: any) => item.cardId === cardId));
    };

    const revealedStarCards = validHandCards.filter((cardData) => isCardRevealed(cardData.id));
    const revealedCount = revealedStarCards.length;

    const activeSeq: string[] = [];
    if (this.room?.state?.activeSequenceCardIds) {
      this.room.state.activeSequenceCardIds.forEach((id: string) => activeSeq.push(id));
    }

    // Sort revealed cards ascending by their selection sequence order
    revealedStarCards.sort((a, b) => {
      const idxA = activeSeq.indexOf(a.id);
      const idxB = activeSeq.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    // Dynamische Vergrößerung (+15%) und proportionale Abstände für aufgedeckte Star-Karten
    const REVEAL_SCALE_FACTOR = 1.15;
    const revealedWidth = this.layout.handCardWidth * REVEAL_SCALE_FACTOR;
    const revealedHeight = this.layout.handCardHeight * REVEAL_SCALE_FACTOR;
    const revealedSpacing = revealedWidth * 1.08;
    const revealedTotalWidth = (revealedCount - 1) * revealedSpacing;
    const revealedStartX = this.layout.opponentHand.centerX - revealedTotalWidth / 2;
    const revealedY = this.layout.opponentHand.centerY + this.layout.handCardHeight * 0.65;

    opponent.hand.forEach((cardData, index) => {
      // Validate zone to prevent rendering phantom cards that left opponent hand
      if (cardData.zone && cardData.zone !== ZONES.HAND) {
        log("HandRenderer", `[WARN] Skipping card ${cardData.id} in opponent.hand with mismatching zone: ${cardData.zone}`);
        return;
      }

      const isRevealedStarCard = isCardRevealed(cardData.id);

      let x: number;
      let y: number;
      let finalAngle: number;
      let targetWidth: number;
      let targetHeight: number;

      if (isRevealedStarCard) {
        const positionIndex = revealedStarCards.findIndex((c) => c.id === cardData.id);
        const resolvedPos = positionIndex !== -1 ? positionIndex : 0;
        // Kerzengerade (angle = 0), aufsteigend nach Auswahlreihenfolge von links nach rechts
        x = revealedStartX + resolvedPos * revealedSpacing;
        y = revealedY;
        finalAngle = 0;
        targetWidth = revealedWidth;
        targetHeight = revealedHeight;
      } else {
        const pos = this.getHandCardTargetPosition(index, handSize, true);
        x = pos.x;
        y = pos.y;
        finalAngle = pos.angle;
        targetWidth = this.layout.handCardWidth;
        targetHeight = this.layout.handCardHeight;
      }

      const cardUI = this.processCard(
        cardData,
        x,
        y,
        finalAngle,
        attachmentMap,
        renderedCardIds,
        targetWidth,
        targetHeight,
      );
      const baseDepth = isRevealedStarCard ? 300 : 100;
      cardUI.setDepth(baseDepth + index);

      if (isRevealedStarCard) {
        const seqIdx = activeSeq.indexOf(cardData.id);
        const badgeNumber = seqIdx !== -1
          ? seqIdx + 1
          : revealedStarCards.findIndex((c) => c.id === cardData.id) + 1;
        cardUI.badge.show(String(badgeNumber), "top-left", cardUI.visuals?.getStarIcon?.() || null);
      } else {
        cardUI.badge.hide();
      }
    });
  }

  private getHandCardTargetPosition(
    index: number,
    handSize: number,
    isOpponent: boolean = false,
  ): { x: number; y: number; angle: number } {
    const cardHeight = this.layout.handCardHeight;
    const cardWidth = this.layout.handCardWidth; // ✨ NEU
    const rect = isOpponent ? this.layout.opponentHand : this.layout.playerHand;
    const isFanned = this.settingsManager ? this.settingsManager.get("handCardsFanned") : true; // ✨ NEU

    if (!isFanned) {
      // ✨ NEU: Unfanned (gerade Linie) Layout
      // Wir berechnen die Breite des Bereichs und verteilen die Karten
      const overlap = cardWidth * 0.4; // Wie viel sich die Karten überlappen dürfen
      const totalWidthNeeded = cardWidth + (handSize - 1) * overlap;
      const startX = rect.centerX - totalWidthNeeded / 2 + cardWidth / 2;
      
      const x = startX + index * overlap;
      const y = rect.centerY;
      return { x, y, angle: 0 };
    }

    // --- Fan Layout ---
    const anglePerCard = Math.min(
      HAND_FAN_CONFIG.MAX_TOTAL_ANGLE / Math.max(1, handSize - 1),
      HAND_FAN_CONFIG.MAX_ANGLE_PER_CARD,
    );
    const totalAngle = (handSize - 1) * anglePerCard;
    const startAngle = -totalAngle / 2;

    const radius = cardHeight * HAND_FAN_CONFIG.RADIUS_FACTOR;
    const pivotOffset = isOpponent
      ? HAND_FAN_CONFIG.OPPONENT_PIVOT_OFFSET
      : HAND_FAN_CONFIG.PLAYER_PIVOT_OFFSET;

    // Bei Gegner: Pivot ist oberhalb der Handzone (y + offset)
    // Bei Spieler: Pivot ist unterhalb der Handzone (bottom + offset)
    // Da wir aber für Gegner y nutzen und für Spieler bottom, passen wir die Logik an:
    const pivotY = isOpponent
      ? rect.y + cardHeight * pivotOffset
      : rect.bottom + cardHeight * pivotOffset;

    const currentAngle = startAngle + index * anglePerCard;
    const angleRad = Phaser.Math.DegToRad(currentAngle);

    const x = rect.centerX + radius * Math.sin(angleRad);
    const y = pivotY - radius * Math.cos(angleRad);

    return { x, y, angle: currentAngle };
  }
}