import Phaser from "phaser";
import { type CardData } from "../../../../shared/card";
import { ViewportManager } from "../managers/ViewportManager";
import { AnimationManager } from "../managers/AnimationManager";

export interface TypeSelectionOption {
  id: string; // The type or alignment ID (e.g. "GE", "GoodDom", "Hero", "Evil Character")
  iconKey: string;
  label: string;
  isAlignment?: boolean; // Whether this represents an alignment choice rather than a Type
}

export class TypeSelectionOverlay {
  private scene: Phaser.Scene;
  private animationManager: AnimationManager;
  private container!: Phaser.GameObjects.Container;
  private blocker!: Phaser.GameObjects.Rectangle;
  private options: TypeSelectionOption[];
  private onSelect: (selectedId: string) => void;
  private onCancel: () => void;
  private cardData: CardData;
  private pulseControls: { stop: () => void }[] = [];

  constructor(
    scene: Phaser.Scene,
    animationManager: AnimationManager,
    cardData: CardData,
    options: TypeSelectionOption[],
    onSelect: (selectedId: string) => void,
    onCancel: () => void
  ) {
    this.scene = scene;
    this.animationManager = animationManager;
    this.cardData = cardData;
    this.options = options;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
  }

  public show() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    this.container = this.scene.add.container(0, 0).setDepth(5000);

    // Blocker with a dark overlay
    this.blocker = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();

    this.container.add(this.blocker);

    // Title
    const titleText = this.scene.add
      .bitmapText(centerX, height * 0.15, "fairydust", "Choose how to play this card:", 48)
      .setOrigin(0.5)
      .setTint(0xffd700)
      .setDropShadow(4, 4, 0x000000, 0.8);
    this.container.add(titleText);

    // Card Image Preview
    const cardKey = `card-${this.cardData.ImageFile}`;
    const cardImage = this.scene.add.image(centerX, centerY, cardKey);

    // Scale card image (large representation)
    const cardScale = ViewportManager.vmin(40) / cardImage.height;
    cardImage.setScale(cardScale);
    this.container.add(cardImage);

    // Buttons
    const buttonSpacing = ViewportManager.vmin(20);
    const totalWidth = (this.options.length - 1) * buttonSpacing;
    const startX = centerX - totalWidth / 2;
    const buttonY = centerY;

    this.options.forEach((opt, index) => {
      const btnX = startX + index * buttonSpacing;
      // Position them overlapping the card, or just above it
      const btnY = buttonY - ViewportManager.vmin(15);

      const btnContainer = this.scene.add.container(btnX, btnY);

      const icon = this.scene.add.image(0, 0, opt.iconKey);

      // Determine base scale based on texture size
      const maxDim = Math.max(icon.width, icon.height);
      const targetSize = ViewportManager.vmin(12);
      const baseScale = targetSize / maxDim;
      icon.setScale(baseScale);
      icon.setData('baseScale', baseScale);

      // Start Pulse Animation for icon
      let pulseControl = this.animationManager.startPulseAnimation(this.scene, icon, 0.1, 0.6);
      this.pulseControls.push(pulseControl);

      // Setup interaction
      icon.setInteractive({ useHandCursor: true });
      icon.on("pointerover", () => {
        this.scene.game.events.emit("playSound", "MENU_HOVER");
        // Pulse stoppen während wir hovern
        if (pulseControl) {
          pulseControl.stop();
        }

        // Enlarge and glow
        this.scene.tweens.add({
          targets: icon,
          scale: baseScale * 1.3,
          duration: 150,
          ease: "Power2"
        });

        // Add glow effect similar to RadialMenu/HubScene
        const glow = this.scene.add.image(0, 0, "light_glow").setAlpha(0.6).setScale(baseScale * 1.0);
        icon.setData("glow", glow);
        btnContainer.addAt(glow, 0); // Put glow behind icon
      });

      icon.on("pointerout", () => {
        this.scene.tweens.add({
          targets: icon,
          scale: baseScale,
          duration: 150,
          ease: "Power2",
          onComplete: () => {
             // Pulse wieder starten nach dem Rauszoomen
             pulseControl = this.animationManager.startPulseAnimation(this.scene, icon, 0.1, 0.6);
             this.pulseControls.push(pulseControl);
          }
        });
        const glow = icon.getData("glow");
        if (glow) {
          glow.destroy();
          icon.setData("glow", null);
        }
      });

      icon.on("pointerdown", () => {
        this.scene.game.events.emit("playSound", "MENU_SELECT");
        this.select(opt.id);
      });

      btnContainer.add(icon);

      // Label below icon
      const labelText = this.scene.add
        .text(0, targetSize / 2 + 10, opt.label, {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      btnContainer.add(labelText);

      this.container.add(btnContainer);
    });

    // Cancel Button
    const cancelBtn = this.scene.add
      .text(centerX, height * 0.85, "Cancel", {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#ff8888",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    cancelBtn.on("pointerdown", () => {
      this.cancel();
    });

    this.container.add(cancelBtn);

    // Initial enter animation
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 250,
      ease: "Power2"
    });
  }

  private close() {
    this.pulseControls.forEach(p => p.stop());
    this.pulseControls = [];

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 200,
      ease: "Power2",
      onComplete: () => {
        this.container.destroy();
      }
    });
  }

  private select(id: string) {
    this.close();
    this.onSelect(id);
  }

  private cancel() {
    this.close();
    this.onCancel();
  }
}
