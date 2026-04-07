import Phaser from "phaser";
import { type ElementManager } from "./ElementManager";
import { DEBUG } from "../../utils/logger";

/**
 * Manages visual debug overlays for zones and boundaries.
 */
export class DebugManager {
  private scene: Phaser.Scene;
  private elementManager: ElementManager;
  private graphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, elementManager: ElementManager) {
    this.scene = scene;
    this.elementManager = elementManager;

    if (DEBUG) {
      // ✨ FIX: Tiefe auf 0 setzen, damit Karten (Tiefe 1+) darüber liegen.
      this.graphics = this.scene.add.graphics().setDepth(0);
    }
  }

  /**
   * Clears and redraws all debug outlines for active game zones.
   */
  public update() {
    if (!this.graphics || !DEBUG) return;

    this.graphics.clear();
    const zones = this.elementManager.zoneElements;

    this.drawZone(zones.playerTerritoryZone, 0x0000ff); // Blue
    this.drawZone(zones.playerLandOfBondageZone, 0x800080); // Purple
    this.drawZone(zones.opponentTerritoryZone, 0xff0000); // Red
    this.drawZone(zones.opponentLandOfBondageZone, 0xffa500); // Orange
    this.drawZone(zones.playerHandZone, 0x00ff00); // Green
    this.drawZone(zones.opponentHandZone, 0x00ffff); // Cyan

    // Draw battlefield if active
    const battlefieldZone = zones.battlefieldZone;
    if (battlefieldZone.getBounds().height > 0) {
      this.drawZone(battlefieldZone, 0xffff00); // Yellow
    }
  }

  private drawZone(zone: Phaser.GameObjects.Zone, color: number) {
    this.graphics?.lineStyle(2, color, 0.8).strokeRectShape(zone.getBounds());
  }

  /**
   * Cleans up graphics resources.
   */
  public destroy() {
    this.graphics?.destroy();
    this.graphics = null;
  }
}
