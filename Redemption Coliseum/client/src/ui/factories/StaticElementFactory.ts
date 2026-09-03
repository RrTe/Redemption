import Phaser from "phaser";
import { PHASES } from "../../../../shared/phases.js";
import { type StaticElements } from "../types/ElementTypes";
import { DEBUG } from "../../utils/logger";
import { SidebarButton } from "../components/SidebarButton";
import { TooltipManager } from "../managers/TooltipManager";
import { createHighlightOverlay } from "./HighlightOverlayFactory";

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
    const undoButton = this.createUndoButton();
    const concedeButton = this.createConcedeButton();

    // Sidebar Buttons
    const settingsButton = new SidebarButton(
      this.scene, "button_settings", this.scene.scale.height * 0.18, true,
      () => this.scene.events.emit("settings_button_clicked")
    );
    const saveButton = new SidebarButton(
      this.scene, "button_save", this.scene.scale.height * 0.3, true,
      () => this.scene.events.emit("save_button_clicked"), "button_save_game"
    );
    const helpButton = new SidebarButton(
      this.scene, "button_help", this.scene.scale.height * 0.7, false,
      () => this.scene.events.emit("help_button_clicked")
    );

    // Phasen-Indikatoren
    const phaseIndicator = this.scene.add.graphics();
    phaseIndicator.setBlendMode(Phaser.BlendModes.ADD);
    phaseIndicator.setDepth(5);

    const phaseBar = this.scene.add.graphics();
    phaseBar.setDepth(1);

    const phaseIcons = this.createPhaseIcons();

    // Spieler-Infos
    const playerInfoText = this.scene.add.bitmapText(0, 0, "wazoo", "", 22)
      .setOrigin(0, 0).setTint(0xffd700).setDropShadow(2, 2, 0x000000, 0.8);

    const opponentInfoText = this.scene.add.bitmapText(0, 0, "wazoo", "Waiting...", 22)
      .setOrigin(1, 0).setRightAlign().setTint(0xffd700).setDropShadow(2, 2, 0x000000, 0.8);

    // Highlight Overlay
    const highlightOverlay = createHighlightOverlay(this.scene);

    return {
      boardText,
      phaseIcons,
      nextPhaseButton,
      undoButton,
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

  private createBarGraphics(width: number, height: number, radius = 12): Phaser.GameObjects.Graphics {
    const bar = this.scene.add.graphics();
    const barX = -width / 2;
    const barY = -height / 2;
    bar.fillStyle(0x000000, 0.5).fillRoundedRect(barX + 3, barY + 3, width, height, radius);
    bar.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(barX, barY, width, height, radius);
    bar.fillStyle(0xffffff, 0.05).fillRoundedRect(barX, barY, width, height / 2, { tl: radius, tr: radius, bl: 0, br: 0 });
    bar.lineStyle(2, 0x444466, 0.8).strokeRoundedRect(barX, barY, width, height, radius);
    return bar;
  }

  private createNextPhaseButton(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0).setVisible(false).setDepth(200);
    const barWidth = 80;
    const barHeight = 46;
    const btnBar = this.createBarGraphics(barWidth, barHeight, 12);

    const btnImage = this.scene.add.image(0, 0, "button_next_phase");
    btnImage.setDisplaySize(60, 30);
    btnImage.setName("arrow");

    container.add([btnBar, btnImage]);

    const hitArea = new Phaser.Geom.Rectangle(-barWidth / 2, -barHeight / 2, barWidth, barHeight);
    container
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => {
        TooltipManager.hide();
        const base = container.getData("baseScale") || 1.0;
        this.scene.events.emit("nextPhaseButtonClicked");
        this.scene.tweens.add({ targets: container, scale: base * 1.05, duration: 50, yoyo: true });
        btnImage.setTint(0xffffff);
      })
      .on("pointerover", () => {
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base * 1.15, duration: 100, ease: "Back.easeOut" });
        btnImage.setTint(0xffffaa);
        const bounds = btnImage.getBounds();
        TooltipManager.show(bounds.centerX, bounds.top, "button_next_phase");
      })
      .on("pointerout", () => {
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base, duration: 100 });
        btnImage.clearTint();
        TooltipManager.hide();
      });

    if (container.input) container.input.cursor = "pointer";
    return container;
  }

  private createUndoButton(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0).setDepth(200);
    const barWidth = 46;
    const barHeight = 46;
    const btnBar = this.createBarGraphics(barWidth, barHeight, 12);

    const btnImage = this.scene.add.image(0, 0, "button_undo");
    btnImage.setDisplaySize(30, 31.3);
    btnImage.setName("arrow");

    container.add([btnBar, btnImage]);

    let longPressTimer: any = null;
    let didLongPress = false;

    const hitArea = new Phaser.Geom.Rectangle(-barWidth / 2, -barHeight / 2, barWidth, barHeight);
    container
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => {
        didLongPress = false;
        longPressTimer = setTimeout(() => {
          didLongPress = true;
          this.scene.events.emit("undoButtonClicked", { isLongPress: true });
        }, 500);

        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base * 1.05, duration: 50, yoyo: true });
      })
      .on("pointerup", () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (!didLongPress) {
          this.scene.events.emit("undoButtonClicked", { isLongPress: false });
        }
      })
      .on("pointerover", () => {
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base * 1.15, duration: 100, ease: "Back.easeOut" });
        btnImage.setTint(0xffffaa);
        const bounds = btnImage.getBounds();
        TooltipManager.show(bounds.centerX, bounds.top, "button_undo");
      })
      .on("pointerout", () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        const base = container.getData("baseScale") || 1.0;
        this.scene.tweens.add({ targets: container, scale: base, duration: 100 });
        btnImage.clearTint();
        TooltipManager.hide();
      });

    // Initial disabled state
    if (container.input) {
      container.input.cursor = "pointer";
      container.input.enabled = false;
    }
    container.setAlpha(0.4);
    btnImage.setTint(0x777777);

    return container;
  }

  private createConcedeButton(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0).setDepth(200);
    const cBarWidth = 80;
    const cBarHeight = 46;
    const concedeBar = this.createBarGraphics(cBarWidth, cBarHeight, 12);

    const concedeImg = this.scene.add.image(0, 0, "button_concede");
    concedeImg.setDisplaySize(36, 36);
    container.add([concedeBar, concedeImg]);

    const hitArea = new Phaser.Geom.Rectangle(-cBarWidth / 2, -cBarHeight / 2, cBarWidth, cBarHeight);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
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
}
