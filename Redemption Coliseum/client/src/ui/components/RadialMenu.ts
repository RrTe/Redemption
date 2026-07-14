import Phaser from "phaser";
import { ActionIcon } from "./ActionIcon";
import type { ActionIconConfig } from "../types";
import { ViewportManager } from "../managers/ViewportManager";

export class RadialMenu {
  private icons: ActionIcon[] = [];
  private pulseAmplitude = 0.1;
  private pulsePerSecond = 0.6;
  private scene: Phaser.Scene;
  private blocker: Phaser.GameObjects.Rectangle;
  private onClose?: () => void;
  private centerX: number;
  private centerY: number;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    radius: number,
    configs: ActionIconConfig[],
    onClose?: () => void,
    customTargetSize?: number,
  ) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
    this.onClose = onClose;

    // Erstelle einen unsichtbaren, bildschirmfüllenden Blocker,
    // der das Menü schließt, wenn man daneben klickt.
    this.blocker = this.scene.add
      .rectangle(
        this.scene.cameras.main.scrollX,
        this.scene.cameras.main.scrollY,
        this.scene.scale.width,
        this.scene.scale.height,
        0x000000,
        0.001, // Muss eine minimale Alpha haben, um interaktiv zu sein
      )
      .setOrigin(0)
      .setInteractive()
      .setDepth(3999); // Unter den Icons (4000), aber über allem anderen.

    this.blocker.on("pointerdown", () => this.close());
    const angleStep = (2 * Math.PI) / configs.length;
    
    // ✨ Layout Strategy: Icons scale relative to viewport min-dimension
    const isCompact = ViewportManager.isTouchPrimary() || ViewportManager.isCompactMode();
    const targetSize = customTargetSize !== undefined 
      ? customTargetSize 
      : ViewportManager.vmin(isCompact ? 12.5 : 8.3);

    configs.forEach((config, index) => {
      const angle = index * angleStep - Math.PI / 2;

      const targetX = Math.round(centerX + radius * Math.cos(angle));
      const targetY = Math.round(centerY + radius * Math.sin(angle));

      const texture = this.scene.textures.get(config.iconKey);
      const frame = texture.getSourceImage();
      // ✨ FIX: Skaliere basierend auf der größten Seite (Breite oder Höhe),
      // damit alle Icons in die Box passen und gleich groß wirken.
      const maxDim = Math.max(frame.width, frame.height);

      const baseScale = targetSize / maxDim;
      const overshootScale = baseScale * 1.3;

      const icon = new ActionIcon(
        this.scene,
        centerX,
        centerY,
        config,
        baseScale,
        index * 10,
        this,
      );
      icon.setScale(0);
      this.icons.push(icon);

      this.scene.game.events.emit("playSound", "MENU_OPEN"); // ✨ FIX: Globaler Event-Bus

      this.scene.tweens.add({
        targets: icon,
        x: targetX,
        y: targetY,
        scale: overshootScale,
        ease: "Back.Out",
        duration: 200,
        delay: index * 10,
      });
    });

    const totalDelay = configs.length * 10 + 200 + 300;
    this.scene.time.delayedCall(totalDelay, () => {
      this.scene.events.on("update", this.updatePulse, this);
    });
  }

  private updatePulse(time: number, delta: number) {
    const pulse =
      1 +
      this.pulseAmplitude *
        Math.sin((time * this.pulsePerSecond * 2 * Math.PI) / 1000);
    this.icons.forEach((icon) => {
      icon.applyPulse(pulse);
    });
  }

  public close() {
    this.scene.events.off("update", this.updatePulse, this);

    // Rufe den Callback auf, um den Zustand im Manager zu bereinigen.
    this.onClose?.();

    this.blocker.destroy();

    this.icons.forEach((icon, index) => {
      this.scene.tweens.add({
        targets: icon,
        x: this.centerX,
        y: this.centerY,
        scale: 0,
        ease: "Back.In",
        duration: 300,
        delay: index * 30,
        onComplete: () => {
          icon.disableInteractive();
          icon.setVisible(false);
          icon.destroy(); // ✨ WICHTIG: Aufräumen
        },
      });
    });
    this.icons = [];
  }
}
