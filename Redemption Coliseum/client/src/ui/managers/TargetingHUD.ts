// client/src/ui/managers/TargetingHUD.ts
import Phaser from "phaser";
import type { SoundManager } from "../../managers/SoundManager";

export interface TargetingHUDConfig {
  promptText: string;
  minTargets: number;
  maxTargets: number;
  canCancel: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/**
 * Non-intrusive floating HUD banner displayed at the top of the screen
 * during interactive targeting modes (both for cards and piles).
 * Styled to match standard game banners (AbilityPromptBanner, DrawSequenceBanner).
 */
export class TargetingHUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private promptTextObj: Phaser.GameObjects.Text | null = null;
  private counterTextObj: Phaser.GameObjects.Text | null = null;
  private confirmBtn: Phaser.GameObjects.Container | null = null;
  private cancelBtn: Phaser.GameObjects.Container | null = null;
  private soundManager: SoundManager | undefined;

  private currentConfig: TargetingHUDConfig | null = null;
  private currentSelectedCount = 0;
  private isVisible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.soundManager = scene.registry.get("soundManager");
  }

  public show(config: TargetingHUDConfig): void {
    this.currentConfig = config;
    this.currentSelectedCount = 0;
    this.isVisible = true;

    if (!this.container) {
      this.createHUD();
    }

    this.updateContent();

    if (this.container) {
      this.scene.tweens.killTweensOf(this.container);
      this.container.setVisible(true);
      this.container.setAlpha(0);
      this.container.setY(-60);

      this.scene.tweens.add({
        targets: this.container,
        y: 35,
        alpha: 1,
        duration: 250,
        ease: "Back.easeOut",
      });
    }
  }

  public updateSelectedCount(count: number): void {
    this.currentSelectedCount = count;
    this.updateContent();
  }

  public hide(): void {
    if (!this.isVisible || !this.container) return;
    this.isVisible = false;
    this.scene.tweens.killTweensOf(this.container);

    this.scene.tweens.add({
      targets: this.container,
      y: -60,
      alpha: 0,
      duration: 200,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (this.container) this.container.setVisible(false);
      },
    });
  }

  public destroy(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }

  private createHUD(): void {
    const cx = this.scene.scale.width / 2;
    this.container = this.scene.add.container(cx, -60);
    this.container.setDepth(1500);

    const bannerW = Math.min(680, this.scene.scale.width - 40);
    const bannerH = 50;

    // 1. Dark glassmorphism background panel with double gold border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 10);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.strokeRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 10);
    bg.lineStyle(1, 0xd4af37, 0.35);
    bg.strokeRoundedRect(-bannerW / 2 + 3, -bannerH / 2 + 3, bannerW - 6, bannerH - 6, 8);

    // 2. Prompt instruction text
    this.promptTextObj = this.scene.add
      .text(-bannerW / 2 + 18, 0, "", {
        fontSize: "15px",
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        wordWrap: { width: bannerW - 240 },
      })
      .setOrigin(0, 0.5);

    // 3. Selection count badge
    this.counterTextObj = this.scene.add
      .text(bannerW / 2 - 190, 0, "", {
        fontSize: "14px",
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    // 4. Action buttons
    const btnContainer = this.scene.add.container(bannerW / 2 - 90, 0);

    // Confirm Button (Emerald Green with gold border)
    this.confirmBtn = this.createButton(
      -45,
      0,
      85,
      32,
      "Confirm",
      0x166534,
      0x22c55e,
      () => {
        if (
          this.currentConfig &&
          this.currentSelectedCount >= this.currentConfig.minTargets &&
          this.currentConfig.onConfirm
        ) {
          this.soundManager?.playSound("UI_CLICK");
          this.currentConfig.onConfirm();
        }
      }
    );

    // Cancel Button (Slate Gray with gold border, matching Pass)
    this.cancelBtn = this.createButton(
      45,
      0,
      70,
      32,
      "Cancel",
      0x334155,
      0x475569,
      () => {
        if (this.currentConfig?.onCancel) {
          this.soundManager?.playSound("UI_CLICK");
          this.currentConfig.onCancel();
        }
      }
    );

    btnContainer.add([this.confirmBtn, this.cancelBtn]);
    this.container.add([bg, this.promptTextObj, this.counterTextObj, btnContainer]);
  }

  private updateContent(): void {
    if (!this.currentConfig || !this.promptTextObj || !this.counterTextObj) return;

    this.promptTextObj.setText(this.currentConfig.promptText);

    if (this.currentConfig.maxTargets > 1) {
      this.counterTextObj.setText(`Selected: ${this.currentSelectedCount}`);
      this.counterTextObj.setVisible(true);
    } else {
      this.counterTextObj.setVisible(false);
    }

    if (this.cancelBtn) {
      this.cancelBtn.setVisible(this.currentConfig.canCancel);
    }

    if (this.confirmBtn) {
      const canConfirm = this.currentSelectedCount >= this.currentConfig.minTargets;
      this.confirmBtn.setAlpha(canConfirm ? 1 : 0.4);
      this.confirmBtn.setVisible(true);
    }
  }

  private createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    hoverColor: number,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, 0xd4af37, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const txt = this.scene.add
      .text(0, 0, label, {
        fontSize: "13px",
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    c.add([bg, txt]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", callback);
    c.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(1.5, 0xd4af37, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    });
    c.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(1.5, 0xd4af37, 0.8);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    });
    return c;
  }
}
