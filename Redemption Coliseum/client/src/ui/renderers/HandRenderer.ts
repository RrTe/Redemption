import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type ElementManager } from "../managers/ElementManager";
import { type AnimationManager } from "../managers/AnimationManager";
import { type CardUI } from "../CardUI";
import { type PlayerState, type CardState } from "../../../../shared/types";
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

  constructor(
    layout: GameLayout,
    elementManager: ElementManager,
    animationManager: AnimationManager,
    processCard: CardProcessor,
  ) {
    this.layout = layout;
    this.elementManager = elementManager;
    this.animationManager = animationManager;
    this.processCard = processCard;
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
    if (handSize === 0) return;

    opponent.hand.forEach((cardData, index) => {
      const { x, y, angle } = this.getHandCardTargetPosition(
        index,
        handSize,
        true,
      );
      const finalAngle = angle;

      const cardUI = this.processCard(
        cardData,
        x,
        y,
        finalAngle,
        attachmentMap,
        renderedCardIds,
        this.layout.handCardWidth,
        this.layout.handCardHeight,
      );
      cardUI.setDepth(100 + index);
    });
  }

  private getHandCardTargetPosition(
    index: number,
    handSize: number,
    isOpponent: boolean = false,
  ): { x: number; y: number; angle: number } {
    const cardHeight = this.layout.handCardHeight;
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
    const rect = isOpponent ? this.layout.opponentHand : this.layout.playerHand;

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