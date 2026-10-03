import Phaser from "phaser";

/**
 * Visual banner component for Draw Phase sequence selection and Chronicle execution.
 * Pure UI rendering decoupled from network and state logic.
 */
export class DrawSequenceBanner {
  private container: Phaser.GameObjects.Container;
  private promptText: Phaser.GameObjects.Text;
  private confirmBtn: Phaser.GameObjects.Container;
  private confirmBtnText: Phaser.GameObjects.Text;
  private passBtn: Phaser.GameObjects.Container;
  private passBtnText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    onConfirm: () => void,
    onPass: () => void
  ) {
    const w = 620, h = 48;
    this.container = scene.add.container(scene.scale.width / 2, 35).setDepth(200).setVisible(false);

    const bg = scene.add.graphics().fillStyle(0x0f172a, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(2, 0xd4af37, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);

    this.promptText = scene.add.text(-w / 2 + 20, 0, "", {
      fontSize: "14px", fontFamily: "Arial, sans-serif", fontStyle: "bold", color: "#ffffff",
    }).setOrigin(0, 0.5);

    this.confirmBtn = this.createButton(scene, w / 2 - 130, 0, 110, 32, 0x166534, onConfirm);
    this.confirmBtnText = this.confirmBtn.getByName("btnText") as Phaser.GameObjects.Text;

    this.passBtn = this.createButton(scene, w / 2 - 50, 0, 60, 32, 0x334155, onPass, "Pass");
    this.passBtnText = this.passBtn.getByName("btnText") as Phaser.GameObjects.Text;

    this.container.add([bg, this.promptText, this.confirmBtn, this.passBtn]);
  }

  private createButton(
    scene: Phaser.Scene,
    x: number, y: number, w: number, h: number,
    color: number, onClick: () => void, label = ""
  ): Phaser.GameObjects.Container {
    const btn = scene.add.container(x, y);
    const bg = scene.add.graphics().fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, 0xd4af37, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    const txt = scene.add.text(0, 0, label, {
      fontSize: "13px", fontFamily: "Arial, sans-serif", fontStyle: "bold", color: "#ffffff",
    }).setOrigin(0.5).setName("btnText");
    return btn.add([bg, txt]).setSize(w, h).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public setPrompt(text: string): void {
    this.promptText.setText(text);
  }

  public setConfirmButton(label: string, visible: boolean, enabled: boolean, alpha: number): void {
    this.confirmBtnText.setText(label);
    this.confirmBtn.setVisible(visible).setAlpha(alpha);
    if (enabled) this.confirmBtn.setInteractive({ useHandCursor: true });
    else this.confirmBtn.disableInteractive();
  }

  public setPassButton(label: string, visible: boolean, enabled: boolean, alpha: number): void {
    this.passBtnText.setText(label);
    this.passBtn.setVisible(visible).setAlpha(alpha);
    if (enabled) this.passBtn.setInteractive({ useHandCursor: true });
    else this.passBtn.disableInteractive();
  }

  public destroy(): void {
    this.container.destroy();
  }
}
