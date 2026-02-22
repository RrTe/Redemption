import Phaser from "phaser";
import { type GameLayout } from "./layout";
import { type ElementManager } from "./ElementManager.js";
import { type TypedRoom } from "./gameUI.js";
import { CardUI } from "./CardUI.js";
import { type CardState, type PlayerState } from "../../../shared/types";
import { ZONES, CONCEALED_ZONES } from "../../../shared/zones";
import { type AnimationManager } from "./AnimationManager.js";
import {
  CARD_TYPES,
  MANAGED_TERRITORY_TYPES,
} from "../../../shared/card-constants";
import { log, DEBUG } from "../utils/logger";


/**
 * ✨ REFACTORING: Verwaltet das Rendern (Erstellen, Positionieren, Aktualisieren)
 * aller CardUI-Objekte basierend auf dem Spielzustand.
 */
export class CardRenderer {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  public layout: GameLayout;
  private elementManager: ElementManager;
  private cardUIs = new Map<string, CardUI>();
  private animationManager: AnimationManager; // ✨ NEU
  private dragBounds: Phaser.Geom.Rectangle;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    layout: GameLayout,
    elementManager: ElementManager,
    animationManager: AnimationManager, // ✨ NEU
    dragBounds: Phaser.Geom.Rectangle,
  ) {
    this.scene = scene;
    this.room = room;
    this.layout = layout;
    this.elementManager = elementManager;
    this.animationManager = animationManager; // ✨ NEU
    this.dragBounds = dragBounds;
  }

  /** Koordiniert das Rendern aller Karten auf dem Spielfeld. */
  public renderAllCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
  ) {
    const renderedCardIds = new Set<string>();
    // ✨ OPTIMIERUNG: Erstelle eine Map aller Anhängsel, bevor das Rendern beginnt.
    // Dies vermeidet teure Suchen in jedem Render-Durchlauf für jede Karte.
    const attachmentMap = this._buildAttachmentMap(player, opponent);

    this.renderHandCards(player, attachmentMap, renderedCardIds);
    if (opponent) {
      this.renderOpponentHandCards(opponent, attachmentMap, renderedCardIds);
    }

    const totalTerritoryCount = this.renderTerritoryCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.renderLandOfBondageCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.renderDiscardPileCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.renderNewZoneCards(player, opponent, attachmentMap, renderedCardIds);
    this.renderBattlefieldCards(attachmentMap, renderedCardIds);

    this.elementManager.staticElements.boardText.setText(
      `Territory: ${totalTerritoryCount} Karten`,
    );
    this.cleanupUnusedCardUIs(renderedCardIds);
  }

  /**
   * ✨ NEU: Baut eine Map auf, die jeder Eltern-Karten-ID ein Array ihrer Kinder zuordnet.
   * Dies wird einmal pro Render-Zyklus aufgerufen, um die Performance zu verbessern.
   */
  private _buildAttachmentMap(
    player: PlayerState,
    opponent: PlayerState | undefined,
  ): Map<string, CardState[]> {
    const attachmentMap = new Map<string, CardState[]>();
    const allFieldCards: CardState[] = [];

    // Sammle alle Karten, die Anhängsel sein könnten
    allFieldCards.push(...player.territory, ...player.land_of_bondage);
    if (opponent) {
      allFieldCards.push(...opponent.territory, ...opponent.land_of_bondage);
    }
    allFieldCards.push(...this.room.state.battlefield);

    // Iteriere einmal, um die Map aufzubauen
    for (const card of allFieldCards) {
      if (card.attachedTo) {
        if (!attachmentMap.has(card.attachedTo)) {
          attachmentMap.set(card.attachedTo, []);
        }
        attachmentMap.get(card.attachedTo)!.push(card);
      }
    }
    return attachmentMap;
  }

  /**
   * ✨ NEU: Berechnet die Zielposition und den Winkel einer Karte in der Hand.
   * Diese Methode kapselt die Fächer-Logik, damit sie von außerhalb verwendet werden kann.
   * @param index Der Index der Karte in der Hand.
   * @param handSize Die Gesamtanzahl der Karten in der Hand.
   * @returns Die Zielkoordinaten und der Winkel.
   */
  public getHandCardTargetPosition(
    index: number,
    handSize: number,
  ): { x: number; y: number; angle: number } {
    const cardHeight = this.layout.handCardHeight;
    const maxTotalAngle = 40;
    // Parameter für den Fächer (identisch zu renderHandCards)
    const anglePerCard = Math.min(maxTotalAngle / Math.max(1, handSize - 1), 8);
    const totalAngle = (handSize - 1) * anglePerCard;
    const startAngle = -totalAngle / 2;

    const pivotY = this.layout.playerHand.bottom + cardHeight * 1.2;
    const radius = cardHeight * 1.5;

    const currentAngle = startAngle + index * anglePerCard;
    const angleRad = Phaser.Math.DegToRad(currentAngle);

    const x = this.layout.playerHand.centerX + radius * Math.sin(angleRad);
    const y = pivotY - radius * Math.cos(angleRad);

    return { x, y, angle: currentAngle };
  }

  /** Erstellt oder aktualisiert eine einzelne CardUI-Instanz. */
  private _processCard(
    cardData: CardState,
    targetX: number,
    targetY: number,
    targetAngle: number,
    attachmentMap: Map<string, CardState[]>, // ✨ OPTIMIERUNG
    renderedCardIds: Set<string>, // ✨ NEU: Set durchreichen
    // ✨ DEIN WUNSCH: Die Größe wird jetzt optional übergeben.
    // Wenn nicht, wird IMMER die Standardgröße aus dem Layout verwendet.
    targetWidth: number = this.layout.cardWidth,
    targetHeight: number = this.layout.cardHeight,
  ): CardUI {
    // ✨ DEIN PLAN: Detailliertes Logging zur Fehlersuche
    const cardId = cardData.id;
    const isNew = !this.cardUIs.has(cardId);
    // ✨ KORREKTUR: Prüfe, ob eine Animation im Manager für diese Karte registriert ist.
    // Das ist die einzige verlässliche Quelle, da der Tween auf einem Klon läuft.
    const isAnimating = this.animationManager.activeDrawTweens.has(cardId);

    //log("Renderer", `[PROCESS_CARD] Processing cardData:`, cardData.toJSON());
    // ✨ KORREKTUR: Berücksichtige den Status der Karte (isFaceDown) vom Server.
    let isFaceDown = cardData.isFaceDown;

    if (
      CONCEALED_ZONES.includes(cardData.zone) ||
      (cardData.zone === ZONES.HAND &&
        cardData.controllerId !== this.room.sessionId)
    ) {
      isFaceDown = true;
    }

    // ✨ KORREKTUR: Berücksichtige Drehung (Flip/Tap) bei der Winkelberechnung.
    let finalAngle = targetAngle;
    if (cardData.isFlipped) finalAngle += 180;
    if (cardData.isTapped) finalAngle += 90;

    const normalizedTargetAngle = Phaser.Math.Angle.WrapDegrees(finalAngle);

    let cardUI = this.cardUIs.get(cardData.id);

    if (!cardUI) {
      // ✨ DEIN PLAN: Logge die Erstellung eines neuen Objekts
      log(
        "Renderer", `[PROCESS_CARD] [CREATE] CardID: ${cardId.slice(
          -4,
        )}. Creating NEW CardUI.`,
      );
      cardUI = new CardUI(
        this.scene,
        targetX,
        targetY,
        cardData,
        targetWidth,
        targetHeight,
        isFaceDown,
      );
      this.cardUIs.set(cardData.id, cardUI);
      // Setze den Winkel nur bei der Erstellung, um Konflikte mit Tweens zu vermeiden.
      cardUI.setAngle(normalizedTargetAngle);
    } else {
      // ✨ DEIN PLAN: Logge die Wiederverwendung und den Zustand des bestehenden Objekts
      log(
        "Renderer", `[PROCESS_CARD] [UPDATE] CardID: ${cardId.slice(
          -4,
        )}, InstanceID: ${cardUI.instanceId.slice(
          // ✨ KORREKTUR: Logge die korrekte isAnimating-Variable
          -4,
        )}, Animating: ${isAnimating}`,
      );
      log(
        "Renderer", `  -> POSITIONS: Current (${cardUI.x.toFixed(0)}, ${cardUI.y.toFixed(
          0,
        )}) -> Target (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) | Depth: ${
          cardUI.depth
        }`,
      );

      // ✨ NEU: Erkenne, ob eine Karte von der Hand ausgespielt wurde (Hand -> Feld).
      // Dies löst die "Play"-Animation aus.
      const oldZone = cardUI.currentZone; // ✨ KORREKTUR: Nutze unseren zuverlässigen Zonen-Speicher
      const newZone = cardData.zone;

      // ✨ FIX: Wenn eine Karte die Hand verlässt (egal wohin, z.B. auch Discard/Banish),
      // müssen wir zwingend alle Hover-Effekte stoppen und die Skalierung zurücksetzen.
      if (oldZone === ZONES.HAND && newZone !== ZONES.HAND) {
        this.animationManager.stopHandHoverAnimation(cardUI);
      }

      // Wir prüfen, ob die Karte die Hand verlässt und in einen Spielbereich (Territory, LoB, Battlefield) geht.
      // Bewegungen auf Stapel (Deck, Discard, Reserve, Banish, LoR) sollen keine Play-Animation auslösen.
      const isPlayMove =
        oldZone === ZONES.HAND &&
        (newZone === ZONES.TERRITORY ||
          newZone === ZONES.LAND_OF_BONDAGE ||
          newZone === ZONES.BATTLEFIELD);

      // ✨ DEBUG: Logge die Entscheidungsgrundlage für die Play-Animation
      if (oldZone === ZONES.HAND && newZone !== ZONES.HAND) {
        log(
          "Renderer", `[PLAY_ANIM_CHECK] Card ${cardId.slice(
            -4,
          )}: OldZone=${oldZone}, NewZone=${newZone} -> isPlayMove=${isPlayMove}`,
        );
      }

      // Prüfe auch, ob bereits eine Animation läuft, um Doppelungen zu vermeiden.
      // ✨ KORREKTUR: Die Variable isAnimating haben wir bereits oben definiert.

      if (isPlayMove && !isAnimating) {
        // Starte die Animation von der AKTUELLEN Position (Drop-Position) zum neuen Ziel.
        this.animationManager.playCardPlayAnimation(
          cardUI,
          {
            x: cardUI.x, // ✨ Startet dort, wo der Spieler die Karte losgelassen hat
            y: cardUI.y,
            angle: cardUI.angle,
            width: cardUI.width, // Startet mit der aktuellen Größe (Handkarten-Größe)
            height: cardUI.height,
          },
          {
            x: targetX,
            y: targetY,
            angle: normalizedTargetAngle,
            width: targetWidth, // Endet mit der Zielgröße (Feldkarten-Größe)
            height: targetHeight,
          },
        );
      }

      // Wenn eine Animation läuft, dürfen wir die Position nicht manuell überschreiben.
      // Der Tween hat die Kontrolle.
      const hasMoved = cardData.lastMoved > cardUI.cardData.lastMoved;
      if (hasMoved) {
        const depth =
          cardData.zone === ZONES.DISCARD
            ? 2
            : cardData.zone === ZONES.TERRITORY
              ? 1
              : 0;
        cardUI.setDepth(depth);
        this.scene.children.bringToTop(cardUI);
      }
      cardUI.updateFaceDownStatus(isFaceDown);
      cardUI.cardData = cardData;
      cardUI.updateCounters(); // ✨ NEU: Counter-Anzeige aktualisieren
      cardUI.currentZone = cardData.zone; // ✨ NEU: Aktualisiere unseren Zonen-Speicher
    }

    // ✨ FINALE LÖSUNG: Aktualisiere die Zielposition auf der CardUI-Instanz bei jedem Render-Durchlauf.
    cardUI.targetX = targetX;
    cardUI.targetY = targetY;
    cardUI.targetAngle = normalizedTargetAngle;

    // ✨ FIX: Größe nur aktualisieren, wenn KEINE Animation läuft.
    // Wenn wir das während der Animation tun, überschreiben wir die Tween-Werte und die HitArea passt nicht.
    if (!isAnimating) {
      cardUI.updateSize(targetWidth, targetHeight);
    }

    const isAtTarget =
      Math.abs(cardUI.x - targetX) < 0.1 &&
      Math.abs(cardUI.y - targetY) < 0.1 &&
      Math.abs(cardUI.angle - normalizedTargetAngle) < 0.1;

    // ✨ FINALE KORREKTUR: Setze die Position nur, wenn die Karte NICHT animiert wird.
    // Dies ist die wahrscheinlichste Ursache des Problems: Wir kämpfen gegen den Animation-Tween.
    if (!isAtTarget && !isAnimating) {
      cardUI.x = targetX;
      cardUI.y = targetY;
      cardUI.setAngle(normalizedTargetAngle);
    }

    // Mache die Karte immer ziehbar.
    this.scene.input.setDraggable(cardUI);

    // Wenn eine Animation für diese Karte läuft oder vorgemerkt ist, muss das Original unsichtbar sein.
    // Ansonsten ist die CardUI selbst für ihre Sichtbarkeit verantwortlich (z.B. beim Laden des Bildes).
    const isPending = this.animationManager.pendingDrawAnimations.has(cardId);
    const isAnimatingActive =
      this.animationManager.activeDrawTweens.has(cardId);

    // ✨ KORREKTUR: Nutze die Sperre, um vorzeitiges Erscheinen durch Bild-Laden zu verhindern.
    cardUI.setLockedVisibility(isPending || isAnimatingActive);

    // ✨ FIX: Karte als gerendert markieren, damit sie nicht vom Cleanup gelöscht wird.
    renderedCardIds.add(cardData.id);

    // ✨ NEU (SCHRITT 2): Render Anhängsel (Attached Cards)
    // Wir suchen alle Karten, die an DIESER Karte hängen.
    // Dies geschieht rekursiv, falls Anhängsel selbst Anhängsel haben (selten, aber möglich).
    this.renderAttachments(
      cardData,
      targetX,
      targetY,
      normalizedTargetAngle,
      attachmentMap,
      renderedCardIds,
      targetWidth,
      targetHeight,
    );

    return cardUI;
  }

  /**
   * ✨ NEU: Findet und rendert Karten, die an der übergebenen Elternkarte hängen.
   */
  private renderAttachments(
    parentCard: CardState,
    parentX: number,
    parentY: number,
    parentAngle: number,
    attachmentMap: Map<string, CardState[]>, // ✨ OPTIMIERUNG
    renderedCardIds: Set<string>, // ✨ NEU: Set durchreichen
    width: number,
    height: number,
  ) {
    // ✨ OPTIMIERUNG: Greife auf die vorberechnete Map zu, statt neu zu suchen.
    const attachments = attachmentMap.get(parentCard.id) || [];

    if (attachments.length > 0) {
      log(
        "Renderer", `[RENDER] Card ${parentCard.id.slice(-4)} has ${attachments.length} attachments:`,
        attachments.map((c) => c.id.slice(-4)),
      );
    }

    attachments.forEach((att, index) => {
      // ✨ NEU: Visuelle Positionierung: Über der Karte, nach rechts oben versetzt.
      const offsetDistanceX = width * 0.2; // 20% nach rechts
      const offsetDistanceY = height * 0.2; // 20% nach oben
      const rad = Phaser.Math.DegToRad(parentAngle);

      // Wir berechnen den rotierten Vektor für (1, -1) [Rechts Oben]
      // Bei 0 Grad: x + offset, y - offset
      const offsetX =
        (Math.cos(rad) * offsetDistanceX - Math.sin(rad) * -offsetDistanceY) *
        (index + 1);
      const offsetY =
        (Math.sin(rad) * offsetDistanceX + Math.cos(rad) * -offsetDistanceY) *
        (index + 1);

      const targetX = parentX + offsetX;
      const targetY = parentY + offsetY;

      // ✨ DEBUG: Logge die berechneten Positionen
      if (DEBUG) {
        log(
          "Renderer", `[ATTACH DEBUG] Parent ${parentCard.id.slice(-4)} @ (${parentX.toFixed(0)}, ${parentY.toFixed(0)}) ` +
            `| Child ${att.id.slice(-4)} Target @ (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) ` +
            `| Offset: (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)})`,
        );
      }

      // Rekursiver Aufruf von _processCard für das Kind
      const attUI = this._processCard(
        att,
        targetX,
        targetY,
        parentAngle,
        attachmentMap,
        renderedCardIds,
        width,
        height,
      );

      // ✨ NEU: Tiefe setzen: ÜBER der Elternkarte.
      // Elternkarte hat Tiefe 1 (Territory). Kind bekommt 2, 3, etc.
      const parentUI = this.cardUIs.get(parentCard.id);
      if (parentUI) {
        // Wir setzen die Tiefe deutlich höher, um sicherzugehen.
        // Und wir nutzen setDepth auf dem Container.
        const newDepth = parentUI.depth + 5 + index;
        attUI.setDepth(newDepth);
        // Zusätzlich zur Sicherheit (falls Depths gleich sind):
        this.scene.children.bringToTop(attUI);
      }
    });
  }

  private renderHandCards(
    player: PlayerState,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const handSize = player.hand.length;
    if (handSize === 0) return;

    // ✨ FINALE LÖSUNG: Schritt 1 - Ein Array, um die zu startenden Animationen zu sammeln.
    const animationsToStart: {
      cardUI: CardUI;
      endPos: { x: number; y: number; angle: number };
    }[] = [];

    player.hand.forEach((cardData, index) => {
      // ✨ DEBUGGING: Logge die Werte, die zur Positionsberechnung verwendet werden.
      const { x, y, angle } = this.getHandCardTargetPosition(index, handSize);
      log(
        "Renderer", `[POS_CALC] Karte: ${cardData.id.slice(
          -4,
        )}, Index: ${index}, Handgröße: ${handSize} -> Ziel (x: ${x.toFixed(
          0,
        )}, y: ${y.toFixed(0)}, angle: ${angle.toFixed(1)})`,
      );

      const cardUI = this._processCard(
        cardData,
        x,
        y,
        angle,
        attachmentMap,
        renderedCardIds,
        this.layout.handCardWidth,
        this.layout.handCardHeight,
      );

      // ✨ FINALE KORREKTUR: Setze die Tiefe für Handkarten basierend auf ihrem Index.
      // Dies stellt sicher, dass die Karten sich korrekt überlappen (links unten, rechts oben).
      cardUI.setDepth(100 + index); // ✨ FIX: Handkarten immer über dem Spielfeld (Layer 100+)

      // ✨ DEIN PLAN: Prüfe, ob für diese Karte eine Zieh-Animation vorgemerkt ist.
      if (this.animationManager.pendingDrawAnimations.has(cardData.id)) {
        animationsToStart.push({ cardUI, endPos: { x, y, angle } });
      }
    });

    if (animationsToStart.length > 0) {
      const startRect =
        this.elementManager.zoneElements.playerDeckPile.getBounds();
      // ✨ FINALE KORREKTUR: Starte die Animationen gestaffelt mit einem Delay.
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

  private renderOpponentHandCards(
    opponent: PlayerState,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const handSize = opponent.hand.length;
    if (handSize === 0) return;

    // --- Parameter für den Fächer (gespiegelt) ---.
    const cardWidth = this.layout.handCardWidth;
    const cardHeight = this.layout.handCardHeight;

    const maxTotalAngle = 40;
    const anglePerCard = Math.min(maxTotalAngle / Math.max(1, handSize - 1), 8);
    const totalAngle = (handSize - 1) * anglePerCard;
    const startAngle = -totalAngle / 2;

    // ✨ FINALE KORREKTUR: Der Drehpunkt muss UNTERHALB der Karten liegen, genau wie beim Spieler,
    // um die gleiche Fächerform zu erzeugen (unten eng, oben breit).
    // Wir passen den Wert an, um den Fächer korrekt nach oben zu schieben.
    const pivotY = this.layout.opponentHand.y + cardHeight * 1.7;
    const radius = cardHeight * 1.5;

    opponent.hand.forEach((cardData, index) => {
      // Verwende die exakt gleiche Winkelberechnung wie beim Spieler.
      const currentAngle = startAngle + index * anglePerCard;
      const angleRad = Phaser.Math.DegToRad(currentAngle);

      const targetX =
        this.layout.opponentHand.centerX + radius * Math.sin(angleRad);
      // Y-Position wird vom Drehpunkt SUBTRAHIERT, um den Bogen nach oben zu öffnen,
      // genau wie beim Spieler.
      const targetY = pivotY - radius * Math.cos(angleRad);

      // Die Karte selbst wird um 180 Grad gedreht, damit sie auf dem Kopf steht
      const finalAngle = currentAngle + 180;

      const cardUI = this._processCard(
        cardData,
        targetX,
        targetY,
        finalAngle,
        attachmentMap,
        renderedCardIds,
        cardWidth,
        cardHeight,
      );
      cardUI.setDepth(100 + index); // ✨ FIX: Auch Gegner-Handkarten anheben
    });
  }

  private _renderCardRow(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    if (cards.length === 0) {
      return;
    }

    const isBattlePhase = this.room.state.currentPhase === "battle";
    const cardWidth = isBattlePhase
      ? this.layout.smallCardWidth
      : this.layout.cardWidth;
    const cardHeight = isBattlePhase
      ? this.layout.smallCardHeight
      : this.layout.cardHeight;

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
      const cardUI = this._processCard(
        cardData,
        targetX,
        targetY,
        angle,
        attachmentMap,
        renderedCardIds,
        cardWidth,
        cardHeight,
      );
    });
  }

  /**
   * ✨ KORREKTUR: Die funktionierende Logik für zentrierte, dynamische und gespiegelte Reihen.
   */
  private _renderUnmanagedRow(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    if (cards.length === 0) {
      return;
    }

    const isBattlePhase = this.room.state.currentPhase === "battle";
    const cardWidth = isBattlePhase
      ? this.layout.smallCardWidth
      : this.layout.cardWidth;
    const cardHeight = isBattlePhase
      ? this.layout.smallCardHeight
      : this.layout.cardHeight;

    const idealSpacing = cardWidth * 0.1;
    const idealTotalWidth =
      cards.length * cardWidth + Math.max(0, cards.length - 1) * idealSpacing;

    let actualSpacing: number;
    if (idealTotalWidth > area.width) {
      actualSpacing =
        (area.width - cards.length * cardWidth) / Math.max(1, cards.length - 1);
    } else {
      actualSpacing = idealSpacing;
    }

    const actualTotalWidth =
      cards.length * cardWidth + Math.max(0, cards.length - 1) * actualSpacing;
    const startX = area.centerX - actualTotalWidth / 2 + cardWidth / 2;
    const targetY = area.centerY;

    cards.forEach((cardData, index) => {
      let targetX = startX + index * (cardWidth + actualSpacing);
      // ✨ DEIN PLAN: Detailliertes Logging für jede Karte in dieser Funktion.
      log(
        "Renderer", `[RENDER_UNMANAGED_ROW] Processing card: ${cardData.Name} (ID: ${
          cardData.id
        }) | Controller: ${cardData.controllerId} | Owner: ${
          cardData.originalOwnerId
        } | Server Coords: (${(cardData.x || 0).toFixed(2)}, ${(
          cardData.y || 0
        ).toFixed(
          2,
        )}) | Calculated Target: (${targetX.toFixed(2)}, ${targetY.toFixed(2)})`,
      );
      let angle = isOpponent ? 180 : 0;

      // Dies ist die entscheidende Spiegelungslogik.
      const cardBelongsToMe = cardData.controllerId === this.room.sessionId;

      // Wir spiegeln, wenn die Karte dem Gegner gehört, aber ihre berechnete Position
      // auf unserer Seite des Feldes wäre (und umgekehrt).
      const needsMirror =
        (isOpponent && !cardBelongsToMe) || (!isOpponent && cardBelongsToMe);

      if (!needsMirror && typeof cardData.x === "number" && cardData.x !== 0) {
        // Wenn keine Spiegelung nötig ist, verwenden wir die Server-Koordinaten,
        // falls sie gesetzt sind (d.h. die Karte wurde manuell platziert).
        // Ansonsten verwenden wir die berechnete Position.
        targetX = cardData.x;
      } else if (needsMirror) {
        // Spiegel die berechnete Position auf die andere Seite.
        targetX = 2 * this.dragBounds.centerX - targetX;
        log(
          "Renderer", `  -> [MIRROR] Card '${
            cardData.id
          }' is being mirrored to X: ${targetX.toFixed(2)}`,
        );
      }

      const cardUI = this._processCard(
        cardData,
        targetX,
        targetY,
        angle,
        attachmentMap,
        renderedCardIds,
        cardWidth,
        cardHeight,
      );
    });
  }

  private _renderPlayerTerritory(
    playerState: PlayerState,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ): number {
    const { territory } = playerState;

    // ✨ DEBUG: Prüfen, ob der Client die 'attachedTo'-Information vom Server erhalten hat.
    if (DEBUG) {
      const attachedCards = territory.filter((c) => c.attachedTo);
      if (attachedCards.length > 0) {
        log(
          "Renderer", `[RENDER DEBUG] Found ${attachedCards.length} attached cards in territory:`,
          attachedCards.map((c) => `${c.id} -> ${c.attachedTo}`),
        );
      }
    }

    // ✨ NEU (SCHRITT 2): Filtere Karten heraus, die an anderen hängen.
    // Diese werden von _processCard der Elternkarte gerendert.
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

    const layoutAreas = {
      hero: isOpponent
        ? this.layout.opponentHeroArea
        : this.layout.playerHeroArea,
      fortress: isOpponent
        ? this.layout.opponentFortressArea
        : this.layout.playerFortressArea,
      ec: isOpponent ? this.layout.opponentECArea : this.layout.playerECArea,
      artifact: isOpponent
        ? this.layout.opponentArtifactArea
        : this.layout.playerArtifactArea,
    };

    this._renderCardRow(
      heroes,
      layoutAreas.hero,
      isOpponent,
      attachmentMap,
      renderedCardIds,
    );
    this._renderCardRow(
      fortresses,
      layoutAreas.fortress,
      isOpponent,
      attachmentMap,
      renderedCardIds,
    );
    this._renderCardRow(
      evilCharacters,
      layoutAreas.ec,
      isOpponent,
      attachmentMap,
      renderedCardIds,
    );
    this._renderCardRow(
      artifacts,
      layoutAreas.artifact,
      isOpponent,
      attachmentMap,
      renderedCardIds,
    );

    this._renderUnmanagedRow(
      unmanagedCards,
      isOpponent ? this.layout.opponentTerritory : this.layout.playerTerritory,
      isOpponent,
      attachmentMap,
      renderedCardIds,
    );

    return territory.length;
  }

  private renderTerritoryCards(
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

  private _renderZone(
    cards: CardState[],
    area: Phaser.Geom.Rectangle,
    isOpponent: boolean,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
    isPile: boolean = false,
  ) {
    cards.forEach((cardData, index) => {
      const isBattlePhase = this.room.state.currentPhase === "battle";
      const isLandOfBondage =
        area === this.layout.playerLandOfBondage ||
        area === this.layout.opponentLandOfBondage;

      const cardWidth =
        isBattlePhase && isLandOfBondage
          ? this.layout.smallCardWidth
          : this.layout.cardWidth;
      const cardHeight =
        isBattlePhase && isLandOfBondage
          ? this.layout.smallCardHeight
          : this.layout.cardHeight;

      let targetX, targetY, targetAngle;
      // ✨ DEIN WUNSCH: Nur bestimmte Stapel sollen einen zufälligen Winkel haben.
      const shouldHaveRandomAngle =
        isPile &&
        cardData.zone !== ZONES.RESERVE &&
        cardData.zone !== ZONES.DECK;
      const angleOffset = shouldHaveRandomAngle
        ? (parseInt(cardData.id.slice(-2), 16) % 20) - 10
        : 0;

      if (isPile) {
        targetX = area.centerX;
        targetY = area.centerY;
        targetAngle = (isOpponent ? 180 : 0) + angleOffset;
      } else {
        const cardSpacing = cardWidth * 1.1;
        targetX =
          area.centerX -
          ((cards.length - 1) * cardSpacing) / 2 +
          index * cardSpacing;
        targetY = area.centerY;
        targetAngle = isOpponent ? 180 : 0;
      }

      const cardUI = this._processCard(
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

  private renderLandOfBondageCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    // ✨ NEU: Auch hier nur Root-Karten rendern
    const rootLoB = player.land_of_bondage.filter((c) => !c.attachedTo);

    // ✨ DEIN VORSCHLAG: Rufe die neue, wiederverwendbare Methode auf.
    this._renderUnmanagedRow(
      rootLoB,
      this.layout.playerLandOfBondage,
      false,
      attachmentMap,
      renderedCardIds,
    );

    if (opponent) {
      const rootOppLoB = opponent.land_of_bondage.filter((c) => !c.attachedTo);
      // ✨ DEIN VORSCHLAG: Rufe die neue, wiederverwendbare Methode auf.
      this._renderUnmanagedRow(
        rootOppLoB,
        this.layout.opponentLandOfBondage,
        true,
        attachmentMap,
        renderedCardIds,
      );
    }
  }

  private renderDiscardPileCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    this._renderZone(
      player.discard,
      this.layout.playerDiscardPile,
      false,
      attachmentMap,
      renderedCardIds,
      true,
    );
    if (opponent) {
      this._renderZone(
        opponent.discard,
        this.layout.opponentDiscardPile,
        true,
        attachmentMap,
        renderedCardIds,
        true,
      );
    }
  }

  private renderNewZoneCards(
    player: PlayerState,
    opponent: PlayerState | undefined,
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    this._renderZone(
      player.land_of_redemption,
      this.layout.playerLandOfRedemptionPile,
      false,
      attachmentMap,
      renderedCardIds,
      true,
    );
    if (opponent) {
      this._renderZone(
        opponent.land_of_redemption,
        this.layout.opponentLandOfRedemptionPile,
        true,
        attachmentMap,
        renderedCardIds,
        true,
      );
    }
    this._renderZone(
      player.banish,
      this.layout.playerBanishPile,
      false,
      attachmentMap,
      renderedCardIds,
      true,
    );
    if (opponent) {
      this._renderZone(
        opponent.banish,
        this.layout.opponentBanishPile,
        true,
        attachmentMap,
        renderedCardIds,
        true,
      );
    }
  }

  private renderBattlefieldCards(
    attachmentMap: Map<string, CardState[]>,
    renderedCardIds: Set<string>,
  ) {
    const allBattlefieldCards = this.room.state.battlefield;

    // ✨ NEU: Auch im Battlefield nur Root-Karten im Grid anzeigen
    const rootBattlefield = allBattlefieldCards.filter(
      (c: CardState) => !c.attachedTo,
    );

    const playerBattleCards = allBattlefieldCards.filter(
      (card: CardState) =>
        card.controllerId === this.room.sessionId && !card.attachedTo,
    );
    const opponentBattleCards = allBattlefieldCards.filter(
      (card: CardState) =>
        card.controllerId !== this.room.sessionId && !card.attachedTo,
    );

    this._renderZone(
      playerBattleCards,
      this.layout.playerBattlefieldArea,
      false,
      attachmentMap,
      renderedCardIds,
    );

    this._renderZone(
      opponentBattleCards,
      this.layout.opponentBattlefieldArea,
      true,
      attachmentMap,
      renderedCardIds,
    );
  }

  public cleanupAllCards() {
    this.cardUIs.forEach((ui) => ui.destroy());
    this.cardUIs.clear();
  }

  private cleanupUnusedCardUIs(renderedCardIds: Set<string>) {
    for (const cardId of this.cardUIs.keys()) {
      if (!renderedCardIds.has(cardId)) {
        this.cardUIs.get(cardId)?.destroy();
        this.cardUIs.delete(cardId);
      }
    }
  }
}
