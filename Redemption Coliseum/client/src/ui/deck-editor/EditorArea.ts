import Phaser from "phaser";

export class EditorArea {
  public scene: Phaser.Scene;
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public radius: number;
  public graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    depth: number
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.radius = radius;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.reset();
  }

  /**
   * Highlights the area border (thick gold glow) during card hover/drop.
   */
  public highlight() {
    this.graphics.clear();
    // Slightly darker background
    this.graphics.fillStyle(0x000000, 0.45);
    this.graphics.fillRoundedRect(this.x, this.y, this.width, this.height, this.radius);

    // Thick gold glowing outline
    this.graphics.lineStyle(3, 0xe9cd45, 0.95);
    this.graphics.strokeRoundedRect(this.x, this.y, this.width, this.height, this.radius);
  }

  /**
   * Resets the area border to the default layout outline.
   */
  public reset() {
    this.graphics.clear();
    // Glassmorphic background
    this.graphics.fillStyle(0x000000, 0.3);
    this.graphics.fillRoundedRect(this.x, this.y, this.width, this.height, this.radius);

    // Subtle gold border line (40% opacity)
    this.graphics.lineStyle(1, 0xe9cd45, 0.4);
    this.graphics.strokeRoundedRect(this.x, this.y, this.width, this.height, this.radius);
  }

  /**
   * Cleans up graphics references.
   */
  public destroy() {
    this.graphics.destroy();
  }
}
