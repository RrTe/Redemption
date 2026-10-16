// client/src/ui/components/PhaseHandshakeToggle.ts
import Phaser from "phaser";
import { TooltipManager } from "../managers/TooltipManager";
import type { GameNetworkManager } from "../../network/GameNetworkManager";

/**
 * Handshake Toggle Button placed directly above the Next Phase button.
 * Uses the dedicated handshake icon with coliseum button frame, active indicator,
 * and synchronizes preferences via GameNetworkManager.
 */
export class PhaseHandshakeToggle extends Phaser.GameObjects.Container {
  private enabledState: boolean = false;
  private btnBar: Phaser.GameObjects.Graphics;
  private btnImage?: Phaser.GameObjects.Image;
  private fallbackIcon?: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Graphics;
  private networkManager?: GameNetworkManager;
  private barWidth: number = 46;
  private barHeight: number = 34;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    networkManager?: GameNetworkManager,
  ) {
    super(scene, x, y);
    this.networkManager = networkManager;
    this.setDepth(200);

    // 1. Background Frame
    this.btnBar = scene.add.graphics();
    this.add(this.btnBar);

    // 2. Icon (Texture if loaded, otherwise vector/emoji fallback)
    this.setupIcon();

    // 3. Status Dot Indicator
    this.statusDot = scene.add.graphics();
    this.add(this.statusDot);

    this.redraw();

    // 4. Interactive Hit Area & Hover
    const hitArea = new Phaser.Geom.Rectangle(
      -this.barWidth / 2,
      -this.barHeight / 2,
      this.barWidth,
      this.barHeight,
    );
    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    if (this.input) {
      this.input.cursor = "pointer";
    }

    this.on("pointerdown", () => {
      this.toggle();
    });

    this.on("pointerover", () => {
      this.scene.tweens.add({
        targets: this,
        scaleX: (this.getData("baseScale") || 1.0) * 1.1,
        scaleY: (this.getData("baseScale") || 1.0) * 1.1,
        duration: 90,
        ease: "Back.easeOut",
      });
      const bounds = this.getBounds();
      TooltipManager.show(
        bounds.centerX,
        bounds.top,
        this.enabledState
          ? "🤝 Phase Handshake: Active (Opponent must confirm phase change)"
          : "🤝 Phase Handshake: Off (Immediate phase change)",
      );
    });

    this.on("pointerout", () => {
      const base = this.getData("baseScale") || 1.0;
      this.scene.tweens.add({
        targets: this,
        scaleX: base,
        scaleY: base,
        duration: 90,
      });
      TooltipManager.hide();
    });

    scene.add.existing(this);
  }

  private setupIcon(): void {
    if (this.scene.textures.exists("button_handshake")) {
      this.btnImage = this.scene.add.image(0, 0, "button_handshake");
      this.btnImage.setDisplaySize(30, 20);
      this.add(this.btnImage);
    } else {
      this.fallbackIcon = this.scene.add
        .text(0, -1, "🤝", {
          fontSize: "18px",
        })
        .setOrigin(0.5, 0.5);
      this.add(this.fallbackIcon);
    }
  }

  public setNetworkManager(manager: GameNetworkManager): void {
    this.networkManager = manager;
  }

  public isEnabled(): boolean {
    return this.enabledState;
  }

  public setEnabled(value: boolean): void {
    if (this.enabledState === value) return;
    this.enabledState = value;
    this.redraw();
  }

  public toggle(): boolean {
    this.enabledState = !this.enabledState;
    this.redraw();

    this.scene.game.events.emit("playSound", "UI_CLICK");
    this.scene.events.emit("handshake_toggled", this.enabledState);

    if (this.networkManager) {
      this.networkManager.sendTogglePhaseHandshake({ enabled: this.enabledState });
    }

    const bounds = this.getBounds();
    TooltipManager.show(
      bounds.centerX,
      bounds.top,
      this.enabledState
        ? "🤝 Phase Handshake: Active (Opponent must confirm phase change)"
        : "🤝 Phase Handshake: Off (Immediate phase change)",
    );

    return this.enabledState;
  }

  private redraw(): void {
    const w = this.barWidth;
    const h = this.barHeight;
    const radius = 8;
    const barX = -w / 2;
    const barY = -h / 2;

    this.btnBar.clear();
    // Shadow
    this.btnBar.fillStyle(0x000000, 0.45).fillRoundedRect(barX + 2, barY + 2, w, h, radius);
    // Background
    this.btnBar.fillStyle(0x1a1a2e, 0.95).fillRoundedRect(barX, barY, w, h, radius);
    // Sheen
    this.btnBar.fillStyle(0xffffff, 0.05).fillRoundedRect(barX, barY, w, h / 2, {
      tl: radius,
      tr: radius,
      bl: 0,
      br: 0,
    });

    // Border: glowing gold accent when active, metallic slate when inactive
    const borderColor = this.enabledState ? 0xd4af37 : 0x444466;
    const borderAlpha = this.enabledState ? 1.0 : 0.75;
    this.btnBar.lineStyle(1.8, borderColor, borderAlpha).strokeRoundedRect(barX, barY, w, h, radius);

    // Icon visual state
    if (this.btnImage) {
      if (this.enabledState) {
        this.btnImage.clearTint();
        this.btnImage.setAlpha(1.0);
      } else {
        this.btnImage.setTint(0x777777);
        this.btnImage.setAlpha(0.45);
      }
    } else if (this.fallbackIcon) {
      this.fallbackIcon.setAlpha(this.enabledState ? 1.0 : 0.4);
    }

    // Status dot
    this.statusDot.clear();
    const dotX = w / 2 - 6;
    const dotY = h / 2 - 6;
    const dotColor = this.enabledState ? 0x4caf50 : 0x555560;
    this.statusDot.fillStyle(dotColor, 1.0).fillCircle(dotX, dotY, 2.5);
  }
}
