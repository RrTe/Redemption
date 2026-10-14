// client/src/scenes/ConfirmationDialogScene.ts
import Phaser from "phaser";
import { SoundManager } from "../managers/SoundManager";
import { PreviewManager } from "../ui/managers/PreviewManager";

export interface ConfirmationDialogData {
  title?: string;
  message: string;
  confirmLabel?: string;
  declineLabel?: string;
  onConfirm: () => void;
  onDecline: () => void;
  cardImageFile?: string;
  templateId?: string;
  cardData?: any;
}

/**
 * A modal scene for yes/no confirmation prompts (e.g. undo requests, optional abilities).
 * Styled in dark glassmorphism with double gold borders and HUD-themed action buttons.
 */
export class ConfirmationDialogScene extends Phaser.Scene {
  private dialogData!: ConfirmationDialogData;
  private soundManager!: SoundManager;
  private previewManager!: PreviewManager;
  private onResize = () => {
    if (this.scene.isActive()) {
      this.scene.restart(this.dialogData);
    }
  };

  constructor() {
    super("ConfirmationDialogScene");
  }

  init(data: ConfirmationDialogData) {
    this.dialogData = data;
    this.soundManager = this.registry.get("soundManager");
    this.previewManager = new PreviewManager(this);
    this.events.once("shutdown", () => {
      this.previewManager?.hide();
      this.game.events.off("viewport-changed", this.onResize, this);
    });
  }

  create() {
    this.game.events.on("viewport-changed", this.onResize, this);

    const hasCard = Boolean(this.dialogData.cardImageFile);
    const baseW = hasCard ? 500 : 460;
    const baseH = hasCard ? 320 : 240;
    const totalVisualH = hasCard ? 410 : baseH;

    // Responsive scaling factor based on current viewport
    const scaleFactor = Math.min(
      1,
      (this.scale.width * 0.92) / baseW,
      (this.scale.height * 0.90) / totalVisualH
    );

    const width = Math.round(baseW * scaleFactor);
    const height = Math.round(baseH * scaleFactor);
    const cx = this.scale.width / 2;
    const cy = hasCard
      ? this.scale.height / 2 + Math.round(45 * scaleFactor)
      : this.scale.height / 2;

    // Overlay (dimmed background absorbing pointer input)
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setInteractive();

    // Dark glassmorphism panel with double gold borders
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.96);
    bg.fillRoundedRect(cx - width / 2, cy - height / 2, width, height, 14);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.strokeRoundedRect(cx - width / 2, cy - height / 2, width, height, 14);
    bg.lineStyle(1, 0xd4af37, 0.35);
    bg.strokeRoundedRect(cx - width / 2 + 5, cy - height / 2 + 5, width - 10, height - 10, 10);

    if (hasCard && this.dialogData.cardImageFile) {
      this.renderCardThumbnail(cx, cy - height / 2 + Math.round(15 * scaleFactor), scaleFactor);
    }

    const titleY = hasCard ? cy - Math.round(8 * scaleFactor) : cy - height / 2 + Math.round(45 * scaleFactor);
    const messageY = hasCard ? cy + Math.round(48 * scaleFactor) : cy + Math.round(12 * scaleFactor);
    const buttonY = cy + height / 2 - Math.max(26, Math.round(38 * scaleFactor));
    const wrapW = width - Math.round(40 * scaleFactor);

    // Title (wrapped and styled in gold serif typography)
    this.add
      .text(cx, titleY, this.dialogData.title || "Confirmation", {
        fontSize: `${Math.max(14, Math.round((hasCard ? 20 : 22) * scaleFactor))}px`,
        fontFamily: "'Cinzel', 'Trajan Pro', Georgia, serif",
        fontStyle: "bold",
        color: "#ffd700",
        align: "center",
        wordWrap: { width: wrapW },
        shadow: { offsetX: 2, offsetY: 2, color: "#000000", blur: 2, fill: true },
      })
      .setOrigin(0.5);

    // Message
    this.add
      .text(cx, messageY, this.dialogData.message, {
        fontSize: `${Math.max(12, Math.round(18 * scaleFactor))}px`,
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        color: "#e2e8f0",
        align: "center",
        wordWrap: { width: wrapW },
      })
      .setOrigin(0.5)
      .setLineSpacing(Math.round(5 * scaleFactor));

    const btnW = Math.max(90, Math.round(130 * scaleFactor));
    const btnH = Math.max(34, Math.round(40 * scaleFactor));
    const btnOffset = Math.max(btnW / 2 + 8, Math.round(90 * scaleFactor));
    const confirmLabel = this.dialogData.confirmLabel || "Accept";
    const declineLabel = this.dialogData.declineLabel || "Decline";

    // Accept Button (emerald green with gold border)
    this.createHudButton(cx - btnOffset, buttonY, btnW, btnH, confirmLabel, 0x166534, 0x22c55e, scaleFactor, () => {
      this.soundManager?.playSound("UI_CLICK");
      this.previewManager?.hide();
      this.dialogData.onConfirm();
      this.scene.stop();
    });

    // Decline Button (slate gray with gold border, matching HUD Pass button)
    this.createHudButton(cx + btnOffset, buttonY, btnW, btnH, declineLabel, 0x334155, 0x475569, scaleFactor, () => {
      this.soundManager?.playSound("UI_CLICK");
      this.previewManager?.hide();
      this.dialogData.onDecline();
      this.scene.stop();
    });
  }

  private renderCardThumbnail(cx: number, thumbY: number, scaleFactor: number) {
    const cardWidth = Math.round(152 * scaleFactor);
    const cardHeight = Math.round(212 * scaleFactor);
    const imageFile = this.dialogData.cardImageFile;
    const texKey = imageFile ? `card-${imageFile}` : "";

    // 1. Drop shadow (NineSlice) protruding behind thumbnail
    const shadowOffset = Math.max(3, Math.round(6 * scaleFactor));
    const shadow = this.add.nineslice(
      cx + shadowOffset,
      thumbY + shadowOffset,
      "drop_shadow",
      undefined,
      cardWidth,
      cardHeight,
      8,
      8,
      8,
      8
    );
    shadow.setAlpha(0.6).setTint(0x000000).setOrigin(0.5);

    // 2. Card image
    const initialKey = texKey && this.textures.exists(texKey) ? texKey : "card-back";
    const thumbImg = this.add.image(cx, thumbY, initialKey);
    thumbImg.setDisplaySize(cardWidth, cardHeight);

    if (imageFile && !this.textures.exists(texKey)) {
      this.load.image(texKey, `assets/cards/${imageFile}.jpg`);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.scene.isActive() && this.textures.exists(texKey)) {
          thumbImg.setTexture(texKey);
          thumbImg.setDisplaySize(cardWidth, cardHeight);
        }
      });
      this.load.start();
    }

    // 3. Subtle gold hairline border
    this.add
      .rectangle(cx, thumbY, cardWidth, cardHeight)
      .setStrokeStyle(Math.max(1, 1.5 * scaleFactor), 0xd4af37)
      .setFillStyle(0x000000, 0);

    // 4. Hover preview interaction
    thumbImg.setInteractive({ useHandCursor: true });
    thumbImg.on("pointerover", () => {
      if (this.previewManager && this.dialogData.cardData) {
        this.previewManager.showFromData(this.dialogData.cardData, cx + cardWidth / 2 + 15, thumbY);
      }
    });
    thumbImg.on("pointerout", () => {
      this.previewManager?.hide();
    });
  }

  private createHudButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    hoverColor: number,
    scaleFactor: number,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(1.5, 0xd4af37, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

    const text = this.add
      .text(0, 0, label, {
        fontSize: `${Math.max(11, Math.round(15 * scaleFactor))}px`,
        fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(1.5, 0xffe066, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });

    container.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(1.5, 0xd4af37, 0.9);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });

    container.on("pointerdown", callback);
    return container;
  }
}
