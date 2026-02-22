import Phaser from "phaser";
import { PHASES } from "../../../shared/phases.js";

export interface GameLayout {
  GAME_WIDTH: number;
  GAME_HEIGHT: number;
  playerHand: Phaser.Geom.Rectangle;
  playerTerritory: Phaser.Geom.Rectangle;
  playerLandOfBondage: Phaser.Geom.Rectangle;
  cardWidth: number;
  cardHeight: number;
  handCardWidth: number; // ✨ NEU: Eigene Größe für Handkarten
  handCardHeight: number; // ✨ NEU
  smallCardWidth: number; // ✨ NEU: Kleinere Kartengröße für die Battle-Phase
  smallCardHeight: number; // ✨ NEU
  pileWidth: number;
  pileHeight: number;
  opponentHand: Phaser.Geom.Rectangle;
  opponentTerritory: Phaser.Geom.Rectangle;
  opponentLandOfBondage: Phaser.Geom.Rectangle;
  playerDeckPile: Phaser.Geom.Rectangle;
  playerDiscardPile: Phaser.Geom.Rectangle;
  opponentDeckPile: Phaser.Geom.Rectangle;
  opponentDiscardPile: Phaser.Geom.Rectangle;
  // ✨ NEU: Detaillierte Zonen innerhalb des Territoriums
  playerHeroArea: Phaser.Geom.Rectangle;
  playerFortressArea: Phaser.Geom.Rectangle;
  playerECArea: Phaser.Geom.Rectangle;
  playerArtifactArea: Phaser.Geom.Rectangle;
  opponentHeroArea: Phaser.Geom.Rectangle;
  opponentFortressArea: Phaser.Geom.Rectangle;
  opponentECArea: Phaser.Geom.Rectangle;
  opponentArtifactArea: Phaser.Geom.Rectangle;
  // ✨ NEU (PHASE 2): Layouts für die neuen Zonen
  // ✨ DEIN PLAN (BATTLE): Layout für die geteilte Kampfzone
  playerBattlefieldArea: Phaser.Geom.Rectangle;
  opponentBattlefieldArea: Phaser.Geom.Rectangle;
  playerReservePile: Phaser.Geom.Rectangle;
  opponentReservePile: Phaser.Geom.Rectangle;
  playerLandOfRedemptionPile: Phaser.Geom.Rectangle;
  opponentLandOfRedemptionPile: Phaser.Geom.Rectangle;
  playerBanishPile: Phaser.Geom.Rectangle;
  opponentBanishPile: Phaser.Geom.Rectangle;
  // ✨ NEU: Koordinaten für die verschobenen UI-Texte
  // ✨ NEU: Koordinaten für die Phasen-Icons
  phaseIcons: { [key: string]: { x: number; y: number; size: number } };
  phaseBar: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  nextPhaseButton: { x: number; y: number };
  concedeButton: { x: number; y: number }; // ✨ NEU
  settingsButton: { visibleX: number; hiddenX: number; y: number };
  saveButton: { visibleX: number; hiddenX: number; y: number }; // ✨ NEU
  chatButton: { visibleX: number; hiddenX: number; y: number }; // ✨ NEU
  // ✨ NEU: Positionen für Spieler-Infos
  playerInfo: { x: number; y: number };
  opponentInfo: { x: number; y: number };
}

export function calculateLayout(
  width: number,
  height: number,
  currentPhase: string,
): GameLayout {
  // === Responsive Skalierung basierend auf dem Seitenverhältnis ===
  // ✨ DEIN WUNSCH: Zentrale Steuerung für die Größe der Handkarten.
  const HAND_CARD_SCALE = 1.3; // 1.2 = 120%

  const CARD_ASPECT_RATIO = 1.4;
  const REFERENCE_ASPECT_RATIO = 16 / 9; // Referenz-Seitenverhältnis (z.B. 1920x1080)
  const currentAspectRatio = width / height;
  let cardWidth: number;
  let cardHeight: number;
  let pileWidth: number;
  let pileHeight: number;
  let PADDING: number;
  let EDGE_MARGIN: number; // ✨ NEU: Abstand zum Bildschirmrand

  // ✨ DEIN VORSCHLAG & FINALE KORREKTUR:
  // Wir entfernen die Logik, die zwischen Hoch- und Querformat umschaltet,
  // und verwenden IMMER eine stabile, höhenbasierte Berechnung.
  // Das verhindert das unerwünschte "Wachsen" und die inkonsistenten Größen.
  pileHeight = height * 0.12;
  pileWidth = pileHeight / CARD_ASPECT_RATIO;
  cardHeight = height * 0.12;
  cardWidth = cardHeight / CARD_ASPECT_RATIO;
  PADDING = height * 0.05;
  EDGE_MARGIN = height * 0.02; // ✨ NEU: 2% Randabstand

  // ✨ DEIN PLAN: Definiere eine kleinere Kartengröße für die komprimierten Zonen.
  // Wir leiten sie von der Standardgröße ab.
  const smallCardWidth = cardWidth * 0.8;
  const smallCardHeight = cardHeight * 0.8;
  // ✨ NEU: Berechne die Größe der Handkarten basierend auf dem Skalierungsfaktor.
  const handCardWidth = cardWidth * HAND_CARD_SCALE;
  const handCardHeight = cardHeight * HAND_CARD_SCALE;
  const PILE_SPACING = pileHeight * 1.25; // ✨ DEIN WUNSCH: Vertikalen Abstand zwischen den Stapeln vergrößern.

  // ✨ NEUE BERECHNUNG: Definiere die Breite des zentralen Spielfelds und der seitlichen Stapelbereiche
  const PILE_AREA_WIDTH = pileWidth + PADDING + EDGE_MARGIN; // ✨ FIX: Margin einbeziehen
  const boardWidth = width - 2 * PILE_AREA_WIDTH;
  const boardX = PILE_AREA_WIDTH;

  // === Spieler-Bereich (unten) ===
  // ✨ DEIN PLAN: Mache die Handzonen schmaler und zentriere sie.
  // Wir definieren die Breite als Prozentsatz der zentralen Spielfeldbreite.
  const handZoneWidth = boardWidth * 0.8; // 80% der Breite des zentralen Boards
  const handZoneX = boardX + (boardWidth - handZoneWidth) / 2; // Zentriert im Board-Bereich

  // ✨ DEIN PLAN: Handzonen-Höhe und Kartenposition dynamisch berechnen.
  const handCardEdgePadding = cardHeight * 0.1; // Halbiert den Abstand der Karten zum Rand.
  const handZoneHeight = cardHeight + 2 * handCardEdgePadding; // Zone ist so hoch wie die Karte + Padding oben/unten.

  const playerHand = new Phaser.Geom.Rectangle(
    handZoneX,
    height - handZoneHeight,
    handZoneWidth,
    handZoneHeight,
  );
  // Aufteilung des Spieler-Spielfelds
  // ✨ DEIN PLAN: "Atmendes Layout"
  const isBattlePhase = currentPhase === "battle";
  // ✨ KORREKTUR: Berechne die verfügbare Höhe vom oberen Rand der Handzone bis zur Mitte.
  const totalPlayerBoardHeight = playerHand.y - height / 2;
  const battleAreaTotalHeight = isBattlePhase
    ? totalPlayerBoardHeight * 0.4
    : 0;

  const playerTerritoryHeight =
    totalPlayerBoardHeight * (isBattlePhase ? 0.4 : 0.6);
  const playerLandOfBondageHeight =
    totalPlayerBoardHeight * (isBattlePhase ? 0.2 : 0.3);
  // ✨ DEIN PLAN: Verankere die Zonen korrekt an der Handzone.
  const playerLandOfBondageY = playerHand.y - playerLandOfBondageHeight; // LoB schließt an der Hand an.
  const playerTerritoryY = playerLandOfBondageY - playerTerritoryHeight; // Territory schließt an LoB an.

  const playerTerritory = new Phaser.Geom.Rectangle(
    boardX,
    playerTerritoryY,
    boardWidth,
    playerTerritoryHeight,
  );
  const playerLandOfBondage = new Phaser.Geom.Rectangle(
    boardX,
    playerLandOfBondageY,
    boardWidth,
    playerLandOfBondageHeight,
  );

  // ✨ NEU: Unterteilung des Spieler-Territoriums
  const territoryRowHeight = playerTerritory.height / 2;
  const territoryGap = playerTerritory.width * 0.05;
  const heroECWidth = playerTerritory.width * 0.8;
  const fortressArtifactWidth =
    playerTerritory.width - heroECWidth - territoryGap;

  // Zeile 1: Helden und Festungen
  const playerHeroArea = new Phaser.Geom.Rectangle(
    playerTerritory.x,
    playerTerritory.y,
    heroECWidth,
    territoryRowHeight,
  );
  const playerFortressArea = new Phaser.Geom.Rectangle(
    playerHeroArea.right + territoryGap,
    playerTerritory.y,
    fortressArtifactWidth,
    territoryRowHeight,
  );

  // Zeile 2: ECs und Artefakte
  const row2Y = playerTerritory.y + territoryRowHeight;
  const playerECArea = new Phaser.Geom.Rectangle(
    playerTerritory.x,
    row2Y,
    heroECWidth,
    territoryRowHeight,
  );
  const playerArtifactArea = new Phaser.Geom.Rectangle(
    playerECArea.right + territoryGap,
    row2Y,
    fortressArtifactWidth,
    territoryRowHeight,
  );

  // ✨ NEUE BERECHNUNG: Spieler-Stapel rechts, relativ zum Spieler-Territorium
  // ✨ KORREKTUR: Positioniere die Stapelgruppe korrekt am unteren rechten Bildschirmrand.
  const playerPilesX = playerTerritory.right + PADDING;
  const playerBanishPile = new Phaser.Geom.Rectangle(
    width - pileWidth - EDGE_MARGIN, // ✨ FIX: Rechtsbündig mit Margin
    height - EDGE_MARGIN - pileHeight, // ✨ FIX: Untenbündig mit Margin
    pileWidth,
    pileHeight,
  );
  const playerDiscardPile = new Phaser.Geom.Rectangle(
    playerPilesX,
    playerBanishPile.y - PILE_SPACING, // Darüber
    pileWidth,
    pileHeight,
  );
  const playerDeckPile = new Phaser.Geom.Rectangle(
    playerPilesX,
    playerDiscardPile.y - PILE_SPACING, // Darüber
    pileWidth,
    pileHeight,
  );
  const playerReservePile = new Phaser.Geom.Rectangle(
    playerPilesX,
    playerDeckPile.y - PILE_SPACING, // Darüber
    pileWidth,
    pileHeight,
  );
  const playerLandOfRedemptionPile = new Phaser.Geom.Rectangle(
    playerPilesX,
    playerReservePile.y - PILE_SPACING, // Ganz oben in der Gruppe
    pileWidth,
    pileHeight,
  );

  // === Gegner-Bereich (oben) ===
  const opponentHand = new Phaser.Geom.Rectangle(
    handZoneX,
    0,
    handZoneWidth,
    handZoneHeight,
  );

  const totalOpponentBoardHeight = height / 2 - opponentHand.height;
  const opponentTerritoryHeight =
    totalOpponentBoardHeight * (isBattlePhase ? 0.4 : 0.6);
  const opponentLandOfBondageHeight =
    totalOpponentBoardHeight * (isBattlePhase ? 0.2 : 0.3);

  // ✨ DEIN PLAN: Verankere die Zonen am oberen Rand.
  const opponentLandOfBondageY = opponentHand.bottom;
  const opponentTerritoryY =
    opponentLandOfBondageY + opponentLandOfBondageHeight;

  const opponentLandOfBondage = new Phaser.Geom.Rectangle(
    boardX,
    opponentLandOfBondageY,
    boardWidth,
    opponentLandOfBondageHeight,
  );
  const opponentTerritory = new Phaser.Geom.Rectangle(
    boardX,
    opponentTerritoryY,
    boardWidth,
    opponentTerritoryHeight,
  );

  // ✨ NEU: Unterteilung des Gegner-Territoriums (gespiegelt)
  const opponentRowHeight = opponentTerritory.height / 2;

  // ✨ KORREKTUR: Die Reihen waren vertauscht.
  // Die Helden/Festungen-Reihe des Gegners sollte näher an der Mitte sein (höherer Y-Wert).
  const opponentHeroRowY = opponentTerritory.y + opponentRowHeight;
  const opponentHeroArea = new Phaser.Geom.Rectangle(
    opponentTerritory.x,
    opponentHeroRowY,
    heroECWidth,
    opponentRowHeight,
  );
  const opponentFortressArea = new Phaser.Geom.Rectangle(
    opponentHeroArea.right + territoryGap,
    opponentHeroRowY,
    fortressArtifactWidth,
    opponentRowHeight,
  );

  // Die EC/Artefakte-Reihe des Gegners sollte weiter oben sein (niedrigerer Y-Wert).
  const opponentECRowY = opponentTerritory.y;
  const opponentECArea = new Phaser.Geom.Rectangle(
    opponentTerritory.x,
    opponentECRowY,
    heroECWidth,
    opponentRowHeight,
  );
  const opponentArtifactArea = new Phaser.Geom.Rectangle(
    opponentECArea.right + territoryGap,
    opponentECRowY,
    fortressArtifactWidth,
    opponentRowHeight,
  );

  // ✨ NEUE BERECHNUNG: Gegner-Stapel links, relativ zum Gegner-Territorium
  // ✨ KORREKTUR: Positioniere die Stapelgruppe korrekt am oberen linken Bildschirmrand.
  const opponentPilesX = EDGE_MARGIN; // ✨ FIX: Linksbündig mit Margin
  const opponentBanishPile = new Phaser.Geom.Rectangle(
    opponentPilesX,
    EDGE_MARGIN, // ✨ FIX: Obenbündig mit Margin
    pileWidth,
    pileHeight,
  );
  const opponentDiscardPile = new Phaser.Geom.Rectangle(
    opponentPilesX,
    opponentBanishPile.y + PILE_SPACING,
    pileWidth,
    pileHeight,
  );
  const opponentDeckPile = new Phaser.Geom.Rectangle(
    opponentPilesX,
    opponentDiscardPile.y + PILE_SPACING,
    pileWidth,
    pileHeight,
  );
  const opponentReservePile = new Phaser.Geom.Rectangle(
    opponentPilesX,
    opponentDeckPile.y + PILE_SPACING,
    pileWidth,
    pileHeight,
  );
  const opponentLandOfRedemptionPile = new Phaser.Geom.Rectangle(
    opponentPilesX,
    opponentReservePile.y + PILE_SPACING,
    pileWidth,
    pileHeight,
  );

  // ✨ NEU: Berechne die Positionen für die UI-Texte am rechten Rand
  // ✨ NEU: Phasen-Icons rechts neben der Gegner-Hand
  const opponentHandRight = opponentHand.x + opponentHand.width;
  const spaceRight = width - opponentHandRight;
  // ✨ FIX: Dynamische Größe (ca. 32px bei 1080p), mindestens 24px.
  const iconSize = Math.max(24, Math.floor(height * 0.03));

  // --- Phasen-Icons & Bar ---
  // ✨ FIX: Sicherstellen, dass wir ein Array von Strings haben.
  // Falls der Import schiefgeht (z.B. leeres Objekt), nutzen wir Fallbacks, damit das Layout nicht bricht.
  const rawPhases = Object.values(PHASES);
  const phases = (
    rawPhases.length > 0
      ? rawPhases
      : ["draw", "upkeep", "prep", "battle", "discard"]
  ) as string[];

  const numIcons = phases.length;
  const iconGap = iconSize * 0.25;
  const totalIconsWidth = numIcons * iconSize + (numIcons - 1) * iconGap;

  // ✨ FIX: Zurück zur alten, korrekten Logik! Zentriert im Raum zwischen Gegnerhand und rechtem Rand.
  const iconsCenterX = opponentHandRight + spaceRight / 2;
  // ✨ FIX: Etwas nach unten verschoben (+30), damit sie nicht mit dem Gegner-Namen (oben rechts) kollidieren.
  const iconsCenterY = opponentHand.centerY + 30;
  const iconsStartX = iconsCenterX - totalIconsWidth / 2 + iconSize / 2;

  const phaseIcons: any = {};
  phases.forEach((phase, index) => {
    phaseIcons[phase] = {
      x: iconsStartX + index * (iconSize + iconGap),
      y: iconsCenterY,
      size: iconSize,
    };
  });

  // Hintergrund-Bar für Phasen
  const barPaddingX = iconSize * 0.6;
  const barPaddingY = iconSize * 0.25;
  const phaseBar = {
    width: totalIconsWidth + barPaddingX * 2,
    height: iconSize + barPaddingY * 2,
    x: iconsCenterX, // Zentrum
    y: iconsCenterY, // Zentrum
    radius: 15,
  };

  // --- Next Phase Button ---
  // Relativ zwischen Banish Pile und Handzone (oder links vom Banish Pile)
  // Wir platzieren ihn links neben dem Banish Pile mit einem festen Abstand.
  // ✨ FIX: 5px nach unten verschoben, wie gewünscht.
  const nextPhaseButton = {
    x: playerBanishPile.x - 50, // 50px Abstand nach links
    y: height - PADDING + 5,
  };

  // ✨ NEU: Concede Button
  // ✨ FIX: Linksbündig mit den Spieler-Infos und 5px nach unten verschoben.
  const concedeButtonWidth = 80; // Breite des Buttons aus ElementManager.ts
  const concedeButton = {
      x: EDGE_MARGIN + concedeButtonWidth / 2,
      y: nextPhaseButton.y // Gleiche Y-Position wie der Next-Phase-Button
  };

  // --- Settings Button ---
  // Y-Position stabil basierend auf Standard-Layout (LoB Höhe)
  const standardLoBHeight = (height / 2 - opponentHand.height) * 0.3;
  // ✨ FIX: Wir zentrieren die Gruppe aus Settings- und Save-Button dort, wo vorher nur der Settings-Button war.
  const buttonsCenterY = opponentHand.y + opponentHand.height + standardLoBHeight / 2;
  const buttonSpacing = 60;

  const settingsButton = {
    hiddenX: width + 12,
    visibleX: width - 24,
    y: buttonsCenterY - buttonSpacing / 2, // Etwas nach oben
  };
  const saveButton = {
    hiddenX: width + 12,
    visibleX: width - 24,
    y: buttonsCenterY + buttonSpacing / 2 - 5, // ✨ FIX: 5px nach oben korrigiert
  };

  // --- Chat Button ---
  // ✨ NEU: Symmetrisch zum Settings-Button, aber unten links.
  // Y-Position: Spiegelung an der horizontalen Mittelachse.
  const chatButton = {
      hiddenX: -12, // Links fast versteckt
      visibleX: 324, // ✨ FIX: Rechts außen am 300px Drawer (300 + 24)
      y: height - settingsButton.y // Symmetrisch unten
  };

  // --- Player & Opponent Info ---
  // Player: Unten Links (auf Höhe der Hand, linksbündig mit Gegner-Piles)
  const playerInfo = {
    x: EDGE_MARGIN, // Gleicher Abstand wie opponentPilesX
    y: height - handZoneHeight + 20, // Etwas unterhalb der Oberkante der Handzone
  };

  // Opponent: Oben Rechts (gespiegelt)
  const opponentInfo = {
    x: width - EDGE_MARGIN, // Rechtsbündig
    y: 5, // ✨ FIX: Weiter nach oben (war 20), um Überlappung mit Phasen-Icons zu vermeiden
  };

  // ✨ DEIN PLAN (BATTLE): Die Battle-Arena füllt den Raum, der durch das "Atmen" entsteht.
  // ✨ FINALE KORREKTUR: Die Kampfzone füllt exakt den Raum ZWISCHEN den Territorien.
  // Die Gesamthöhe der Kampfzone wird durch die `battleAreaTotalHeight` gesteuert (ist 0 außerhalb der Battle-Phase).
  // Die Oberkante der Zone ist die Unterkante des Gegner-Territoriums.
  const battleAreaY = opponentTerritory.bottom;

  const playerBattlefieldArea = new Phaser.Geom.Rectangle(
    boardX,
    playerTerritory.y - battleAreaTotalHeight / 2, // KORREKTUR: Startet an der Oberkante des Spieler-Territoriums und wächst nach oben.
    boardWidth,
    battleAreaTotalHeight / 2,
  );
  const opponentBattlefieldArea = new Phaser.Geom.Rectangle(
    boardX,
    battleAreaY, // Startet an der Oberkante der Kampfzone und wächst nach unten.
    boardWidth,
    battleAreaTotalHeight / 2,
  );

  return {
    GAME_WIDTH: width,
    GAME_HEIGHT: height,
    playerHand,
    playerTerritory,
    playerLandOfBondage,
    cardWidth,
    cardHeight,
    handCardWidth,
    handCardHeight,
    smallCardWidth,
    smallCardHeight,
    pileWidth: pileWidth,
    pileHeight: pileHeight,
    opponentHand,
    opponentTerritory,
    opponentLandOfBondage,
    playerDeckPile,
    playerDiscardPile,
    opponentDeckPile,
    opponentDiscardPile,
    playerHeroArea,
    playerFortressArea,
    playerECArea,
    playerArtifactArea,
    opponentHeroArea,
    opponentFortressArea,
    opponentECArea,
    opponentArtifactArea,
    playerReservePile,
    playerBattlefieldArea,
    opponentBattlefieldArea,
    opponentReservePile,
    playerLandOfRedemptionPile,
    opponentLandOfRedemptionPile,
    playerBanishPile,
    opponentBanishPile,
    phaseIcons,
    phaseBar,
    nextPhaseButton,
    concedeButton, // ✨ NEU
    settingsButton,
    saveButton, // ✨ NEU
    chatButton, // ✨ NEU
    playerInfo,
    opponentInfo,
  };
}
