import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type CardUI } from "../CardUI";
import { type CardState, type PlayerState } from "../../../../shared/types";
import { ZONES } from "../../../../shared/zones";
import { log } from "../../utils/logger";

type CardProcessor = (
  cardData: CardState,
  targetX: number,
  targetY: number,
  targetAngle: number,
  attachmentMap: Map<string, CardState[]>,
  renderedCardIds: Set<string>,
  targetWidth?: number,
  targetHeight?: number,
) => CardUI;

export class PileRenderer {
  private layout: GameLayout;
  private processCard: CardProcessor;

  constructor(layout: GameLayout, processCard: CardProcessor) {
    this.layout = layout;
    this.processCard = processCard;
  }

  /** ✨ FIX: Aktualisiert das Layout, wenn sich die Fenstergröße ändert. */
  public setLayout(newLayout: GameLayout) {
    this.layout = newLayout;
  }

  public renderDiscardPileCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    this.renderZonePile(
      player.discard,
      this.layout.playerDiscardPile,
      false,
      attachmentMap,
      renderedCardIds,
    );
    if (opponent) {
      this.renderZonePile(
        opponent.discard,
        this.layout.opponentDiscardPile,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }
  }

  public renderNewZoneCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    this.renderZonePile(
      player.land_of_redemption,
      this.layout.playerLandOfRedemptionPile,
      false,
      attachmentMap,
      renderedCardIds,
    );
    if (opponent) {
      this.renderZonePile(
        opponent.land_of_redemption,
        this.layout.opponentLandOfRedemptionPile,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }
    this.renderZonePile(
      player.banish,
      this.layout.playerBanishPile,
      false,
      attachmentMap,
      renderedCardIds,
    );
    if (opponent) {
      this.renderZonePile(
        opponent.banish,
        this.layout.opponentBanishPile,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }
  }

  private renderZonePile(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const cardWidth = this.layout.cardWidth;
    const cardHeight = this.layout.cardHeight;

    cards.forEach((cardData) => {
      // ✨ Zufällige Rotation für Stapel (außer Deck/Reserve, aber die werden hier eh nicht gerendert)
      const shouldHaveRandomAngle =
        cardData.zone !== ZONES.RESERVE && cardData.zone !== ZONES.DECK;
      const angleOffset = shouldHaveRandomAngle
        ? (parseInt(cardData.id.slice(-2), 16) % 20) - 10
        : 0;

      const targetX = area.centerX;
      const targetY = area.centerY;
      const targetAngle = (isOpponent ? 180 : 0) + angleOffset;

      this.processCard(
        cardData,
        targetX,
        targetY,
        targetAngle,
        attachmentMap,
        renderedCardIds,
        cardWidth,
        cardHeight,
      );
    });
  }
}