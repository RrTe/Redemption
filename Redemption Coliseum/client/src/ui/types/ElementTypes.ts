import Phaser from "phaser";
import { PileUI } from "../PileUI";
import { StackedPileUI } from "../StackedPileUI";
import { SidebarButton } from "../components/SidebarButton";
import { HandCounterUI } from "../components/HandCounterUI";

export type StaticElements = {
  boardText: Phaser.GameObjects.Text;
  phaseIcons: { [key: string]: Phaser.GameObjects.Image };
  nextPhaseButton: Phaser.GameObjects.Container;
  concedeButton: Phaser.GameObjects.Container;
  settingsButton: SidebarButton;
  saveButton: SidebarButton;
  helpButton: SidebarButton;
  phaseIndicator: Phaser.GameObjects.Graphics;
  phaseBar: Phaser.GameObjects.Graphics;
  playerInfoText: Phaser.GameObjects.BitmapText;
  opponentInfoText: Phaser.GameObjects.BitmapText;
  highlightOverlay: Phaser.GameObjects.Container;
  highlightGraphics: Phaser.GameObjects.Graphics;
  highlightText: Phaser.GameObjects.BitmapText;
};

export type ZoneElements = {
  playerLandOfBondageZone: Phaser.GameObjects.Zone;
  opponentLandOfBondageZone: Phaser.GameObjects.Zone;
  playerTerritoryZone: Phaser.GameObjects.Zone;
  opponentTerritoryZone: Phaser.GameObjects.Zone;
  playerHandZone: Phaser.GameObjects.Zone;
  opponentHandZone: Phaser.GameObjects.Zone;
  playerHandCounter: HandCounterUI;
  opponentHandCounter: HandCounterUI;
  battlefieldZone: Phaser.GameObjects.Zone;
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
