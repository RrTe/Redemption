import Phaser from "phaser";
import { ZONE_HIGHLIGHT_STYLE } from "../config/visualConfig";

/**
 * Creates and animates the global highlight overlay for active cards/phases.
 */
export function createHighlightOverlay(scene: Phaser.Scene) {
  const container = scene.add.container(0, 0).setDepth(2000).setVisible(false);
  const graphics = scene.add.graphics();
  const text = scene.add
    .bitmapText(0, 0, "fairydust", "", 48)
    .setOrigin(0.5)
    .setAlpha(0.5)
    .setTint(0xffffff)
    .setDropShadow(2, 2, 0x000000, 0.5);

  container.add([graphics, text]);

  scene.tweens.add({
    targets: text,
    alpha: { from: ZONE_HIGHLIGHT_STYLE.TEXT_ALPHA_MIN, to: ZONE_HIGHLIGHT_STYLE.TEXT_ALPHA_MAX },
    scale: { from: ZONE_HIGHLIGHT_STYLE.TEXT_SCALE_MIN, to: ZONE_HIGHLIGHT_STYLE.TEXT_SCALE_MAX },
    duration: ZONE_HIGHLIGHT_STYLE.TEXT_PULSE_DURATION_MS,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  return { container, graphics, text };
}
