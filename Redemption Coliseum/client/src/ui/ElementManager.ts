import Phaser from "phaser";
import { type GameLayout } from "./layout";
import { type TypedRoom } from "./gameUI";
import { ZONES, type Zone } from "../../../shared/zones";
import { PHASES } from "../../../shared/phases.js";
import { PileUI } from "./PileUI";
import { StackedPileUI } from "./StackedPileUI";
import { log, DEBUG } from "../utils/logger";

// ✨ NEU: Zentrale Konfiguration für das Design der Phasen-Leiste
const PHASE_BAR_STYLE = {
  FILL_COLOR: 0x1a1a2e, // Dunkles Blau/Grau für den Körper
  FILL_ALPHA: 0.9, // Deckkraft des Körpers
  SHADOW_COLOR: 0x000000, // Schattenfarbe
  SHADOW_ALPHA: 0.5, // Schattenstärke
  HIGHLIGHT_COLOR: 0xffffff, // Glanzlicht oben
  HIGHLIGHT_ALPHA: 0.05, // Stärke des Glanzlichts
  STROKE_COLOR: 0x444466, // Randfarbe
  STROKE_ALPHA: 0.8, // Randstärke
  CORNER_RADIUS: 15, // Rundung der Ecken (wird auch vom Layout beeinflusst)
};

// ✨ REFACTORING: Typen für die UI-Elemente, hierher verschoben aus gameUI.ts
type StaticElements = {
  boardText: Phaser.GameObjects.Text;
  phaseIcons: { [key: string]: Phaser.GameObjects.Image }; // ✨ NEU: Map für Phasen-Icons
  nextPhaseButton: Phaser.GameObjects.Container; // ✨ FIX: Jetzt ein Container
  concedeButton: Phaser.GameObjects.Container; // ✨ NEU
  settingsButton: Phaser.GameObjects.Image; // ✨ NEU
  saveButton: Phaser.GameObjects.Image; // ✨ NEU
  helpButton: Phaser.GameObjects.Image; // ✨ NEU
  phaseIndicator: Phaser.GameObjects.Graphics; // ✨ NEU: Das Hintergrund-Licht
  phaseBar: Phaser.GameObjects.Graphics; // ✨ NEU: Die 3D-Hintergrundleiste
  playerInfoText: Phaser.GameObjects.BitmapText; // ✨ NEU: Spielername & Deck
  opponentInfoText: Phaser.GameObjects.BitmapText; // ✨ NEU: Gegnername & Deck
  highlightOverlay: Phaser.GameObjects.Container; // ✨ NEU: Container für Zonen-Highlight
  highlightGraphics: Phaser.GameObjects.Graphics; // ✨ NEU: Rahmen/Hintergrund
  highlightText: Phaser.GameObjects.BitmapText; // ✨ NEU: Text
};
type ZoneElements = {
  playerLandOfBondageZone: Phaser.GameObjects.Zone;
  opponentLandOfBondageZone: Phaser.GameObjects.Zone;
  playerTerritoryZone: Phaser.GameObjects.Zone;
  opponentTerritoryZone: Phaser.GameObjects.Zone;
  playerHandZone: Phaser.GameObjects.Zone;
  opponentHandZone: Phaser.GameObjects.Zone;
  battlefieldZone: Phaser.GameObjects.Zone; // ✨ NEU (BATTLE)
  playerDeckPile: StackedPileUI;
  playerDiscardPile: PileUI;
  opponentDeckPile: StackedPileUI;
  opponentDiscardPile: PileUI;
  playerReservePile: StackedPileUI;
  opponentReservePile: StackedPileUI;
  playerLandOfRedemptionPile: PileUI;
  opponentLandOfRedemptionPile: PileUI;
  playerBanishPile: PileUI;
  opponentBanishPile: PileUI;
};

/**
 * ✨ REFACTORING: Verwaltet die Erstellung, Positionierung und den Zugriff
 * auf alle statischen und zonenbasierten UI-Elemente des Spiels.
 */
export class ElementManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  public layout: GameLayout;

  // ✨ REFACTORING: Öffentliche Eigenschaften, um die erstellten Elemente zu speichern.
  public staticElements!: StaticElements;
  public zoneElements!: ZoneElements;

  constructor(scene: Phaser.Scene, room: TypedRoom, layout: GameLayout) {
    this.scene = scene;
    this.room = room;
    this.layout = layout;
  }

  /** ✨ REFACTORING: Hauptmethode, die alle Elemente erstellt. */
  public createAllElements() {
    this.staticElements = this.createStaticElements();
    this.zoneElements = this.createZoneElements();
  }

  /** Erstellt alle statischen UI-Elemente wie Texte und Buttons. */
  private createStaticElements(): StaticElements {
    const boardText = this.scene.add.text(0, 0, "Board: 0 Karten", {
      fontSize: "16px",
      color: "#aaf",
    });
    boardText.setVisible(DEBUG); // ✨ FIX: Nur im Debug-Modus anzeigen

    // ✨ NEU: Next Phase Button als Container mit Bild und Text
    const nextPhaseButton = this.scene.add.container(0, 0).setVisible(false);

    // ✨ NEU: Hintergrund-Bar für den Button (3D-Look, passend zur Phasenleiste)
    const btnBar = this.scene.add.graphics();
    const barWidth = 80; // ✨ FIX: Schmaler (war 100), um Überlappungen zu vermeiden
    const barHeight = 46; // Etwas höher als der Pfeil (30px)
    const radius = 12;
    const barX = -barWidth / 2;
    const barY = -barHeight / 2;

    // 1. Schlagschatten
    btnBar.fillStyle(0x000000, 0.5);
    btnBar.fillRoundedRect(barX + 3, barY + 3, barWidth, barHeight, radius);

    // 2. Basis-Körper
    btnBar.fillStyle(0x1a1a2e, 0.9);
    btnBar.fillRoundedRect(barX, barY, barWidth, barHeight, radius);

    // 3. Glanzlicht oben
    btnBar.fillStyle(0xffffff, 0.05);
    btnBar.fillRoundedRect(barX, barY, barWidth, barHeight / 2, {
      tl: radius,
      tr: radius,
      bl: 0,
      br: 0,
    });

    // 4. Rand
    btnBar.lineStyle(2, 0x444466, 0.8);
    btnBar.strokeRoundedRect(barX, barY, barWidth, barHeight, radius);

    // 1. Das Haupt-Bild (Button)
    const btnImage = this.scene.add.image(0, 0, "button_next_phase");
    // ✨ FIX: Button noch weiter verkleinert (ca. 60x30)
    btnImage.setDisplaySize(60, 30);
    btnImage.setName("arrow"); // ✨ NEU: Name für Zugriff im PhaseManager

    nextPhaseButton.add([btnBar, btnImage]);

    // ✨ REFACTORING: Pointer-Handling ist jetzt hier, entkoppelt vom PhaseManager.
    // Der Button sendet ein generisches Event, auf das der PhaseManager hört.

    // Echten Glow-FX für Hover/Klick vorbereiten
    let glowFx: any = null;
    if ((btnImage as any).preFX) {
      glowFx = (btnImage as any).preFX.addGlow(0xffd700, 0, 0, false);
    }

    // Interaktivität auf den Container legen mit expliziter HitArea
    // Zentriert (0,0), daher von -width/2 bis width/2
    const hitArea = new Phaser.Geom.Rectangle(barX, barY, barWidth, barHeight); // ✨ FIX: HitArea an Bar angepasst
    nextPhaseButton
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => {
        // Nur das Event auslösen. Die Logik liegt im PhaseManager.
        this.scene.events.emit("nextPhaseButtonClicked");

        // Visuelles Klick-Feedback direkt hier
        this.scene.tweens.add({
          targets: nextPhaseButton,
          scale: 1.05,
          duration: 50,
          yoyo: true,
        });
        if (glowFx) {
          this.scene.tweens.add({
            targets: glowFx,
            outerStrength: 6,
            duration: 50,
            yoyo: true,
          });
        }
      })
      .on("pointerover", () => {
        this.scene.tweens.add({
          targets: nextPhaseButton,
          scale: 1.15,
          duration: 100,
          ease: "Back.easeOut",
        });
        if (glowFx) {
          this.scene.tweens.add({
            targets: glowFx,
            outerStrength: 4,
            duration: 100,
          });
        } else {
          btnImage.setTint(0xffffaa);
        }
      })
      .on("pointerout", () => {
        this.scene.tweens.add({
          targets: nextPhaseButton,
          scale: 1.0,
          duration: 100,
        });
        if (glowFx) {
          this.scene.tweens.add({
            targets: glowFx,
            outerStrength: 0,
            duration: 100,
          });
        } else {
          btnImage.clearTint();
        }
      });

    // Cursor setzen
    if (nextPhaseButton.input) nextPhaseButton.input.cursor = "pointer";

    // ✨ NEU: Concede Button
    const concedeButton = this.scene.add.container(0, 0);

    // ✨ NEU: Hintergrund-Bar für den Concede-Button (Kopie vom Next-Phase-Button für Symmetrie)
    const concedeBar = this.scene.add.graphics();
    const cBarWidth = 80;
    const cBarHeight = 46;
    const cRadius = 12;
    const cBarX = -cBarWidth / 2;
    const cBarY = -cBarHeight / 2;

    // 1. Schlagschatten
    concedeBar.fillStyle(0x000000, 0.5);
    concedeBar.fillRoundedRect(
      cBarX + 3,
      cBarY + 3,
      cBarWidth,
      cBarHeight,
      cRadius,
    );

    // 2. Basis-Körper
    concedeBar.fillStyle(0x1a1a2e, 0.9);
    concedeBar.fillRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight, cRadius);

    // 3. Glanzlicht oben
    concedeBar.fillStyle(0xffffff, 0.05);
    concedeBar.fillRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight / 2, {
      tl: cRadius,
      tr: cRadius,
      bl: 0,
      br: 0,
    });

    // 4. Rand
    concedeBar.lineStyle(2, 0x444466, 0.8);
    concedeBar.strokeRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight, cRadius);

    const concedeImg = this.scene.add.image(0, 0, "button_concede");
    // Größe anpassen (etwas kleiner als 40, damit es gut in die 46px hohe Bar passt)
    concedeImg.setDisplaySize(36, 36);
    concedeButton.add([concedeBar, concedeImg]);

    // Interaktivität
    concedeButton.setInteractive(
      new Phaser.Geom.Rectangle(cBarX, cBarY, cBarWidth, cBarHeight),
      Phaser.Geom.Rectangle.Contains,
    );
    if (concedeButton.input) concedeButton.input.cursor = "pointer";

    // Hover-Effekt (Rot werden als Warnung)
    concedeButton.on("pointerover", () => {
      this.scene.tweens.add({
        targets: concedeButton,
        scale: 1.15,
        duration: 100,
        ease: "Back.easeOut",
      });
      concedeImg.setTint(0xffaaaa); // Rötlicher Tint
    });
    concedeButton.on("pointerout", () => {
      this.scene.tweens.add({
        targets: concedeButton,
        scale: 1.0,
        duration: 100,
      });
      concedeImg.clearTint();
    });
    // Klick-Logik wird in GameUI.ts behandelt

    // ✨ NEU: Settings Button (Gold)
    const settingsButton = this.scene.add
      .image(0, 0, "button_settings")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48) // Größe anpassen
      .setAlpha(0.6); // Voll sichtbar (Transparenz ist nicht nötig, da er eh versteckt ist)

    // ✨ NEU: Hover-Effekt für das Hineingleiten
    settingsButton.on("pointerover", () => {
      this.scene.tweens.add({
        targets: settingsButton,
        x: this.layout.GAME_WIDTH - 24, // Ganz sichtbar (Rechter Rand - halbe Breite)
        duration: 200,
        ease: "Sine.easeOut",
      });
    });
    settingsButton.on("pointerout", () => {
      this.scene.tweens.add({
        targets: settingsButton,
        x: this.layout.GAME_WIDTH + 12, // Zurück zur versteckten Position
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    // ✨ NEU: Save Button (unter Settings)
    const saveButton = this.scene.add
      .image(0, 0, "button_save")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.7); // ✨ FIX: Weniger transparent (war 0.6)

    saveButton.on("pointerover", () => {
      this.scene.tweens.add({
        targets: saveButton,
        x: this.layout.saveButton.visibleX,
        duration: 200,
        ease: "Sine.easeOut",
      });
    });
    saveButton.on("pointerout", () => {
      this.scene.tweens.add({
        targets: saveButton,
        x: this.layout.saveButton.hiddenX,
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    // ✨ NEU: Help Button (Links unter Chat)
    const helpButton = this.scene.add
      .image(0, 0, "button_help") // Asset: Button_Help_Copilot_20260216_130131_small.png
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6); // Konsistent mit Settings Button

    helpButton.on("pointerover", () => {
      this.scene.tweens.add({
        targets: helpButton,
        x: this.layout.helpButton.visibleX, // Slide nach rechts (rein)
        duration: 200,
        ease: "Sine.easeOut",
      });
    });
    helpButton.on("pointerout", () => {
      this.scene.tweens.add({
        targets: helpButton,
        x: this.layout.helpButton.hiddenX, // Slide nach links (raus)
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    // ✨ NEU: Indikator für die aktive Phase (Hintergrund-Leuchten)
    const phaseIndicator = this.scene.add.graphics();
    phaseIndicator.setBlendMode(Phaser.BlendModes.ADD); // Additives Mischen für Leuchteffekt
    phaseIndicator.setDepth(5); // Tiefe 5: Hinter den Icons (die bekommen 10)

    // ✨ NEU: Hintergrund-Bar für die Phasen-Icons (3D-Look)
    const phaseBar = this.scene.add.graphics();
    phaseBar.setDepth(1); // Tiefe 1: Ganz hinten (hinter Indikator und Icons)

    // ✨ NEU: Phasen-Icons erstellen
    const phaseIcons: { [key: string]: Phaser.GameObjects.Image } = {};
    // ✨ FIX: Definiere die Phasen und ihre Icons zentral und korrekt.
    // ✨ REFACTORING: Nutze dynamisch alle Phasen aus der Shared Config.
    const phasesToShow = Object.values(PHASES) as string[];

    const iconKeyMap: Record<string, string> = {
      [PHASES.PREP]: "icon_preparation", // Mapping von 'prep' zu 'icon_preparation'
    };

    phasesToShow.forEach((phase) => {
      const iconKey = iconKeyMap[phase] || `icon_${phase}`;
      // Position wird in repositionUI gesetzt
      const icon = this.scene.add
        .image(0, 0, iconKey)
        .setOrigin(0.5)
        // Größe wird in repositionUI gesetzt
        .setAlpha(1) // ✨ FIX: Initial voll sichtbar (wird in updateGameStateUI angepasst)
        .setVisible(true) // ✨ FIX: Explizit sichtbar machen
        .setDepth(10); // ✨ FIX: Icons müssen vor dem Indikator liegen

      // Tooltip oder ähnliches könnte hier hinzugefügt werden

      phaseIcons[phase] = icon;
    });

    // ✨ NEU: Spieler-Info (Links Unten)
    const playerInfoText = this.scene.add
      .bitmapText(0, 0, "wazoo", "", 22) // ✨ FIX: Wazoo statt Fairydust, etwas größer
      .setOrigin(0, 0) // Linksbündig
      .setTint(0xffd700) // Gold
      .setDropShadow(2, 2, 0x000000, 0.8);

    // ✨ NEU: Gegner-Info (Rechts Oben)
    const opponentInfoText = this.scene.add
      .bitmapText(0, 0, "wazoo", "Waiting...", 22) // ✨ FIX: Wazoo statt Fairydust
      .setOrigin(1, 0) // Ankerpunkt oben rechts
      .setRightAlign() // ✨ FIX: Textzeilen intern rechtsbündig ausrichten
      .setTint(0xffd700) // Gold
      .setDropShadow(2, 2, 0x000000, 0.8);

    // ✨ NEU: Highlight Overlay für Drag & Drop (Initial unsichtbar)
    const highlightOverlay = this.scene.add
      .container(0, 0)
      .setDepth(2000)
      .setVisible(false);
    const highlightGraphics = this.scene.add.graphics();
    const highlightText = this.scene.add
      .bitmapText(0, 0, "fairydust", "", 48)
      .setOrigin(0.5)
      .setAlpha(0.5) // Dezent
      .setTint(0xffffff)
      .setDropShadow(2, 2, 0x000000, 0.5);

    highlightOverlay.add([highlightGraphics, highlightText]);

    // Sanftes Pulsieren für den Text ("Atmen")
    this.scene.tweens.add({
      targets: highlightText,
      alpha: { from: 0.8, to: 1.0 }, // ✨ FIX: Höhere Deckkraft für bessere Lesbarkeit
      scale: { from: 0.95, to: 1.05 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    return {
      boardText,
      phaseIcons,
      nextPhaseButton,
      concedeButton, // ✨ NEU
      settingsButton,
      saveButton, // ✨ NEU
      helpButton, // ✨ NEU
      phaseIndicator,
      phaseBar,
      playerInfoText,
      opponentInfoText,
      highlightOverlay,
      highlightGraphics,
      highlightText,
    };
  }

  /** ✨ REFACTORING: Private Hilfsmethode zur Erstellung einer interaktiven Zone. */
  private _createZone(
    layoutRect: Phaser.Geom.Rectangle,
    zoneName: Zone,
    ownerId?: string,
  ): Phaser.GameObjects.Zone {
    const zone = this.scene.add
      .zone(layoutRect.x, layoutRect.y, layoutRect.width, layoutRect.height)
      .setOrigin(0, 0);
    zone.name = zoneName;
    // ✨ ENTSCHEIDENDE KORREKTUR: Mache die Zone interaktiv UND setze die Größe des klickbaren Bereichs.
    // Ohne dies hat die Zone eine Hit-Area von 0x0 und kann keine Drop-Events empfangen.
    zone.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, layoutRect.width, layoutRect.height),
      Phaser.Geom.Rectangle.Contains,
      true,
    );
    zone.setDropZone();
    if (ownerId) {
      zone.setData("ownerId", ownerId);
    }
    return zone;
  }

  /** Erstellt alle interaktiven Zonen und visuellen Stapel. */
  private createZoneElements(): ZoneElements {
    const { layout, scene, room } = this;

    // === GROSSE, UNSICHTBARE ZONEN ===
    const playerTerritoryZone = this._createZone(
      layout.playerTerritory,
      ZONES.TERRITORY,
      room.sessionId,
    );
    const playerLandOfBondageZone = this._createZone(
      layout.playerLandOfBondage,
      ZONES.LAND_OF_BONDAGE,
      room.sessionId,
    );
    const opponentTerritoryZone = this._createZone(
      layout.opponentTerritory,
      ZONES.TERRITORY,
    );
    const opponentLandOfBondageZone = this._createZone(
      layout.opponentLandOfBondage,
      ZONES.LAND_OF_BONDAGE,
    );
    const playerHandZone = this._createZone(
      layout.playerHand,
      ZONES.HAND,
      room.sessionId,
    );
    const opponentHandZone = this._createZone(layout.opponentHand, ZONES.HAND);
    // ✨ NEU (BATTLE): Erstelle die unsichtbare, aber klickbare Zone für das Battlefield.
    // Sie hat keinen spezifischen Besitzer, daher lassen wir die ownerId weg.
    // Wir erstellen eine große Zone, die beide Bereiche abdeckt, um das Droppen zu vereinfachen.
    const fullBattlefieldRect = Phaser.Geom.Rectangle.Union(
      layout.playerBattlefieldArea,
      layout.opponentBattlefieldArea,
    );
    const battlefieldZone = this._createZone(
      fullBattlefieldRect,
      ZONES.BATTLEFIELD,
    );

    // === VISUELLE STAPEL (sind jetzt selbst die Drop-Zonen) ===
    const playerDeckPile = new StackedPileUI(
      scene,
      layout.playerDeckPile.centerX,
      layout.playerDeckPile.centerY,
      ZONES.DECK,
      layout.pileWidth,
      layout.pileHeight,
      room,
    );
    const playerDiscardPile = new PileUI(
      scene,
      layout.playerDiscardPile.centerX,
      layout.playerDiscardPile.centerY,
      ZONES.DISCARD,
      layout.pileWidth,
      layout.pileHeight,
      room,
      false, // isOpponent
    );
    playerDeckPile.setData("ownerId", room.sessionId);
    playerDiscardPile.setData("ownerId", room.sessionId);

    const opponentDeckPile = new StackedPileUI(
      scene,
      layout.opponentDeckPile.centerX,
      layout.opponentDeckPile.centerY,
      ZONES.DECK,
      layout.pileWidth,
      layout.pileHeight,
      room,
      true, // isOpponent
    );
    const opponentDiscardPile = new PileUI(
      scene,
      layout.opponentDiscardPile.centerX,
      layout.opponentDiscardPile.centerY,
      ZONES.DISCARD,
      layout.pileWidth,
      layout.pileHeight,
      room,
      true, // isOpponent
    );
    opponentDiscardPile.setData("ownerId", undefined); // Platzhalter

    // ✨ NEU (PHASE 2): Erstelle die Piles für die neuen Zonen

    const opponentReservePile = new StackedPileUI(
      scene,
      layout.opponentReservePile.centerX,
      layout.opponentReservePile.centerY,
      ZONES.RESERVE,
      layout.pileWidth,
      layout.pileHeight,
      room,
      true, // isOpponent
    );
    opponentReservePile.setData("ownerId", undefined); // Platzhalter

    // ✨ DEIN WUNSCH: Die Reserve soll sich wie das Deck verhalten.
    // Wir ersetzen die PileUI durch eine StackedPileUI.
    const playerReservePile = new StackedPileUI(
      scene,
      layout.playerReservePile.centerX,
      layout.playerReservePile.centerY,
      ZONES.RESERVE,
      layout.pileWidth,
      layout.pileHeight,
      room,
    );
    playerReservePile.setData("ownerId", room.sessionId);
    const playerLandOfRedemptionPile = new PileUI(
      scene,
      layout.playerLandOfRedemptionPile.centerX,
      layout.playerLandOfRedemptionPile.centerY,
      ZONES.LAND_OF_REDEMPTION,
      layout.pileWidth,
      layout.pileHeight,
      room,
      false, // isOpponent
    );
    playerLandOfRedemptionPile.setData("ownerId", room.sessionId);

    const opponentLandOfRedemptionPile = new PileUI(
      scene,
      layout.opponentLandOfRedemptionPile.centerX,
      layout.opponentLandOfRedemptionPile.centerY,
      ZONES.LAND_OF_REDEMPTION,
      layout.pileWidth,
      layout.pileHeight,
      room,
      true, // isOpponent
    );
    opponentLandOfRedemptionPile.setData("ownerId", undefined); // Platzhalter

    const playerBanishPile = new PileUI(
      scene,
      layout.playerBanishPile.centerX,
      layout.playerBanishPile.centerY,
      ZONES.BANISH,
      layout.pileWidth,
      layout.pileHeight,
      room,
      false, // isOpponent
    );
    playerBanishPile.setData("ownerId", room.sessionId);

    const opponentBanishPile = new PileUI(
      scene,
      layout.opponentBanishPile.centerX,
      layout.opponentBanishPile.centerY,
      ZONES.BANISH,
      layout.pileWidth,
      layout.pileHeight,
      room,
      true, // isOpponent
    );
    opponentBanishPile.setData("ownerId", undefined); // Platzhalter

    return {
      playerTerritoryZone,
      opponentTerritoryZone,
      playerHandZone,
      opponentHandZone,
      battlefieldZone,
      playerLandOfBondageZone,
      opponentLandOfBondageZone,
      playerDeckPile,
      playerDiscardPile,
      opponentDeckPile,
      opponentDiscardPile,
      playerReservePile,
      opponentReservePile,
      playerLandOfRedemptionPile,
      opponentLandOfRedemptionPile,
      playerBanishPile,
      opponentBanishPile,
    };
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
    );
    // ✨ NEU: Concede Button positionieren
    this.staticElements.concedeButton.setPosition(
      this.layout.concedeButton.x,
      this.layout.concedeButton.y,
    );

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
}
