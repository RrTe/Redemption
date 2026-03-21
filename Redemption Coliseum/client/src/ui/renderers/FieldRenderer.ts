import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type TypedRoom } from "../gameUI";
import { type CardUI } from "../CardUI";
import { type CardState, type PlayerState } from "../../../../shared/types";
import { PHASES } from "../../../../shared/phases.js"; // ✨ FIX: Import für Battle-Phase Check
import { ZONES } from "../../../../shared/zones";
import {
  CARD_TYPES,
  MANAGED_TERRITORY_TYPES,
} from "../../../../shared/card-constants";
import { log, DEBUG } from "../../utils/logger";

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

export class FieldRenderer {
  private layout: GameLayout;
  private room: TypedRoom;
  private dragBounds: Phaser.Geom.Rectangle;
  private processCard: CardProcessor;

  constructor(
    layout: GameLayout,
    room: TypedRoom,
    dragBounds: Phaser.Geom.Rectangle,
    processCard: CardProcessor,
  ) {
    this.layout = layout;
    this.room = room;
    this.dragBounds = dragBounds;
    this.processCard = processCard;
  }

  /** ✨ FIX: Aktualisiert das Layout, wenn sich die Fenstergröße oder Phase ändert. */
  public setLayout(newLayout: GameLayout) {
    this.layout = newLayout;
  }

  public renderTerritoryCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ): number {
    let totalCount = this._renderPlayerTerritory(
      player,
      false,
      attachmentMap,
      renderedCardIds,
    );

    if (opponent) {
      totalCount += this._renderPlayerTerritory(
        opponent,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }

    return totalCount;
  }

  public renderLandOfBondageCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const rootLoB = player.land_of_bondage.filter((c) => !c.attachedTo);
    this._renderUnmanagedRow(
      rootLoB,
      this.layout.playerLandOfBondage,
      false,
      attachmentMap,
      renderedCardIds,
    );

    if (opponent) {
      const rootOppLoB = opponent.land_of_bondage.filter((c) => !c.attachedTo);
      this._renderUnmanagedRow(
        rootOppLoB,
        this.layout.opponentLandOfBondage,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }
  }

  public renderBattlefieldCards(
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const allBattlefieldCards = this.room.state.battlefield;
    const playerBattleCards = allBattlefieldCards.filter(
      (card: CardState) =>
        card.controllerId === this.room.sessionId && !card.attachedTo,
    );
    const opponentBattleCards = allBattlefieldCards.filter(
      (card: CardState) =>
        card.controllerId !== this.room.sessionId && !card.attachedTo,
    );

    // Battlefield nutzt Logik ähnlich _renderZone, aber hier spezialisiert
    this._renderBattlefieldRow(
      playerBattleCards,
      this.layout.playerBattlefieldArea,
      false,
      attachmentMap,
      renderedCardIds,
    );
    this._renderBattlefieldRow(
      opponentBattleCards,
      this.layout.opponentBattlefieldArea,
      true,
      attachmentMap,
      renderedCardIds,
    );
  }

  private _renderPlayerTerritory(
    playerState: PlayerState,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ): number {
    const { territory } = playerState;
    const rootCards = territory.filter((c) => !c.attachedTo);

    const heroes = rootCards.filter((card) => card.Type === CARD_TYPES.HERO);
    const fortresses = rootCards.filter(
      (card) =>
        card.Type === CARD_TYPES.FORTRESS || card.Type === CARD_TYPES.SITE,
    );
    const evilCharacters = rootCards.filter(
      (card) => card.Type === CARD_TYPES.EC,
    );
    const artifacts = rootCards.filter(
      (card) => card.Type === CARD_TYPES.ARTIFACT,
    );
    const unmanagedCards = rootCards.filter(
      (card) => !MANAGED_TERRITORY_TYPES.includes(card.Type),
    );

    const areas = isOpponent
      ? {
          hero: this.layout.opponentHeroArea,
          fortress: this.layout.opponentFortressArea,
          ec: this.layout.opponentECArea,
          artifact: this.layout.opponentArtifactArea,
          unmanaged: this.layout.opponentTerritory,
        }
      : {
          hero: this.layout.playerHeroArea,
          fortress: this.layout.playerFortressArea,
          ec: this.layout.playerECArea,
          artifact: this.layout.playerArtifactArea,
          unmanaged: this.layout.playerTerritory,
        };

    this._renderCardRow(heroes, areas.hero, isOpponent, attachmentMap, renderedCardIds);
    this._renderCardRow(fortresses, areas.fortress, isOpponent, attachmentMap, renderedCardIds);
    this._renderCardRow(evilCharacters, areas.ec, isOpponent, attachmentMap, renderedCardIds);
    this._renderCardRow(artifacts, areas.artifact, isOpponent, attachmentMap, renderedCardIds);

    this._renderUnmanagedRow(unmanagedCards, areas.unmanaged, isOpponent, attachmentMap, renderedCardIds);

    return territory.length;
  }

  private _renderCardRow(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    if (cards.length === 0) return;

    // ✨ FIX: In der Battle-Phase Karten im Territory verkleinern
    const isBattlePhase = this.room.state.currentPhase === PHASES.BATTLE;
    const cardWidth = isBattlePhase ? this.layout.smallCardWidth : this.layout.cardWidth;
    const cardHeight = isBattlePhase ? this.layout.smallCardHeight : this.layout.cardHeight;

    const maxCardsWithoutOverlap = Math.floor(area.width / cardWidth);
    let spacing = cardWidth * 1.05;

    if (cards.length > maxCardsWithoutOverlap) {
      spacing = (area.width - cardWidth) / (cards.length - 1);
    }

    const startX = area.x;
    const targetY = area.centerY;
    const angle = isOpponent ? 180 : 0;

    cards.forEach((cardData, index) => {
      const targetX = startX + cardWidth / 2 + index * spacing;
      this.processCard(cardData, targetX, targetY, angle, attachmentMap, renderedCardIds, cardWidth, cardHeight);
    });
  }

  private _renderUnmanagedRow(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    if (cards.length === 0) return;

    // ✨ FIX: In der Battle-Phase Karten im Territory/LoB verkleinern
    const isBattlePhase = this.room.state.currentPhase === PHASES.BATTLE;
    const cardWidth = isBattlePhase ? this.layout.smallCardWidth : this.layout.cardWidth;
    const cardHeight = isBattlePhase ? this.layout.smallCardHeight : this.layout.cardHeight;

    const idealSpacing = cardWidth * 0.1;
    const idealTotalWidth = cards.length * cardWidth + Math.max(0, cards.length - 1) * idealSpacing;
    let actualSpacing = idealTotalWidth > area.width
      ? (area.width - cards.length * cardWidth) / Math.max(1, cards.length - 1)
      : idealSpacing;

    const actualTotalWidth = cards.length * cardWidth + Math.max(0, cards.length - 1) * actualSpacing;
    const startX = area.centerX - actualTotalWidth / 2 + cardWidth / 2;
    const targetY = area.centerY;

    cards.forEach((cardData, index) => {
      let targetX = startX + index * (cardWidth + actualSpacing);
      let angle = isOpponent ? 180 : 0;

      const cardBelongsToMe = cardData.controllerId === this.room.sessionId;
      const needsMirror = (isOpponent && !cardBelongsToMe) || (!isOpponent && cardBelongsToMe);

      if (!needsMirror && typeof cardData.x === "number" && cardData.x !== 0) {
        targetX = cardData.x;
      } else if (needsMirror) {
        targetX = 2 * this.dragBounds.centerX - targetX;
      }

      this.processCard(cardData, targetX, targetY, angle, attachmentMap, renderedCardIds, cardWidth, cardHeight);
    });
  }

  private _renderBattlefieldRow(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    if (cards.length === 0) return;

    // ✨ FIX: Battlefield-Karten sollten auch verkleinert werden, wenn das Layout dies vorsieht (smallCardWidth),
    // da der Platz begrenzt ist.
    const isBattlePhase = this.room.state.currentPhase === PHASES.BATTLE;
    const cardWidth = isBattlePhase ? this.layout.smallCardWidth : this.layout.cardWidth;
    const cardHeight = isBattlePhase ? this.layout.smallCardHeight : this.layout.cardHeight;

    const cardSpacing = cardWidth * 1.1;
    const targetY = area.centerY;
    const targetAngle = isOpponent ? 180 : 0;

    cards.forEach((cardData, index) => {
      const targetX = area.centerX - ((cards.length - 1) * cardSpacing) / 2 + index * cardSpacing;
      this.processCard(cardData, targetX, targetY, targetAngle, attachmentMap, renderedCardIds, cardWidth, cardHeight);
    });
  }
}