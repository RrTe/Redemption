import Phaser from "phaser";

export interface QuantitySelectionDialogData {
  title: string;
  maxCount: number;
  minCount?: number; // ✨ NEU: Optionales Minimum (Standard: 1)
  onConfirm: (count: number, position: "top" | "bottom") => void;
  onCancel: () => void;
  enablePositionSelection?: boolean; // ✨ NEU: Steuert die Anzeige der Positionsauswahl
}

export class QuantitySelectionDialogScene extends Phaser.Scene {
  private count = 1;
  private position: "top" | "bottom" = "top";
  private dialogData!: QuantitySelectionDialogData;

  private countText!: Phaser.GameObjects.Text;
  private topButton!: Phaser.GameObjects.Container;
  private bottomButton!: Phaser.GameObjects.Container;

  constructor() {
    super("QuantitySelectionDialogScene");
  }

  init(data: QuantitySelectionDialogData) {
    this.dialogData = data;
    this.count = data.minCount ?? 1;
    this.position = "top";
  }

  create() {
    const width = 400;
    const height = 350;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Overlay (dunkler Hintergrund)
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6)
      .setOrigin(0)
      .setInteractive();

    // Panel
    this.add
      .rectangle(cx, cy, width, height, 0x222222)
      .setStrokeStyle(2, 0x888888);

    // Titel
    this.add
      .text(cx, cy - height / 2 + 30, this.dialogData.title, {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // --- Anzahl Auswahl ---
    const qtyY = cy - 40;
    this.add
      .text(cx, qtyY - 40, `Quantity (Max: ${this.dialogData.maxCount}):`, {
        fontSize: "18px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    this.createButton(cx - 80, qtyY, "-", () => this.updateCount(-1));
    this.createButton(cx + 80, qtyY, "+", () => this.updateCount(1));

    this.countText = this.add
      .text(cx, qtyY, this.count.toString(), {
        fontSize: "48px", // ✨ FIX: Größer, passend zu PileUI
        color: "#ffffff",
        fontStyle: "bold", // ✨ FIX: Fett
        stroke: "#000000", // ✨ FIX: Schwarzer Rand (Stroke)
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // --- Position Auswahl ---
    const posY = cy + 60;
    // ✨ NEU: Nur anzeigen, wenn gewünscht (Standard: true)
    if (this.dialogData.enablePositionSelection !== false) {
      this.add
        .text(cx, posY - 40, "Position:", {
          fontSize: "18px",
          color: "#aaaaaa",
        })
        .setOrigin(0.5);

      this.topButton = this.createPositionButton(cx - 60, posY, "top");
      this.bottomButton = this.createPositionButton(cx + 60, posY, "bottom");
      this.updatePositionButtons();
    }

    // --- Aktions-Buttons ---
    const btnY = cy + height / 2 - 40;

    // ✨ NEU: Styled Button "OK" (rechts)
    this.createStyledButton(cx + 80, btnY, "OK", () => {
      this.dialogData.onConfirm(this.count, this.position);
      this.close();
    });

    // ✨ NEU: Styled Button "Cancel" (links)
    this.createStyledButton(cx - 80, btnY, "Cancel", () => {
      this.dialogData.onCancel();
      this.close();
    });
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
  ) {
    const btn = this.add
      .text(x, y, label, {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#444444",
        padding: { x: 15, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    let timer: Phaser.Time.TimerEvent | undefined;

    const stopTimer = () => {
      if (timer) {
        timer.remove();
        timer = undefined;
      }
    };

    btn.on("pointerdown", () => {
      callback();
      timer = this.time.addEvent({
        delay: 400,
        callback: () => {
          timer = this.time.addEvent({
            delay: 100,
            callback: callback,
            loop: true,
          });
        },
      });
    });

    btn.on("pointerup", stopTimer);
    btn.on("pointerout", stopTimer);

    return btn;
  }

  /**
   * ✨ NEU: Erstellt einen Button im Pergament-Stil (wie SelectionDialogScene).
   */
  private createStyledButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
  ) {
    const container = this.add.container(x, y);
    const bg = this.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(130, 50); // Passende Größe für den Dialog

    const fontSize = 24;
    const yOffset = fontSize * -0.25;
    const text = this.add.bitmapText(0, yOffset, "fairydust", label, fontSize);
    text.setOrigin(0.5);
    text.setTint(0xf4f6e1);
    text.setDropShadow(2, 2, 0x000000, 0.7);

    container.add([bg, text]);
    container.setSize(130, 50);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());
    container.on("pointerdown", callback);

    return container;
  }

  private createPositionButton(x: number, y: number, type: "top" | "bottom") {
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, 100, 50, 0x333333)
      .setStrokeStyle(2, 0x666666);

    // ✨ NEU: Icon-Bild anstelle von gezeichneten Pfeilen
    const iconKey =
      type === "top"
        ? "icon_from_top_of_pile"
        : "icon_from_bottom_of_pile";
    const icon = this.add.image(0, 0, iconKey);

    // Dynamische Größe anpassen, um in den Button zu passen, Seitenverhältnis beibehalten
    const padding = 10;
    icon.displayHeight = 50 - padding * 2;
    icon.scaleX = icon.scaleY;

    container.add([bg, icon]);
    container.setSize(100, 50);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerdown", () => {
      this.position = type;
      this.updatePositionButtons();
    });

    // Referenz speichern für Highlighting
    container.setData("bg", bg);
    container.setData("icon", icon); // ✨ NEU: Icon-Referenz für Tint-Änderung

    return container;
  }

  private updateCount(delta: number) {
    const newCount = this.count + delta;
    const min = this.dialogData.minCount ?? 1;
    if (newCount >= min && newCount <= this.dialogData.maxCount) {
      this.count = newCount;
      this.countText.setText(this.count.toString());
    }
  }

  private updatePositionButtons() {
    const topBg = this.topButton.getData("bg") as Phaser.GameObjects.Rectangle;
    const botBg = this.bottomButton.getData(
      "bg",
    ) as Phaser.GameObjects.Rectangle;
    const topIcon = this.topButton.getData("icon") as Phaser.GameObjects.Image;
    const botIcon = this.bottomButton.getData("icon") as Phaser.GameObjects.Image;

    if (this.position === "top") {
      topBg.setStrokeStyle(3, 0x00ff00); // Grün markiert
      topIcon.setTint(0xffffff); // Weiß (aktiv)
      botBg.setStrokeStyle(2, 0x666666);
      botIcon.setTint(0x999999); // Grau (inaktiv)
    } else {
      topBg.setStrokeStyle(2, 0x666666);
      topIcon.setTint(0x999999); // Grau (inaktiv)
      botBg.setStrokeStyle(3, 0x00ff00); // Grün markiert
      botIcon.setTint(0xffffff); // Weiß (aktiv)
    }
  }

  private close() {
    this.scene.resume("CardGame");
    this.scene.stop();
  }
}
