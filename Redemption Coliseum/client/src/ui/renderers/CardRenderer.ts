import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type ElementManager } from "../managers/ElementManager";
import { type TypedRoom } from "../gameUI.js";
import { CardUI } from "../CardUI.js";
import { type CardState, type PlayerState } from "../../../../shared/types";
import { ZONES, CONCEALED_ZONES } from "../../../../shared/zones";
import { type AnimationManager } from "../managers/AnimationManager.js";
import { log, DEBUG } from "../../utils/logger";
import { HandRenderer } from "./HandRenderer"; // ✨ Liegt jetzt im selben Ordner
import { FieldRenderer } from "./FieldRenderer"; // ✨ NEU
import { PileRenderer } from "./PileRenderer"; // ✨ NEU

/**
 * ✨ REFACTORING: Verwaltet das Rendern (Erstellen, Positionieren, Aktualisieren)
 * aller CardUI-Objekte basierend auf dem Spielzustand.
 */
export class CardRenderer {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private _layout: GameLayout; // ✨ FIX: Internes Feld für Getter/Setter
  private elementManager: ElementManager;
  private cardUIs = new Map<string, CardUI>();
  private animationManager: AnimationManager;
  private dragBounds: Phaser.Geom.Rectangle;
  private handRenderer: HandRenderer;
  private fieldRenderer: FieldRenderer; // ✨ NEU
  private pileRenderer: PileRenderer; // ✨ NEU

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    layout: GameLayout,
    elementManager: ElementManager,
    animationManager: AnimationManager,
    dragBounds: Phaser.Geom.Rectangle,
  ) {
    this.scene = scene;
    this.room = room;
    this._layout = layout; // ✨ FIX
    this.elementManager = elementManager;
    this.animationManager = animationManager;
    this.dragBounds = dragBounds;

    // ✨ NEU: Sub-Renderer initialisieren
    this.handRenderer = new HandRenderer(
      this.layout,
      this.elementManager,
      this.animationManager,
      this.processCard.bind(this), // Wir übergeben die Methode gebunden an diese Instanz
      this.scene.registry.get("settingsManager") // ✨ NEU
    );

    // ✨ NEU: Field-Renderer initialisieren
    this.fieldRenderer = new FieldRenderer(
      this.layout,
      this.room,
      this.dragBounds,
      this.processCard.bind(this),
    );

    // ✨ NEU: Pile-Renderer initialisieren
    this.pileRenderer = new PileRenderer(
      this.layout,
      this.processCard.bind(this),
    );

    // ✨ NEU: Einzelner Listener für alle Karten-Updates (Performance)
    this.scene.events.on("update", this.update, this);
  }

  /** ✨ NEU: Zentrales Update für alle aktiven Karten. */
  public update(time: number, delta: number) {
    this.cardUIs.forEach((cardUI) => {
      if (cardUI.active) {
        cardUI.update(time, delta);
      }
    });
  }

  /** ✨ FIX: Setter, der Änderungen an die Sub-Renderer weitergibt */
  public set layout(newLayout: GameLayout) {
    this._layout = newLayout;
    this.handRenderer.setLayout(newLayout);
    this.fieldRenderer.setLayout(newLayout);
    this.pileRenderer.setLayout(newLayout);
  }

  public get layout(): GameLayout {
    return this._layout;
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

    this.handRenderer.renderHandCards(player, attachmentMap, renderedCardIds);
    if (opponent) {
      this.handRenderer.renderOpponentHandCards(
        opponent,
        attachmentMap,
        renderedCardIds,
      );
    }

    const totalTerritoryCount = this.fieldRenderer.renderTerritoryCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.fieldRenderer.renderLandOfBondageCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.pileRenderer.renderDiscardPileCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.pileRenderer.renderNewZoneCards(
      player,
      opponent,
      attachmentMap,
      renderedCardIds,
    );
    this.fieldRenderer.renderBattlefieldCards(attachmentMap, renderedCardIds);

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

  /** ✨ FIX: Public gemacht, damit Sub-Renderer darauf zugreifen können. */
  public processCard(
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

    const oldZone = cardUI ? cardUI.currentZone : cardData.zone;
    const newZone = cardData.zone;

    if (!cardUI) {
      // ✨ DEIN PLAN: Logge die Erstellung eines neuen Objekts
      log(
        "Renderer",
        `[PROCESS_CARD] [CREATE] CardID: ${cardId.slice(
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
        "Renderer",
        `[PROCESS_CARD] [UPDATE] CardID: ${cardId.slice(
          -4,
        )}, InstanceID: ${cardUI.instanceId.slice(
          // ✨ KORREKTUR: Logge die korrekte isAnimating-Variable
          -4,
        )}, Animating: ${isAnimating}`,
      );
      log(
        "Renderer",
        `  -> POSITIONS: Current (${cardUI.x.toFixed(0)}, ${cardUI.y.toFixed(
          0,
        )}) -> Target (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) | Depth: ${
          cardUI.depth
        }`,
      );

      // ✨ NEU: Erkenne, ob eine Karte von der Hand ausgespielt wurde (Hand -> Feld).
      // Dies löst die "Play"-Animation aus.
      // (oldZone und newZone wurden oben definiert)

      // ✨ FIX: Wenn eine Karte die Hand verlässt (egal wohin, z.B. auch Discard/Banish),
      // müssen wir zwingend alle Hover-Effekte stoppen und die Skalierung zurücksetzen.
      if (oldZone === ZONES.HAND && newZone !== ZONES.HAND) {
        this.animationManager.stopHandHoverAnimation(cardUI);
      }

      // ✨ NEU: Sobald sich die Zone ändert, warten wir definitiv nicht mehr auf ein Overlay
      if (oldZone !== newZone) {
        cardUI.setData("waiting_for_overlay", false);
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
          "Renderer",
          `[PLAY_ANIM_CHECK] Card ${cardId.slice(
            -4,
          )}: OldZone=${oldZone}, NewZone=${newZone} -> isPlayMove=${isPlayMove}`,
        );
      }

      // Prüfe auch, ob bereits eine Animation läuft, um Doppelungen zu vermeiden.
      // ✨ KORREKTUR: Die Variable isAnimating haben wir bereits oben definiert.

      // ✨ FIX: Wir müssen die cardData jetzt schon aktualisieren, damit 
      // sekundäre Effekte (wie SymbolZoom) Zugriff auf das aktuelle inGameType haben!
      const hasMoved = cardData.lastMoved > cardUI.cardData.lastMoved;
      cardUI.cardData = cardData;

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
      if (hasMoved) {
        this.scene.children.bringToTop(cardUI);
      }
      cardUI.updateFaceDownStatus(isFaceDown);
      cardUI.visuals.updateBadge();
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

    // ✨ FINALE KORREKTUR: Teleport-Schutz
    // Wir positionieren die Karte nur hart, wenn:
    // 1. Sie nicht am Ziel ist
    // 2. KEINE Animation läuft (frische Prüfung!)
    // 3. Sie NICHT gerade vom User gezogen wird (oder auf Server-Drop-Bestätigung wartet)
    if (!isAtTarget && !isAnimating && !cardUI.isBeingDragged && !cardUI.getData("waiting_for_overlay")) {
      // ✨ NEU: Smooth transition for cards shifting within the same play area (like Lost Souls adjusting to hand size)
      if (oldZone === newZone && 
          (oldZone === ZONES.LAND_OF_BONDAGE || oldZone === ZONES.TERRITORY || oldZone === ZONES.BATTLEFIELD)) {
        this.scene.tweens.add({
          targets: cardUI,
          x: targetX,
          y: targetY,
          angle: normalizedTargetAngle,
          duration: 300,
          ease: 'Power2'
        });
      } else {
        cardUI.x = targetX;
        cardUI.y = targetY;
        cardUI.setAngle(normalizedTargetAngle);
      }
    }

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
        "Renderer",
        `[RENDER] Card ${parentCard.id.slice(-4)} has ${attachments.length} attachments:`,
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
          "Renderer",
          `[ATTACH DEBUG] Parent ${parentCard.id.slice(-4)} @ (${parentX.toFixed(0)}, ${parentY.toFixed(0)}) ` +
            `| Child ${att.id.slice(-4)} Target @ (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) ` +
            `| Offset: (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)})`,
        );
      }

      // Rekursiver Aufruf von _processCard für das Kind
      const attUI = this.processCard(
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

  /** ✨ NEU: Bereinigt den Renderer und stoppt die Update-Schleife. */
  public destroy() {
    this.scene.events.off("update", this.update, this);
    this.cleanupAllCards();
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
