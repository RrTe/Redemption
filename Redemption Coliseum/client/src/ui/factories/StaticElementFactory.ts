import Phaser from "phaser";
import { PHASES } from "../../../../shared/phases.js";
import { type StaticElements } from "../types/ElementTypes";
import { DEBUG } from "../../utils/logger";
import { SidebarButton } from "../components/SidebarButton";
import { TooltipManager } from "../managers/TooltipManager";

export class StaticElementFactory {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public create(): StaticElements {
    const boardText = this.scene.add.text(0, 0, "Board: 0 Karten", {
      fontSize: "16px",
      color: "#aaf",
    });
    boardText.setVisible(DEBUG);

    const nextPhaseButton = this.createNextPhaseButton();
    const concedeButton = this.createConcedeButton();

    // Settings Button (Gold)
    const settingsButton = new SidebarButton(
      this.scene,
      "button_settings",
      this.scene.scale.height * 0.18,
      true, // Right side
      () => {
        // Handled in StaticUIHandler usually, but we can emit an event here or leave it empty and bind later
        // wait, SidebarButton takes onClick. We can just emit an event:
        this.scene.events.emit("settings_button_clicked");
      }
    );

    // Save Button
    const saveButton = new SidebarButton(
      this.scene,
      "button_save",
      this.scene.scale.height * 0.3,
      true, // Right side
      () => {
        this.scene.events.emit("save_button_clicked");
      },
      "button_save_game"
    );

    // Help Button
    const helpButton = new SidebarButton(
      this.scene,
      "button_help",
      this.scene.scale.height * 0.7,
      false, // Left side
      () => {
        this.scene.events.emit("help_button_clicked");
      }
    );

    // Phasen-Indikatoren
    const phaseIndicator = this.scene.add.graphics();
    phaseIndicator.setBlendMode(Phaser.BlendModes.ADD);
    phaseIndicator.setDepth(5);

    const phaseBar = this.scene.add.graphics();
    phaseBar.setDepth(1);

    const phaseIcons = this.createPhaseIcons();

    // Spieler-Infos
    const playerInfoText = this.scene.add
      .bitmapText(0, 0, "wazoo", "", 22)
      .setOrigin(0, 0)
      .setTint(0xffd700)
      .setDropShadow(2, 2, 0x000000, 0.8);

    const opponentInfoText = this.scene.add
      .bitmapText(0, 0, "wazoo", "Waiting...", 22)
      .setOrigin(1, 0)
      .setRightAlign()
      .setTint(0xffd700)
      .setDropShadow(2, 2, 0x000000, 0.8);

    // Highlight Overlay
    const highlightOverlay = this.createHighlightOverlay();

    return {
      boardText,
      phaseIcons,
      nextPhaseButton,
      concedeButton,
      settingsButton,
      saveButton,
      helpButton,
      phaseIndicator,
      phaseBar,
      playerInfoText,
      opponentInfoText,
      highlightOverlay: highlightOverlay.container,
      highlightGraphics: highlightOverlay.graphics,
      highlightText: highlightOverlay.text,
    };
  }

  private createNextPhaseButton(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0).setVisible(false);
    const btnBar = this.scene.add.graphics();
    const barWidth = 80;
    const barHeight = 46;
    const radius = 12;
    const barX = -barWidth / 2;
    const barY = -barHeight / 2;

    // Design
    btnBar.fillStyle(0x000000, 0.5).fillRoundedRect(barX + 3, barY + 3, barWidth, barHeight, radius);
    btnBar.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(barX, barY, barWidth, barHeight, radius);
    btnBar.fillStyle(0xffffff, 0.05).fillRoundedRect(barX, barY, barWidth, barHeight / 2, { tl: radius, tr: radius, bl: 0, br: 0 });
    btnBar.lineStyle(2, 0x444466, 0.8).strokeRoundedRect(barX, barY, barWidth, barHeight, radius);

    const btnImage = this.scene.add.image(0, 0, "button_next_phase");
    btnImage.setDisplaySize(60, 30);
    btnImage.setName("arrow");

    container.add([btnBar, btnImage]);

    // Glow FX
    let glowFx: any = null;
    if ((btnImage as any).preFX) {
      glowFx = (btnImage as any).preFX.addGlow(0xffd700, 0, 0, false);
    }

    const hitArea = new Phaser.Geom.Rectangle(barX, barY, barWidth, barHeight);
    container
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => {
        TooltipManager.hide();
        const base = container.getData("baseScale") || 1.0;
        this.scene.events.emit("nextPhaseButtonClicked");
        this.scene.tweens.add({ targets: container, scale: base * 1.05, duration: 50, yoyo: true });
        if (glowFx) this.scene.tweens.add({ targets: glowFx, outerStrength: 6, duration: 50, yoyo: true });
      })
      .on("pointerover", () => {
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base * 1.15, duration: 100, ease: "Back.easeOut" });
        if (glowFx) this.scene.tweens.add({ targets: glowFx, outerStrength: 4, duration: 100 });
        else btnImage.setTint(0xffffaa);
        const bounds = btnImage.getBounds();
        TooltipManager.show(bounds.centerX, bounds.top, "button_next_phase");
      })
      .on("pointerout", () => {
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base, duration: 100 });
        if (glowFx) this.scene.tweens.add({ targets: glowFx, outerStrength: 0, duration: 100 });
        else btnImage.clearTint();
        TooltipManager.hide();
      });

    if (container.input) container.input.cursor = "pointer";
    return container;
  }

  private createConcedeButton(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const concedeBar = this.scene.add.graphics();
    const cBarWidth = 80;
    const cBarHeight = 46;
    const cRadius = 12;
    const cBarX = -cBarWidth / 2;
    const cBarY = -cBarHeight / 2;

    concedeBar.fillStyle(0x000000, 0.5).fillRoundedRect(cBarX + 3, cBarY + 3, cBarWidth, cBarHeight, cRadius);
    concedeBar.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight, cRadius);
    concedeBar.fillStyle(0xffffff, 0.05).fillRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight / 2, { tl: cRadius, tr: cRadius, bl: 0, br: 0 });
    concedeBar.lineStyle(2, 0x444466, 0.8).strokeRoundedRect(cBarX, cBarY, cBarWidth, cBarHeight, cRadius);

    const concedeImg = this.scene.add.image(0, 0, "button_concede");
    concedeImg.setDisplaySize(36, 36);
    container.add([concedeBar, concedeImg]);

    container.setInteractive(new Phaser.Geom.Rectangle(cBarX, cBarY, cBarWidth, cBarHeight), Phaser.Geom.Rectangle.Contains);
    if (container.input) container.input.cursor = "pointer";

    container.on("pointerover", () => {
      const base = container.getData("baseScale") || 1.0;
      this.scene.tweens.add({ targets: container, scale: base * 1.15, duration: 100, ease: "Back.easeOut" });
      concedeImg.setTint(0xffaaaa);
      const bounds = concedeImg.getBounds();
      TooltipManager.show(bounds.centerX, bounds.top, "button_concede");
    });
    container.on("pointerout", () => {
      const base = container.getData("baseScale") || 1.0;
      this.scene.tweens.add({ targets: container, scale: base, duration: 100 });
      concedeImg.clearTint();
      TooltipManager.hide();
    });
    container.on("pointerdown", () => {
      TooltipManager.hide();
    });

    return container;
  }

  private createPhaseIcons(): { [key: string]: Phaser.GameObjects.Image } {
    const phaseIcons: { [key: string]: Phaser.GameObjects.Image } = {};
    const phasesToShow = Object.values(PHASES) as string[];
    const iconKeyMap: Record<string, string> = { [PHASES.PREP]: "icon_preparation" };

    phasesToShow.forEach((phase) => {
      const iconKey = iconKeyMap[phase] || `icon_${phase}`;
      const icon = this.scene.add.image(0, 0, iconKey)
        .setOrigin(0.5)
        .setAlpha(1)
        .setVisible(true)
        .setDepth(10);
      phaseIcons[phase] = icon;
    });
    return phaseIcons;
  }

  private createHighlightOverlay() {
    const container = this.scene.add.container(0, 0).setDepth(2000).setVisible(false);
    const graphics = this.scene.add.graphics();
    const text = this.scene.add.bitmapText(0, 0, "fairydust", "", 48)
      .setOrigin(0.5)
      .setAlpha(0.5)
      .setTint(0xffffff)
      .setDropShadow(2, 2, 0x000000, 0.5);

    container.add([graphics, text]);

    this.scene.tweens.add({
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
}
