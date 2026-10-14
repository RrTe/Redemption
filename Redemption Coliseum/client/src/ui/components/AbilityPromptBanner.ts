// client/src/ui/components/AbilityPromptBanner.ts
import Phaser from "phaser";
import { SoundManager } from "../../managers/SoundManager";

export interface AbilityPromptBannerConfig {
  cardTitle: string;
  promptText: string;
  confirmLabel?: string;
  declineLabel?: string;
  onConfirm: () => void;
  onDecline: () => void;
}

/**
 * Non-intrusive floating HUD banner displayed at the top of the screen
 * when In-Game Help is disabled (pro mode).
 */
export class AbilityPromptBanner {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private isVisible = false;
  private soundManager: SoundManager | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.soundManager = scene.registry.get("soundManager");
  }

  public show(config: AbilityPromptBannerConfig): void {
    this.isVisible = true;

    if (!this.container) {
      this.createBanner(config);
    } else {
      this.updateBanner(config);
    }

    if (this.container) {
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

  public hide(callback?: () => void): void {
    if (!this.isVisible || !this.container) {
      callback?.();
      return;
    }
    this.isVisible = false;

    this.scene.tweens.add({
      targets: this.container,
      y: -60,
      alpha: 0,
      duration: 200,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (this.container) {
          this.container.setVisible(false);
        }
        callback?.();
      },
    });
  }

  private createBanner(config: AbilityPromptBannerConfig): void {
    const cx = this.scene.scale.width / 2;
    this.container = this.scene.add.container(cx, -60);
    this.container.setDepth(1500);

    const bannerW = Math.min(680, this.scene.scale.width - 40);
    const bannerH = 50;

    // 1. Dark glassmorphism background with gold double border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 10);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.strokeRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 10);
    bg.lineStyle(1, 0xd4af37, 0.35);
    bg.strokeRoundedRect(-bannerW / 2 + 3, -bannerH / 2 + 3, bannerW - 6, bannerH - 6, 8);

    // 2. Prompt text with card name in gold
    const fullText = `${config.cardTitle}: ${config.promptText}`;
    const promptText = this.scene.add
      .text(-bannerW / 2 + 18, 0, fullText, {
        fontSize: "15px",
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        fontStyle: "bold",
        color: "#ffd700",
        wordWrap: { width: bannerW - 220 },
      })
      .setOrigin(0, 0.5)
      .setName("promptText");

    // 3. Confirm button (emerald green with gold border)
    const confirmBtn = this.createButton(
      bannerW / 2 - 125,
      0,
      85,
      32,
      config.confirmLabel || "Activate",
      0x166534,
      0x22c55e,
      () => {
        this.soundManager?.playSound("UI_CLICK");
        this.hide(() => config.onConfirm());
      }
    ).setName("confirmBtn");

    // 4. Decline button (slate gray with gold border, matching HUD)
    const declineBtn = this.createButton(
      bannerW / 2 - 38,
      0,
      70,
      32,
      config.declineLabel || "Pass",
      0x334155,
      0x475569,
      () => {
        this.soundManager?.playSound("UI_CLICK");
        this.hide(() => config.onDecline());
      }
    ).setName("declineBtn");

    this.container.add([bg, promptText, confirmBtn, declineBtn]);
  }

  private updateBanner(config: AbilityPromptBannerConfig): void {
    if (!this.container) return;
    const txt = this.container.getByName("promptText") as Phaser.GameObjects.Text;
    if (txt) {
      txt.setText(`${config.cardTitle}: ${config.promptText}`);
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
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, 0xd4af37, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const txt = this.scene.add
      .text(0, 0, label, {
        fontSize: "14px",
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    btn.add([bg, txt]);
    btn.setSize(w, h);
    btn.setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(1.5, 0xffe066, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    });

    btn.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      bg.lineStyle(1.5, 0xd4af37, 0.9);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    });

    btn.on("pointerdown", onClick);
    return btn;
  }

  public destroy(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
