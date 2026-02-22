import Phaser from "phaser";

export abstract class BaseLoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;
  private assetText!: Phaser.GameObjects.Text;

  constructor(key: string) {
    super(key);
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Hintergrund erstellen
    this.createBackground(width, height);

    // 2. Ladebalken-UI erstellen
    this.createLoadingUI(width, height);

    // 3. Event-Listener für den Ladefortschritt
    const space = 7;
    const barWidth = 320;
    const barHeight = 50; // Im DeckEditor war es 40, aber 50 passt besser zum Text
    const x = width / 2 - barWidth / 2;
    const y = height / 2 - barHeight / 2;

    this.load.on("progress", (value: number) => {
      this.percentText.setText(parseInt((value * 100).toString()) + "%");
      this.progressBar.clear();
      this.progressBar.fillStyle(0xf4f6e1, 1); // DeckEditor Farbe
      this.progressBar.fillRect(
        x + space, 
        y + space, 
        (barWidth - 2 * space) * value, 
        barHeight - 2 * space
      );
    });

    this.load.on("fileprogress", (file: any) => {
      this.assetText.setText("Loading asset: " + file.key);
    });

    this.load.on("complete", () => {
      this.progressBar.destroy();
      this.progressBox.destroy();
      this.loadingText.destroy();
      this.percentText.destroy();
      this.assetText.destroy();
      this.onLoadComplete();
    });

    // 4. Die eigentlichen Assets laden (von der Kindklasse implementiert)
    this.loadAssets();
  }

  private createLoadingUI(width: number, height: number) {
    const barWidth = 320;
    const barHeight = 50; // DeckEditor: 40, hier leicht angepasst für Lesbarkeit
    const x = width / 2 - barWidth / 2;
    const y = height / 2 - barHeight / 2;

    // Box für den Balken
    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0xeba244, 0.7); // DeckEditor Farbe
    this.progressBox.fillRoundedRect(x, y, barWidth, barHeight, 5);

    // Der Balken selbst
    this.progressBar = this.add.graphics();

    // Text: "Loading..."
    this.loadingText = this.add.text(width / 2, y - 50, "Loading...", {
      font: "20px monospace",
      color: "#e5ab48", // DeckEditor Farbe
    });
    this.loadingText.setStroke('#382d55', 16);
    this.loadingText.setShadow(2, 2, "#111111", 2, true, true);
    this.loadingText.setOrigin(0.5, 1);

    // Text: Prozent
    // Im DeckEditor ist der Prozenttext MITTIG im Balken (y + barHeight/2 ist nicht ganz mittig bei Text-Origin 0.5)
    // Wir nutzen die exakte Mitte des Balkens.
    this.percentText = this.add.text(width / 2, height / 2, "0%", {
      font: "18px monospace",
      color: "#1b2d55", // DeckEditor Farbe
    });
    this.percentText.setOrigin(0.5, 0.5);

    // Text: Aktuelles Asset
    // Im DeckEditor: y + 50 (relativ zur Mitte)
    this.assetText = this.add.text(width / 2, height / 2 + 50, "", {
      font: "18px monospace",
      color: "#e5ab48", // DeckEditor Farbe
    });
    this.assetText.setOrigin(0.5, 0);
  }

  protected createBackground(width: number, height: number) {
    // Standard: Dunkelgrauer Hintergrund
    this.add.rectangle(0, 0, width, height, 0x111111).setOrigin(0);
  }

  // Diese Methoden müssen von der Kindklasse implementiert werden
  protected abstract loadAssets(): void;
  protected abstract onLoadComplete(): void;
}
