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
    // 1. Dual-color base gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    const step = 1 / (def.colors.length - 1);
    def.colors.forEach((color, index) => {
      gradient.addColorStop(index * step, color);
    });

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Gloss highlight (top half translucent white)
    const glossGrad = ctx.createLinearGradient(0, 0, 0, size * 0.6);
    glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.4)");
    glossGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  canvasTexture.refresh();
}

/**
 * Renders compact brigade colored circles matching 1:1 the visual style of Local Deck Tiles.
 * Draws circles from right to left starting at symbolX.
 *
 * @param scene The active Phaser scene.
 * @param container The parent container of the list entry.
 * @param symbolX The starting horizontal X position.
 * @param brigadeSymbols The list of brigade symbols to draw.
 * @returns The updated symbolX position to the left of the drawn circles.
 */
export function renderBrigadeCircles(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  symbolX: number,
  brigadeSymbols: any[]
): number {
  if (brigadeSymbols.length === 0) {
    return symbolX;
  }

  const R = 7; // Radius of 7px (14px diameter, matching deck tile brigade-gem size)
  const spacing = 2;
  const step = 2 * R + spacing; // 16px horizontal step

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
      
      // 1. Solid brigade color fill
      graphics.fillStyle(color, 1.0);
      graphics.fillCircle(cx, cy, R);

      // 2. Glossy 3D top highlight (matching linear-gradient gloss on deck tiles)
      graphics.fillStyle(0xffffff, 0.35);
      graphics.fillCircle(cx, cy - 2, 4.5);
    }

    // 3. Dark 1px border outline (matching 1px solid rgba(0,0,0,0.8) on deck tiles)
    const borderColor = symbol.id === "Black" ? 0x777777 : 0x000000;
    graphics.lineStyle(1, borderColor, 0.85);
    graphics.strokeCircle(cx, cy, R);
  });

  container.add(graphics);

  // Return updated X position for next symbols to the left
  return symbolX - (brigadeSymbols.length * step);
}
