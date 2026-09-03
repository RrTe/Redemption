import Phaser from "phaser";
import { PHASES } from "../../../shared/phases.js";
import { ViewportManager } from "./managers/ViewportManager";

export interface GameLayout {
  GAME_WIDTH: number;
  GAME_HEIGHT: number;
  playerHand: Phaser.Geom.Rectangle;
  playerTerritory: Phaser.Geom.Rectangle;
  playerLandOfBondage: Phaser.Geom.Rectangle;
  cardWidth: number;
  cardHeight: number;
  handCardWidth: number;
  handCardHeight: number;
  smallCardWidth: number;
  smallCardHeight: number;
  pileWidth: number;
  pileHeight: number;
  opponentHand: Phaser.Geom.Rectangle;
  opponentTerritory: Phaser.Geom.Rectangle;
  opponentLandOfBondage: Phaser.Geom.Rectangle;
  playerDeckPile: Phaser.Geom.Rectangle;
  playerDiscardPile: Phaser.Geom.Rectangle;
  opponentDeckPile: Phaser.Geom.Rectangle;
  opponentDiscardPile: Phaser.Geom.Rectangle;
  playerHeroArea: Phaser.Geom.Rectangle;
  playerFortressArea: Phaser.Geom.Rectangle;
  playerECArea: Phaser.Geom.Rectangle;
  playerArtifactArea: Phaser.Geom.Rectangle;
  opponentHeroArea: Phaser.Geom.Rectangle;
  opponentFortressArea: Phaser.Geom.Rectangle;
  opponentECArea: Phaser.Geom.Rectangle;
  opponentArtifactArea: Phaser.Geom.Rectangle;
  playerBattlefieldArea: Phaser.Geom.Rectangle;
  opponentBattlefieldArea: Phaser.Geom.Rectangle;
  playerReservePile: Phaser.Geom.Rectangle;
  opponentReservePile: Phaser.Geom.Rectangle;
  playerLandOfRedemptionPile: Phaser.Geom.Rectangle;
  opponentLandOfRedemptionPile: Phaser.Geom.Rectangle;
  playerBanishPile: Phaser.Geom.Rectangle;
  opponentBanishPile: Phaser.Geom.Rectangle;
  phaseIcons: { [key: string]: { x: number; y: number; size: number } };
  phaseBar: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  nextPhaseButton: { x: number; y: number };
  undoButton: { x: number; y: number };
  concedeButton: { x: number; y: number };
  settingsButton: { visibleX: number; hiddenX: number; y: number };
  saveButton: { visibleX: number; hiddenX: number; y: number };
  helpButton: { visibleX: number; hiddenX: number; y: number };
  chatButton: { visibleX: number; hiddenX: number; y: number };
  playerInfo: { x: number; y: number };
  opponentInfo: { x: number; y: number };
  buttonScale: number;
}

export function calculateLayout(
  width: number,
  height: number,
  currentPhase: string,
): GameLayout {
  const HAND_CARD_SCALE = 1.3;

  const isLowHeight = ViewportManager.isLowHeightProfile();

  const CARD_ASPECT_RATIO = 1.4;
  // Auf dem Handy wollen wir 0.15, auf dem Desktop muss es zwingend bei 0.12 bleiben!
  const pileHeight = isLowHeight ? height * 0.15 : height * 0.12;
  // Bei niedrigen Höhen (Mobile) nutzen wir eine etwas kleinere Ratio (z.B. 1.25 oder 1.3), 
  // damit die Piles im Verhältnis breiter wirken.
  const pileAspectRatio = isLowHeight ? 1.25 : CARD_ASPECT_RATIO;
  const pileWidth = pileHeight / pileAspectRatio;

  const cardHeight = height * 0.12;
  const cardWidth = cardHeight / CARD_ASPECT_RATIO;
  const PADDING = height * 0.05;
  const EDGE_MARGIN = height * 0.02;

  const smallCardWidth = cardWidth * 0.8;
  const smallCardHeight = cardHeight * 0.8;

  const handCardWidth = cardWidth * (isLowHeight ? 2.2 : HAND_CARD_SCALE);
  const handCardHeight = cardHeight * (isLowHeight ? 2.2 : HAND_CARD_SCALE);
  const PILE_SPACING = isLowHeight ? pileHeight * 1.3 : pileHeight * 1.25;

  const PILE_AREA_WIDTH = (isLowHeight ? pileWidth * 2.5 : pileWidth) + PADDING + EDGE_MARGIN;
  const boardWidth = width - 2 * PILE_AREA_WIDTH;
  const boardX = PILE_AREA_WIDTH;

  const handZoneWidth = boardWidth * 0.8;
  const handZoneX = boardX + (boardWidth - handZoneWidth) / 2;

  const handCardEdgePadding = cardHeight * 0.1;
  const handZoneHeight = cardHeight + 2 * handCardEdgePadding;

  const playerHand = new Phaser.Geom.Rectangle(
    handZoneX,
    height - handZoneHeight,
    handZoneWidth,
    handZoneHeight,
  );

  const isBattlePhase = currentPhase === "battle";
  const totalPlayerBoardHeight = playerHand.y - height / 2;
  const battleAreaTotalHeight = isBattlePhase ? totalPlayerBoardHeight * 0.4 : 0;

  const playerTerritoryHeight = totalPlayerBoardHeight * (isBattlePhase ? 0.4 : 0.6);
  const playerLandOfBondageHeight = totalPlayerBoardHeight * (isBattlePhase ? 0.2 : 0.3);

  const playerLandOfBondageY = playerHand.y - playerLandOfBondageHeight;
  const playerTerritoryY = playerLandOfBondageY - playerTerritoryHeight;

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

  const territoryRowHeight = playerTerritory.height / 2;
  const territoryGap = playerTerritory.width * 0.05;
  const heroECWidth = playerTerritory.width * 0.8;
  const fortressArtifactWidth = playerTerritory.width - heroECWidth - territoryGap;

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

  const playerOuterColX = width - pileWidth - EDGE_MARGIN;
  const playerInnerColX = isLowHeight ? playerOuterColX - pileWidth - (pileWidth * 0.4) : playerOuterColX;
  const playerPilesStartY = height - EDGE_MARGIN - pileHeight;

  let playerBanishPile, playerDiscardPile, playerDeckPile, playerReservePile, playerLandOfRedemptionPile;
  if (isLowHeight) {
    // Linke Reihe (näher zur Mitte = innerCol), von oben nach unten gewünscht: Reserve, Deck, Discard
    // -> Von unten nach oben berechnet: Discard -> Deck -> Reserve
    playerDiscardPile = new Phaser.Geom.Rectangle(playerInnerColX, playerPilesStartY, pileWidth, pileHeight);
    playerDeckPile = new Phaser.Geom.Rectangle(playerInnerColX, playerDiscardPile.y - PILE_SPACING, pileWidth, pileHeight);
    playerReservePile = new Phaser.Geom.Rectangle(playerInnerColX, playerDeckPile.y - PILE_SPACING, pileWidth, pileHeight);

    // Rechte Reihe (näher am rechten Rand = outerCol), von oben nach unten gewünscht: LoR, Banish
    // -> Von unten nach oben berechnet: Banish -> LoR
    playerBanishPile = new Phaser.Geom.Rectangle(playerOuterColX, playerPilesStartY, pileWidth, pileHeight);
    playerLandOfRedemptionPile = new Phaser.Geom.Rectangle(playerOuterColX, playerBanishPile.y - PILE_SPACING, pileWidth, pileHeight);
  } else {
    // Desktop-Anordnung (von unten nach oben berechnet, da playerPilesStartY unten ist)
    // Gewünscht von oben nach unten: LoR, Reserve, Deck, Discard, Banish
    // Also von unten nach oben: Banish -> Discard -> Deck -> Reserve -> LoR
    playerBanishPile = new Phaser.Geom.Rectangle(playerOuterColX, playerPilesStartY, pileWidth, pileHeight);
    playerDiscardPile = new Phaser.Geom.Rectangle(playerOuterColX, playerBanishPile.y - PILE_SPACING, pileWidth, pileHeight);
    playerDeckPile = new Phaser.Geom.Rectangle(playerOuterColX, playerDiscardPile.y - PILE_SPACING, pileWidth, pileHeight);
    playerReservePile = new Phaser.Geom.Rectangle(playerOuterColX, playerDeckPile.y - PILE_SPACING, pileWidth, pileHeight);
    playerLandOfRedemptionPile = new Phaser.Geom.Rectangle(playerOuterColX, playerReservePile.y - PILE_SPACING, pileWidth, pileHeight);
  }

  const opponentHand = new Phaser.Geom.Rectangle(
    handZoneX,
    0,
    handZoneWidth,
    handZoneHeight,
  );

  const totalOpponentBoardHeight = height / 2 - opponentHand.height;
  const opponentTerritoryHeight = totalOpponentBoardHeight * (isBattlePhase ? 0.4 : 0.6);
  const opponentLandOfBondageHeight = totalOpponentBoardHeight * (isBattlePhase ? 0.2 : 0.3);

  const opponentLandOfBondageY = opponentHand.bottom;
  const opponentTerritoryY = opponentLandOfBondageY + opponentLandOfBondageHeight;

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

  const opponentRowHeight = opponentTerritory.height / 2;

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

  const opponentOuterColX = EDGE_MARGIN;
  const opponentInnerColX = isLowHeight ? opponentOuterColX + pileWidth + (pileWidth * 0.4) : opponentOuterColX;
  const opponentPilesStartY = EDGE_MARGIN;

  let opponentBanishPile, opponentDiscardPile, opponentDeckPile, opponentReservePile, opponentLandOfRedemptionPile;
  if (isLowHeight) {
    // Linke Reihe (näher am linken Rand = outerCol), von oben nach unten gewünscht: Banish, LoR
    // -> Von oben nach unten berechnet: Banish -> LoR
    opponentBanishPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentPilesStartY, pileWidth, pileHeight);
    opponentLandOfRedemptionPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentBanishPile.y + PILE_SPACING, pileWidth, pileHeight);

    // Rechte Reihe (näher zur Mitte = innerCol), von oben nach unten gewünscht: Discard, Deck, Reserve
    // -> Von oben nach unten berechnet: Discard -> Deck -> Reserve
    opponentDiscardPile = new Phaser.Geom.Rectangle(opponentInnerColX, opponentPilesStartY, pileWidth, pileHeight);
    opponentDeckPile = new Phaser.Geom.Rectangle(opponentInnerColX, opponentDiscardPile.y + PILE_SPACING, pileWidth, pileHeight);
    opponentReservePile = new Phaser.Geom.Rectangle(opponentInnerColX, opponentDeckPile.y + PILE_SPACING, pileWidth, pileHeight);
  } else {
    opponentBanishPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentPilesStartY, pileWidth, pileHeight);
    opponentDiscardPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentBanishPile.y + PILE_SPACING, pileWidth, pileHeight);
    opponentDeckPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentDiscardPile.y + PILE_SPACING, pileWidth, pileHeight);
    opponentReservePile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentDeckPile.y + PILE_SPACING, pileWidth, pileHeight);
    opponentLandOfRedemptionPile = new Phaser.Geom.Rectangle(opponentOuterColX, opponentReservePile.y + PILE_SPACING, pileWidth, pileHeight);
  }

  const opponentInfo = {
    x: width - EDGE_MARGIN,
    y: 5,
  };

  const buttonScale = Phaser.Math.Clamp(height / 800, 0.65, 1.0);

  const playerInfo = {
    x: EDGE_MARGIN,
    y: isLowHeight
      ? height - EDGE_MARGIN - 46 * buttonScale - EDGE_MARGIN - 20
      : height - EDGE_MARGIN - 46 * buttonScale - EDGE_MARGIN - 15,
  };

  const iconSize = Math.max(20, Math.floor(height * 0.025 * buttonScale));

  const rawPhases = Object.values(PHASES);
  const phases = (rawPhases.length > 0 ? rawPhases : ["draw", "upkeep", "prep", "battle", "discard"]) as string[];

  const numIcons = phases.length;
  const iconGap = iconSize * 0.25;
  const totalIconsWidth = numIcons * iconSize + (numIcons - 1) * iconGap;
  const barPaddingX = iconSize * 0.6;
  const phaseBarWidth = totalIconsWidth + barPaddingX * 2;

  const rightSpacing = isLowHeight ? pileWidth * 0.4 : 0;
  const opponentHandRight = opponentHand.x + opponentHand.width;
  const spaceRight = playerOuterColX - opponentHandRight;

  const iconsCenterX = isLowHeight
    ? width - rightSpacing - EDGE_MARGIN - (phaseBarWidth / 2)
    : opponentHandRight + spaceRight / 2;
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

  const barPaddingY = iconSize * 0.25;
  const phaseBar = {
    width: totalIconsWidth + barPaddingX * 2,
    height: iconSize + barPaddingY * 2,
    x: iconsCenterX,
    y: iconsCenterY,
    radius: 15,
  };

  const buttonSpacing = 55;
  const nextPhaseButtonWidth = 80 * buttonScale;
  const nextPhaseButton = {
    x: isLowHeight ? playerInnerColX - (pileWidth * 0.3) - (nextPhaseButtonWidth / 2) : playerBanishPile.x - 50,
    y: height - EDGE_MARGIN - 23 * buttonScale,
  };

  const undoButtonWidth = 46 * buttonScale;
  const undoButtonGap = 10 * buttonScale;
  const undoButton = {
    x: nextPhaseButton.x - (nextPhaseButtonWidth / 2) - (undoButtonWidth / 2) - undoButtonGap,
    y: nextPhaseButton.y,
  };

  const concedeButtonWidth = 80 * buttonScale;
  const concedeButton = {
    x: EDGE_MARGIN + concedeButtonWidth / 2,
    y: nextPhaseButton.y,
  };

  const phaseBarBottom = phaseBar.y + phaseBar.height / 2;
  const playerLoRTop = playerLandOfRedemptionPile.y - pileHeight / 2;
  const opponentInfoBottom = opponentInfo.y + 20;

  const rightButtonsCenterY = isLowHeight
    ? opponentInfoBottom + (playerLoRTop - opponentInfoBottom) / 2
    : phaseBarBottom + (playerLoRTop - phaseBarBottom) / 2 + 30;

  const settingsButton = {
    hiddenX: width + 12,
    visibleX: width - 24,
    y: rightButtonsCenterY - buttonSpacing / 2,
  };
  const saveButton = {
    hiddenX: width + 12,
    visibleX: width - 24,
    y: rightButtonsCenterY + buttonSpacing / 2,
  };

  const opponentLoRBottom = opponentLandOfRedemptionPile.y + pileHeight / 2;
  const playerInfoTop = playerInfo.y;

  const leftButtonsCenterY = isLowHeight
    ? opponentLoRBottom + (playerInfoTop - opponentLoRBottom) / 2 + PADDING
    : opponentLoRBottom + (playerInfoTop - opponentLoRBottom) / 2 + (PADDING * 0.7);

  const chatButton = {
    hiddenX: -12,
    visibleX: 324,
    y: leftButtonsCenterY - buttonSpacing / 2,
  };
  const helpButton = {
    hiddenX: -12,
    visibleX: 24,
    y: leftButtonsCenterY + buttonSpacing / 2,
  };

  const battleAreaY = opponentTerritory.bottom;
  const playerBattlefieldArea = new Phaser.Geom.Rectangle(
    boardX,
    playerTerritory.y - battleAreaTotalHeight / 2,
    boardWidth,
    battleAreaTotalHeight / 2,
  );
  const opponentBattlefieldArea = new Phaser.Geom.Rectangle(
    boardX,
    battleAreaY,
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
    undoButton,
    concedeButton,
    settingsButton,
    saveButton,
    helpButton,
    chatButton,
    playerInfo,
    opponentInfo,
    buttonScale,
  };
}
