import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager.js"; // ✨ NEU
import { ZONES, type Zone } from "../../../../shared/zones";
import { PHASES } from "../../../../shared/phases.js";
import { PileUI } from "../PileUI";
import { StackedPileUI } from "../StackedPileUI";
import { log, DEBUG } from "../../utils/logger";
import { StaticElementFactory } from "../factories/StaticElementFactory"; // ✨ NEU
import { ZoneFactory } from "../factories/ZoneFactory"; // ✨ NEU
import { type StaticElements, type ZoneElements } from "../types/ElementTypes"; // ✨ NEU
import { PHASE_BAR_STYLE } from "../config/visualConfig"; // ✨ NEU

/**
 * ✨ REFACTORING: Verwaltet die Erstellung, Positionierung und den Zugriff
 * auf alle statischen und zonenbasierten UI-Elemente des Spiels.
 */
export class ElementManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  public layout: GameLayout;
  private networkManager: GameNetworkManager; // ✨ NEU

  // ✨ REFACTORING: Öffentliche Eigenschaften, um die erstellten Elemente zu speichern.
  public staticElements!: StaticElements;
  public zoneElements!: ZoneElements;

  private staticFactory: StaticElementFactory;
  private zoneFactory: ZoneFactory;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    layout: GameLayout,
    networkManager: GameNetworkManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.layout = layout;
    this.networkManager = networkManager; // ✨ NEU

    this.staticFactory = new StaticElementFactory(scene);
    this.zoneFactory = new ZoneFactory(scene, room, networkManager);
  }

  /** ✨ REFACTORING: Hauptmethode, die alle Elemente erstellt. */
  public createAllElements() {
    this.staticElements = this.staticFactory.create();
    this.zoneElements = this.zoneFactory.create(this.layout);
  }

  /** Positioniert alle UI-Elemente neu, z.B. bei einer Fenstergrößen-Änderung. */
  public repositionUI(newLayout: GameLayout) {
    this.layout = newLayout;

    // === ZONEN NEU POSITIONIEREN UND INTERAKTIV MACHEN ===
    const repositionZone = (
      zone: Phaser.GameObjects.Zone,
      rect: Phaser.Geom.Rectangle,
    ) => {
      zone.setPosition(rect.x, rect.y).setSize(rect.width, rect.height);
      // ✨ KORREKTUR: Aktualisiere auch hier die Hit-Area, wenn die Fenstergröße sich ändert.
      if (zone.input) {
        zone.input.hitArea.setSize(rect.width, rect.height);
      }
      // Die interaktive Area wird automatisch mit setSize aktualisiert, wenn sie die ganze Zone umfasst.
    };
    repositionZone(this.zoneElements.playerHandZone, this.layout.playerHand);
    repositionZone(
      this.zoneElements.opponentHandZone,
      this.layout.opponentHand,
    );
    repositionZone(
      this.zoneElements.playerTerritoryZone,
      this.layout.playerTerritory,
    );
    repositionZone(
      this.zoneElements.playerLandOfBondageZone,
      this.layout.playerLandOfBondage,
    );
    repositionZone(
      this.zoneElements.opponentTerritoryZone,
      this.layout.opponentTerritory,
    );
    repositionZone(
      this.zoneElements.opponentLandOfBondageZone,
      this.layout.opponentLandOfBondage,
    );

    // ✨ NEU (BATTLE): Positioniere die neuen Battlefield-Zone neu.
    const fullBattlefieldRect = Phaser.Geom.Rectangle.Union(
      this.layout.playerBattlefieldArea,
      this.layout.opponentBattlefieldArea,
    );
    repositionZone(this.zoneElements.battlefieldZone, fullBattlefieldRect);

    // ✨ KORREKTUR: Steuere die Aktivität und Sichtbarkeit der Battlefield-Zone basierend auf der korrekten Phase.
    // ✨ FINALE KORREKTUR: Steuere die Aktivität und Sichtbarkeit der Battlefield-Zone basierend auf der korrekten Phase.
    // Die Zone soll nur in der 'battle'-Phase eine gültige Drop-Zone sein.
    const isBattlePhase = this.room.state.currentPhase === PHASES.BATTLE;
    this.zoneElements.battlefieldZone.setVisible(isBattlePhase);
    if (this.zoneElements.battlefieldZone.input) {
      this.zoneElements.battlefieldZone.input.enabled = isBattlePhase;
    }
    log("UI", `[repositionUI] Battlefield zone active: ${isBattlePhase}`);

    // Visuelle Stapel neu positionieren
    this.zoneElements.playerDeckPile.setPosition(
      this.layout.playerDeckPile.centerX,
      this.layout.playerDeckPile.centerY,
    );
    this.zoneElements.playerDiscardPile.setPosition(
      this.layout.playerDiscardPile.centerX,
      this.layout.playerDiscardPile.centerY,
    );
    this.zoneElements.opponentDeckPile.setPosition(
      this.layout.opponentDeckPile.centerX,
      this.layout.opponentDeckPile.centerY,
    );
    this.zoneElements.opponentDiscardPile.setPosition(
      this.layout.opponentDiscardPile.centerX,
      this.layout.opponentDiscardPile.centerY,
    );

    // ✨ NEU (PHASE 2): Positioniere die neuen Piles
    this.zoneElements.playerReservePile.setPosition(
      this.layout.playerReservePile.centerX,
      this.layout.playerReservePile.centerY,
    );
    this.zoneElements.opponentReservePile.setPosition(
      this.layout.opponentReservePile.centerX,
      this.layout.opponentReservePile.centerY,
    );
    this.zoneElements.playerLandOfRedemptionPile.setPosition(
      this.layout.playerLandOfRedemptionPile.centerX,
      this.layout.playerLandOfRedemptionPile.centerY,
    );
    this.zoneElements.opponentLandOfRedemptionPile.setPosition(
      this.layout.opponentLandOfRedemptionPile.centerX,
      this.layout.opponentLandOfRedemptionPile.centerY,
    );
    this.zoneElements.playerBanishPile.setPosition(
      this.layout.playerBanishPile.centerX,
      this.layout.playerBanishPile.centerY,
    );
    this.zoneElements.opponentBanishPile.setPosition(
      this.layout.opponentBanishPile.centerX,
      this.layout.opponentBanishPile.centerY,
    );

    // ✨ KORREKTUR: Auch die Größe der Piles und ihrer interaktiven Bereiche muss aktualisiert werden.
    const updatePileSize = (pile: PileUI | StackedPileUI) => {
      if (!pile) return; // Sicherheitsabfrage
      pile.updateSize(this.layout.pileWidth, this.layout.pileHeight);
    };
    updatePileSize(this.zoneElements.playerDeckPile);
    updatePileSize(this.zoneElements.playerDiscardPile);
    updatePileSize(this.zoneElements.opponentDeckPile);
    updatePileSize(this.zoneElements.opponentDiscardPile);
    // ✨ NEU (PHASE 2): Aktualisiere auch die Größe der neuen Piles
    updatePileSize(this.zoneElements.playerReservePile);
    updatePileSize(this.zoneElements.opponentReservePile);
    updatePileSize(this.zoneElements.playerLandOfRedemptionPile);
    updatePileSize(this.zoneElements.opponentLandOfRedemptionPile);
    updatePileSize(this.zoneElements.playerBanishPile);
    updatePileSize(this.zoneElements.opponentBanishPile);

    // Texte neu positionieren
    this.staticElements.nextPhaseButton.setPosition(
      this.layout.nextPhaseButton.x,
      this.layout.nextPhaseButton.y,
    ).setScale(this.layout.buttonScale ?? 1.0);
    // ✨ NEU: Concede Button positionieren
    this.staticElements.concedeButton.setPosition(
      this.layout.concedeButton.x,
      this.layout.concedeButton.y,
    ).setScale(this.layout.buttonScale ?? 1.0);

    this.staticElements.boardText.setPosition(20, 70);

    // ✨ NEU: Phasen-Icons positionieren
    const phasesToShow = Object.values(PHASES) as string[];
    phasesToShow.forEach((phase) => {
      const icon = this.staticElements.phaseIcons[phase];
      const layoutData = this.layout.phaseIcons[phase];
      if (icon && layoutData) {
        icon.setPosition(layoutData.x, layoutData.y);
        // ✨ FIX: Nutze den gespeicherten Skalierungsfaktor (oder Standard 0.9 für inaktiv),
        // damit die Icons während Animationen nicht auf 100% springen.
        const scale = icon.getData("scaleFactor") ?? 0.9;
        icon.setDisplaySize(layoutData.size * scale, layoutData.size * scale);
      }
    });

    // ✨ NEU: Zeichne die 3D-Hintergrundleiste um die Icons
    const barLayout = this.layout.phaseBar;
    const barX = barLayout.x - barLayout.width / 2;
    const barY = barLayout.y - barLayout.height / 2;

    const bar = this.staticElements.phaseBar;
    bar.clear();

    // 1. Schlagschatten (Weich, nach unten rechts versetzt)
    bar.fillStyle(PHASE_BAR_STYLE.SHADOW_COLOR, PHASE_BAR_STYLE.SHADOW_ALPHA);
    bar.fillRoundedRect(
      barX + 4,
      barY + 4,
      barLayout.width,
      barLayout.height,
      barLayout.radius,
    );

    // 2. Basis-Körper (Dunkles UI-Blau/Grau)
    bar.fillStyle(PHASE_BAR_STYLE.FILL_COLOR, PHASE_BAR_STYLE.FILL_ALPHA);
    bar.fillRoundedRect(
      barX,
      barY,
      barLayout.width,
      barLayout.height,
      barLayout.radius,
    );

    // 3. Glanzlicht oben (Simuliert Wölbung/Plastizität)
    bar.fillStyle(
      PHASE_BAR_STYLE.HIGHLIGHT_COLOR,
      PHASE_BAR_STYLE.HIGHLIGHT_ALPHA,
    );
    bar.fillRoundedRect(barX, barY, barLayout.width, barLayout.height / 2, {
      tl: barLayout.radius,
      tr: barLayout.radius,
      bl: 0,
      br: 0,
    });

    // 4. Rand (Subtiler Rahmen für Definition)
    bar.lineStyle(
      2,
      PHASE_BAR_STYLE.STROKE_COLOR,
      PHASE_BAR_STYLE.STROKE_ALPHA,
    );
    bar.strokeRoundedRect(
      barX,
      barY,
      barLayout.width,
      barLayout.height,
      barLayout.radius,
    );

    // ✨ NEU: Settings Button oben rechts positionieren
    this.staticElements.settingsButton.setPosition(
      this.layout.settingsButton.hiddenX,
      this.layout.settingsButton.y,
    );

    // ✨ NEU: Save Button positionieren
    this.staticElements.saveButton.setPosition(
      this.layout.saveButton.hiddenX,
      this.layout.saveButton.y,
    );

    // ✨ NEU: Help Button positionieren
    this.staticElements.helpButton.setPosition(
      this.layout.helpButton.hiddenX,
      this.layout.helpButton.y,
    );

    // ✨ NEU: Info-Texte positionieren
    this.staticElements.playerInfoText.setPosition(
      this.layout.playerInfo.x,
      this.layout.playerInfo.y,
    );
    this.staticElements.opponentInfoText.setPosition(
      this.layout.opponentInfo.x,
      this.layout.opponentInfo.y,
    );
  }

  /** ✨ NEU: Zerstört alle von diesem Manager erstellten UI-Elemente. */
  public destroy() {
    // Zerstöre alle statischen Elemente
    this.staticElements.boardText.destroy();
    this.staticElements.nextPhaseButton.destroy();
    this.staticElements.concedeButton.destroy(); // ✨ NEU
    // nextPhaseText wird automatisch zerstört, da es Teil des Containers ist
    this.staticElements.settingsButton.destroy();
    this.staticElements.saveButton.destroy(); // ✨ NEU
    this.staticElements.helpButton.destroy(); // ✨ NEU
    this.staticElements.phaseIndicator.destroy(); // ✨ NEU: Aufräumen
    this.staticElements.phaseBar.destroy(); // ✨ NEU: Aufräumen
    this.staticElements.playerInfoText.destroy(); // ✨ NEU
    this.staticElements.opponentInfoText.destroy(); // ✨ NEU
    Object.values(this.staticElements.phaseIcons).forEach((icon) =>
      icon.destroy(),
    );
    this.staticElements.highlightOverlay.destroy(); // ✨ NEU

    // Zerstöre alle Zonenelemente (Zonen und Piles)
    Object.values(this.zoneElements).forEach((element) => element.destroy());
  }

  /**
   * ✨ NEU: Zeigt das Highlight-Overlay über einer bestimmten Zone an.
   * @param zone Die Zone (oder das Objekt), über dem das Highlight erscheinen soll.
   * @param text Der Text, der angezeigt werden soll (z.B. "My Territory").
   * @param color Die Farbe des Rahmens (Hex).
   */
  public showZoneHighlight(
    zone: Phaser.GameObjects.GameObject,
    text: string,
    color: number,
  ) {
    const bounds = (zone as any).getBounds ? (zone as any).getBounds() : null;
    if (!bounds) return;

    const { highlightOverlay, highlightGraphics, highlightText } =
      this.staticElements;

    highlightOverlay.setVisible(true);
    highlightText.setText(text);
    highlightText.setPosition(bounds.centerX, bounds.centerY);

    // ✨ FIX: Dunkles Gold für besseren Kontrast
    highlightText.setTint(0x8b6508);

    highlightGraphics.clear();
    highlightGraphics.fillStyle(color, 0.3); // Weniger Transparenz für bessere Sichtbarkeit
    highlightGraphics.fillRoundedRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      15,
    );
  }

  /** ✨ NEU: Versteckt das Highlight-Overlay. */
  public hideZoneHighlight() {
    this.staticElements.highlightOverlay.setVisible(false);
  }

  /** ✨ NEU: Richtet die UI für einen beigetretenen Gegner ein. */
  public setupOpponentUI(opponentId: string) {
    const {
      opponentLandOfBondageZone,
      opponentTerritoryZone,
      opponentDeckPile,
      opponentDiscardPile,
      opponentReservePile,
      opponentLandOfRedemptionPile,
      opponentBanishPile,
      opponentHandZone,
    } = this.zoneElements;

    opponentLandOfBondageZone.setData("ownerId", opponentId);
    opponentTerritoryZone.setData("ownerId", opponentId);
    opponentDeckPile?.setData("ownerId", opponentId);
    opponentDiscardPile?.setData("ownerId", opponentId);
    opponentReservePile?.setData("ownerId", opponentId);
    opponentLandOfRedemptionPile?.setData("ownerId", opponentId);
    opponentBanishPile?.setData("ownerId", opponentId);
    opponentHandZone.setData("ownerId", opponentId);

    log("ElementManager", `Opponent zones assigned to owner: ${opponentId}`);
  }
}
