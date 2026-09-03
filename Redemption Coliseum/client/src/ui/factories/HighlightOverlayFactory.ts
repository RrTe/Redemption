import Phaser from "phaser";

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
    alpha: { from: 0.8, to: 1.0 },
    scale: { from: 0.95, to: 1.05 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  return { container, graphics, text };
}
