// client/src/ui/managers/TargetingHUD.ts
import Phaser from "phaser";

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
 */
export class TargetingHUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private promptTextObj: Phaser.GameObjects.Text | null = null;
  private counterTextObj: Phaser.GameObjects.Text | null = null;
  private confirmBtn: Phaser.GameObjects.Container | null = null;
  private cancelBtn: Phaser.GameObjects.Container | null = null;

  private currentConfig: TargetingHUDConfig | null = null;
  private currentSelectedCount = 0;
  private isVisible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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
      this.container.setVisible(true);
      this.container.setAlpha(0);
      this.container.setY(-60);

      this.scene.tweens.add({
        targets: this.container,
        y: 25,
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
    const bannerH = 54;

    // 1. Dark glassmorphism background panel
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0e0e14, 0.92);
    bg.fillRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 12);
    bg.lineStyle(2, 0xdc143c, 0.9);
    bg.strokeRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 12);

    // 2. Prompt instruction text
    this.promptTextObj = this.scene.add
      .text(-bannerW / 2 + 20, -7, "", {
        fontSize: "17px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // 3. Selection count badge
    this.counterTextObj = this.scene.add
      .text(0, -7, "", {
        fontSize: "15px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // 4. Action buttons
    const btnContainer = this.scene.add.container(bannerW / 2 - 120, -7);

    // Cancel Button
    this.cancelBtn = this.createButton("Cancel", 0xe74c3c, () => {
      if (this.currentConfig?.onCancel) this.currentConfig.onCancel();
    });
    this.cancelBtn.setX(45);

    // Confirm Button
    this.confirmBtn = this.createButton("Confirm", 0x2ecc71, () => {
      if (this.currentConfig?.onConfirm) this.currentConfig.onConfirm();
    });
    this.confirmBtn.setX(-45);

    btnContainer.add([this.cancelBtn, this.confirmBtn]);
    this.container.add([bg, this.promptTextObj, this.counterTextObj, btnContainer]);
  }

  private updateContent(): void {
    if (!this.currentConfig || !this.promptTextObj || !this.counterTextObj) return;

    this.promptTextObj.setText(this.currentConfig.promptText);

    if (this.currentConfig.maxTargets > 1) {
      this.counterTextObj.setText(
        `(${this.currentSelectedCount}/${this.currentConfig.maxTargets})`,
      );
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
      this.confirmBtn.setVisible(this.currentConfig.maxTargets > 1);
    }
  }

  private createButton(label: string, tint: number, callback: () => void): Phaser.GameObjects.Container {
    const c = this.scene.add.container(0, 0);
    const bg = this.scene.add.graphics();
    bg.fillStyle(tint, 0.85);
    bg.fillRoundedRect(-38, -15, 76, 30, 6);
    bg.lineStyle(1, 0xffffff, 0.5);
    bg.strokeRoundedRect(-38, -15, 76, 30, 6);

    const txt = this.scene.add
      .text(0, 0, label, {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    c.add([bg, txt]);
    c.setSize(76, 30);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", callback);
    c.on("pointerover", () => bg.setAlpha(1.0));
    c.on("pointerout", () => bg.setAlpha(0.85));
    return c;
  }
}
