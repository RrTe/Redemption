// client/src/ui/utils/ModeIconHelper.ts
import Phaser from "phaser";

/**
 * Ensures fallback textures for room mode icons (sandbox and standard)
 * if custom PNG assets have not yet been provided by the user.
 */
export class ModeIconHelper {
  public static readonly KEY_ARENA = "icon_arena";
  public static readonly KEY_SANDBOX = "icon_sandbox";
  public static readonly KEY_STANDARD = "icon_standard";

  /**
   * Generates crisp fallback textures if they don't already exist.
   *
   * @param scene Phaser Scene with active TextureManager.
   */
  public static ensureModeIcons(scene: Phaser.Scene): void {
    const textures = scene.textures;

    const generateArenaFallback = (key: string) => {
      if (!textures.exists(key)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // 32x32 Arena Icon: Gold open tabletop / crossed swords / arena layout
        g.fillStyle(0x1a2436, 0.85);
        g.fillRoundedRect(1, 1, 30, 30, 6);
        g.lineStyle(2, 0xe9cd45, 1);
        g.strokeRoundedRect(1, 1, 30, 30, 6);

        // Mini tabletop / arena layout
        g.lineStyle(1.5, 0xe9cd45, 0.9);
        g.strokeRect(6, 6, 20, 20);
        g.lineBetween(16, 6, 16, 26);
        g.lineBetween(6, 16, 26, 16);

        g.generateTexture(key, 32, 32);
        g.destroy();
      }
    };

    generateArenaFallback(this.KEY_ARENA);
    generateArenaFallback(this.KEY_SANDBOX);

    if (!textures.exists(this.KEY_STANDARD)) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // 32x32 Standard Icon: Gold shield / rulebook
      g.fillStyle(0x1a2436, 0.85);
      g.fillRoundedRect(1, 1, 30, 30, 6);
      g.lineStyle(2, 0x4a9eff, 1);
      g.strokeRoundedRect(1, 1, 30, 30, 6);

      // Mini rulebook / shield shape
      g.fillStyle(0x4a9eff, 0.9);
      g.fillTriangle(16, 7, 7, 13, 25, 13);
      g.fillRect(8, 14, 16, 8);
      g.fillTriangle(16, 25, 8, 22, 24, 22);

      g.generateTexture(this.KEY_STANDARD, 32, 32);
      g.destroy();
    }
  }
}
