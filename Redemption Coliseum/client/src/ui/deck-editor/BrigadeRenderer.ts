import Phaser from "phaser";
import { BRIGADE_COLORS, SPECIAL_BRIGADES, type SpecialBrigadeDef } from "../../config/BrigadeConfig";

/**
 * Creates a canvas texture for gradient-filled brigade circles if it does not already exist.
 *
 * @param scene The active Phaser scene.
 * @param def The special brigade configuration containing the texture key and gradient colors.
 */
function ensureSpecialBrigadeTexture(scene: Phaser.Scene, def: SpecialBrigadeDef): void {
  if (scene.textures.exists(def.textureKey)) {
    return;
  }

  const size = 32;
  const canvasTexture = scene.textures.createCanvas(def.textureKey, size, size);
  const ctx = canvasTexture.context;

  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    const step = 1 / (def.colors.length - 1);
    def.colors.forEach((color, index) => {
      gradient.addColorStop(index * step, color);
    });

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  canvasTexture.refresh();
}

/**
 * Renders compact brigade colored circles with a gold border.
 * Draws circles from right to left starting at symbolX.
 *
 * @param scene The active Phaser scene.
 * @param container The parent container of the list entry.
 * @param symbolX The starting horizontal X position.
 * @param brigadeSymbols The list of brigade symbols to draw.
 * @param strokeColor The hexadecimal border color for the circles.
 * @returns The updated symbolX position to the left of the drawn circles.
 */
export function renderBrigadeCircles(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  symbolX: number,
  brigadeSymbols: any[],
  strokeColor: number = 0xe9cd45
): number {
  if (brigadeSymbols.length === 0) {
    return symbolX;
  }

  const R = 8; // Radius of each circle
  const strokeWidth = 1.5;
  const spacing = 1;
  const step = 2 * R + spacing; // 17px horizontal step

  const graphics = scene.add.graphics();

  brigadeSymbols.forEach((symbol, i) => {
    const cx = Math.round(symbolX - R - (i * step));
    const cy = 0;

    const specialDef = SPECIAL_BRIGADES[symbol.id];
    if (specialDef) {
      ensureSpecialBrigadeTexture(scene, specialDef);
      const img = scene.add.image(cx, cy, specialDef.textureKey);
      img.setDisplaySize(2 * R, 2 * R);
      img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      container.add(img);
    } else {
      const color = BRIGADE_COLORS[symbol.id] ?? 0x808080;
      // Draw the filled circle
      graphics.fillStyle(color, 1.0);
      graphics.fillCircle(cx, cy, R);
    }

    // Draw the gold border outline
    graphics.lineStyle(strokeWidth, strokeColor, 1.0);
    graphics.strokeCircle(cx, cy, R);
  });

  container.add(graphics);

  // Return updated X position for next symbols to the left
  return symbolX - (brigadeSymbols.length * step);
}
