import Phaser from "phaser";
import { ZONES, type Zone } from "../../../../shared/zones";
import { type GameLayout } from "../layout";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager";
import { PileUI } from "../PileUI";
import { StackedPileUI } from "../StackedPileUI";
import { HandCounterUI } from "../components/HandCounterUI";
import { type ZoneElements } from "../types/ElementTypes";

export class ZoneFactory {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager;
  }

  public create(layout: GameLayout): ZoneElements {
    const { room } = this;

    // === GROSSE, UNSICHTBARE ZONEN ===
    const playerTerritoryZone = this.createZone(
      layout.playerTerritory,
      ZONES.TERRITORY,
      room.sessionId,
    );
    const playerLandOfBondageZone = this.createZone(
      layout.playerLandOfBondage,
      ZONES.LAND_OF_BONDAGE,
      room.sessionId,
    );
    const opponentTerritoryZone = this.createZone(
      layout.opponentTerritory,
      ZONES.TERRITORY,
    );
    const opponentLandOfBondageZone = this.createZone(
      layout.opponentLandOfBondage,
      ZONES.LAND_OF_BONDAGE,
    );
    const playerHandZone = this.createZone(
      layout.playerHand,
      ZONES.HAND,
      room.sessionId,
    );
    const opponentHandZone = this.createZone(layout.opponentHand, ZONES.HAND);

    const fullBattlefieldRect = Phaser.Geom.Rectangle.Union(
      layout.playerBattlefieldArea,
      layout.opponentBattlefieldArea,
    );
    const battlefieldZone = this.createZone(
      fullBattlefieldRect,
      ZONES.BATTLEFIELD,
    );

    // === VISUELLE STAPEL ===
    const playerDeckPile = new StackedPileUI(
      this.scene,
      layout.playerDeckPile.centerX,
      layout.playerDeckPile.centerY,
      ZONES.DECK,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
    );
    playerDeckPile.setData("ownerId", room.sessionId);

    const playerDiscardPile = new PileUI(
      this.scene,
      layout.playerDiscardPile.centerX,
      layout.playerDiscardPile.centerY,
      ZONES.DISCARD,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      false,
    );
    playerDiscardPile.setData("ownerId", room.sessionId);

    const opponentDeckPile = new StackedPileUI(
      this.scene,
      layout.opponentDeckPile.centerX,
      layout.opponentDeckPile.centerY,
      ZONES.DECK,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      true,
    );

    const opponentDiscardPile = new PileUI(
      this.scene,
      layout.opponentDiscardPile.centerX,
      layout.opponentDiscardPile.centerY,
      ZONES.DISCARD,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      true,
    );
    opponentDiscardPile.setData("ownerId", undefined);

    const opponentReservePile = new StackedPileUI(
      this.scene,
      layout.opponentReservePile.centerX,
      layout.opponentReservePile.centerY,
      ZONES.RESERVE,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      true,
    );
    opponentReservePile.setData("ownerId", undefined);

    const playerReservePile = new StackedPileUI(
      this.scene,
      layout.playerReservePile.centerX,
      layout.playerReservePile.centerY,
      ZONES.RESERVE,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
    );
    playerReservePile.setData("ownerId", room.sessionId);

    const playerLandOfRedemptionPile = new PileUI(
      this.scene,
      layout.playerLandOfRedemptionPile.centerX,
      layout.playerLandOfRedemptionPile.centerY,
      ZONES.LAND_OF_REDEMPTION,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      false,
    );
    playerLandOfRedemptionPile.setData("ownerId", room.sessionId);

    const opponentLandOfRedemptionPile = new PileUI(
      this.scene,
      layout.opponentLandOfRedemptionPile.centerX,
      layout.opponentLandOfRedemptionPile.centerY,
      ZONES.LAND_OF_REDEMPTION,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      true,
    );
    opponentLandOfRedemptionPile.setData("ownerId", undefined);

    const playerBanishPile = new PileUI(
      this.scene,
      layout.playerBanishPile.centerX,
      layout.playerBanishPile.centerY,
      ZONES.BANISH,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      false,
    );
    playerBanishPile.setData("ownerId", room.sessionId);

    const opponentBanishPile = new PileUI(
      this.scene,
      layout.opponentBanishPile.centerX,
      layout.opponentBanishPile.centerY,
      ZONES.BANISH,
      layout.pileWidth,
      layout.pileHeight,
      room,
      this.networkManager,
      true,
    );
    opponentBanishPile.setData("ownerId", undefined);

    // === HAND COUNTERS ===
    const playerHandCounter = new HandCounterUI(
      this.scene,
      layout.GAME_WIDTH / 2,
      layout.GAME_HEIGHT - 18,
      false,
    );

    const opponentHandCounter = new HandCounterUI(
      this.scene,
      layout.GAME_WIDTH / 2,
      18,
      true,
    );

    return {
      playerTerritoryZone,
      opponentTerritoryZone,
      playerHandZone,
      opponentHandZone,
      playerHandCounter,
      opponentHandCounter,
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

  private createZone(
    layoutRect: Phaser.Geom.Rectangle,
    zoneName: Zone,
    ownerId?: string,
  ): Phaser.GameObjects.Zone {
    const zone = this.scene.add
      .zone(layoutRect.x, layoutRect.y, layoutRect.width, layoutRect.height)
      .setOrigin(0, 0);
    zone.name = zoneName;
    zone.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, layoutRect.width, layoutRect.height),
      Phaser.Geom.Rectangle.Contains,
      true,
    );
    zone.setDropZone();
    if (ownerId) zone.setData("ownerId", ownerId);
    return zone;
  }
}
