import Phaser from "phaser";
import { type TypedRoom } from "./gameUI";
import { ZONES, type Zone } from "../../../shared/zones";

const INITIAL_POOL_SIZE = 15; // Startgröße des Pools für die Grafiken
const CARDS_PER_IMAGE = 5; // ✨ DEIN WUNSCH: Zeige eine neue Grafik für je 5 Karten
const STACK_OFFSET_Y = 2; // Pixel-Versatz pro Grafik

const SHADOW_CONFIG = {
  OFFSET: 5,
  PADDING: 5,
  SLICE: 5,
  ALPHA: 0.4,
};

/**
 * ✨ NEU: Visuelle Darstellung eines verdeckten Kartenstapels (Deck, Reserve).
 * Zeigt eine variable Anzahl an versetzten Grafiken, um die Stapelhöhe anzudeuten.
 */
export class StackedPileUI extends Phaser.GameObjects.Container {
  private countText: Phaser.GameObjects.Text;
  private cardCount: number = 0;
  private stackImages: Phaser.GameObjects.Image[] = [];
  private emptyPileImage: Phaser.GameObjects.Image;
  private isOpponent: boolean;
  private shadow: Phaser.GameObjects.NineSlice; // ✨ NEU
  private bottomGlowGraphics: Phaser.GameObjects.Graphics; // ✨ NEU: Für den Leucht-Effekt
  private glowTween: Phaser.Tweens.Tween | null = null; // ✨ NEU: Animationstween

  public zoneName: Zone;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    zoneName: Zone,
    width: number,
    height: number,
    room: TypedRoom,
    isOpponent: boolean = false,
  ) {
    super(scene, x, y);
    this.zoneName = zoneName;
    this.isOpponent = isOpponent;
    this.setSize(width, height);
    scene.add.existing(this);

    // ✨ NEU: Schatten (ganz unten im Container)
    // Wir nutzen jetzt die zentrale SHADOW_CONFIG
    this.shadow = scene.add.nineslice(
      SHADOW_CONFIG.OFFSET,
      SHADOW_CONFIG.OFFSET,
      "drop_shadow",
      undefined,
      width + SHADOW_CONFIG.PADDING,
      height + SHADOW_CONFIG.PADDING,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
    );
    this.shadow.setAlpha(SHADOW_CONFIG.ALPHA);
    this.shadow.setTint(0x000000);
    this.shadow.setOrigin(0.5);
    this.add(this.shadow);

    // ✨ DEIN WUNSCH: Wähle die korrekte Grafik basierend darauf, ob es ein Gegner-Stapel ist.
    const emptyPileKey = isOpponent ? "pile_empty_opponent" : "pile_empty";
    // 1. Basis-Grafik für einen leeren Stapel
    this.emptyPileImage = scene.add
      .image(0, 0, emptyPileKey)
      .setDisplaySize(width, height)
      .setOrigin(0.5);
    // ✨ NEU: Drehe die Grafik für den Gegner um 180 Grad.
    if (isOpponent) {
      this.emptyPileImage.setAngle(180);
    }
    this.add(this.emptyPileImage);

    // ✨ NEU: Grafik für den unteren Rand-Effekt (initial unsichtbar)
    this.bottomGlowGraphics = scene.add.graphics();
    this.bottomGlowGraphics.setVisible(false);
    this.add(this.bottomGlowGraphics);

    // 2. Pool an Grafiken für den Stapel-Effekt erstellen
    for (let i = 0; i < INITIAL_POOL_SIZE; i++) {
      const cardBack = scene.add
        .image(0, 0, "card-back")
        .setDisplaySize(width, height)
        .setOrigin(0.5)
        .setVisible(false);
      // ✨ NEU: Drehe die Kartenrückseite für den Gegner um 180 Grad.
      if (isOpponent) {
        cardBack.setAngle(180);
      }
      this.add(cardBack);
      this.stackImages.push(cardBack);
    }

    // 3. Text für die Kartenanzahl
    this.countText = scene.add
      .text(0, 0, "0", {
        fontSize: `${Math.round(height * 0.3)}px`,
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add(this.countText);

    // 4. Interaktivität
    // ✨ KORREKTUR: Nutze das korrekte Muster, um einen Container zu einer DropZone zu machen.
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    if (this.input) {
      this.input.cursor = "pointer";
      this.input.dropZone = true;
    }

    this.name = zoneName;

    // Klick-Handler für das Kartenziehen vom Deck
    this.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      // ✨ FIX: Ignoriere Events, wenn die Maus bewegt wurde (Drag & Drop Operation).
      // Dies verhindert, dass beim Droppen einer Karte auf das Deck versehentlich eine Karte gezogen wird.
      if (pointer.getDistance() > 20) return;

      // ✨ FIX: Verhindere Ziehen vom Gegner-Deck per Linksklick.
      if (
        zoneName === ZONES.DECK &&
        !this.isOpponent &&
        pointer.leftButtonReleased()
      ) {
        room?.send("moveCard", { from: ZONES.DECK, to: ZONES.HAND, index: 0 });
      }
    });
  }

  /**
   * ✨ NEU: Zeigt oder versteckt die leuchtende Linie am unteren Rand.
   * Erzeugt einen "Scanner"-Effekt mit einem laufenden dunklen Abschnitt.
   */
  public showBottomHighlight(show: boolean) {
    if (show) {
      if (this.glowTween && this.glowTween.isPlaying()) return; // Läuft schon

      this.bottomGlowGraphics.setVisible(true);

      // Starte den Loop-Tween für den Animationseffekt
      this.glowTween = this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1200, // Geschwindigkeit des "Lauflichts"
        repeat: -1,
        onUpdate: (tween) => {
          this.drawBottomGlow(tween.getValue() ?? 0);
        },
      });
    } else {
      if (this.glowTween) {
        this.glowTween.stop();
        this.glowTween = null;
      }
      this.bottomGlowGraphics.setVisible(false);
    }
  }

  /** ✨ NEU: Zeichnet die Linie mit dem wandernden dunklen Fleck. */
  private drawBottomGlow(progress: number) {
    const g = this.bottomGlowGraphics;
    g.clear();

    const w = this.width;
    const h = this.height;
    const y = h / 2; // Unterer Rand (relativ zur Mitte)
    const left = -w / 2;
    const right = w / 2;

    // 1. Basis-Leuchten (Breiter, weicher, helles Gold)
    g.lineStyle(6, 0xffd700, 0.4);
    g.lineBetween(left, y, right, y);

    // 2. Haupt-Linie (Scharf, helles Gold)
    g.lineStyle(3, 0xffd700, 1.0);
    g.lineBetween(left, y, right, y);

    // 3. Der "laufende" dunkle Abschnitt (Scanner-Effekt)
    // Wir zeichnen eine dunklere Linie über die helle an der aktuellen Position.
    const spotWidth = w * 0.25; // 25% der Breite
    const spotCenter = left + w * progress; // Bewegt sich von links nach rechts

    const spotStart = Math.max(left, spotCenter - spotWidth / 2);
    const spotEnd = Math.min(right, spotCenter + spotWidth / 2);

    if (spotEnd > spotStart) {
      g.lineStyle(3, 0xb8860b, 1.0); // DarkGoldenRod (Dunkles Gold/Braun)
      g.lineBetween(spotStart, y, spotEnd, y);
    }
  }

  public updateCount(newCount: number) {
    this.cardCount = newCount;
    this.countText.setText(String(this.cardCount));

    if (this.cardCount === 0) {
      this.emptyPileImage.setVisible(true);
      this.stackImages.forEach((img) => img.setVisible(false));
      this.countText.setVisible(false);
    } else {
      this.emptyPileImage.setVisible(false);
      this.countText.setVisible(true);

      const numVisibleImages = Math.ceil(this.cardCount / CARDS_PER_IMAGE);

      // ✨ DEIN WUNSCH: Zentriere die Zahl auf der obersten Karte des Stapels.
      // Wir berechnen die Y-Position der obersten Karte und weisen sie dem Text zu.
      const topImageIndex = Math.max(0, numVisibleImages - 1);
      this.countText.y =
        (this.isOpponent ? 1 : -1) * topImageIndex * STACK_OFFSET_Y;

      // Stelle sicher, dass der Pool groß genug ist
      while (this.stackImages.length < numVisibleImages) {
        const cardBack = this.scene.add
          .image(0, 0, "card-back")
          .setDisplaySize(this.width, this.height)
          .setOrigin(0.5)
          .setVisible(false);
        this.addAt(cardBack, 1); // Füge nach dem leeren Bild ein, um Z-Index zu erhalten
        this.stackImages.push(cardBack);
      }

      // Passe die Anzahl der sichtbaren Bilder dynamisch an
      this.stackImages.forEach((img, i) => {
        if (i < numVisibleImages) {
          img.setVisible(true);
          img.y = (this.isOpponent ? 1 : -1) * i * STACK_OFFSET_Y;
        } else {
          img.setVisible(false);
        }
      });
    }
  }

  public updateSize(width: number, height: number) {
    if (!this.scene || !this.active) return; // ✨ FIX: Sicherheitscheck gegen Abstürze bei zerstörten Objekten

    this.setSize(width, height);
    this.emptyPileImage.setDisplaySize(width, height);
    if (this.shadow)
      this.shadow.setSize(
        width + SHADOW_CONFIG.PADDING,
        height + SHADOW_CONFIG.PADDING,
      ); // ✨ FIX: Konsistente Größe
    this.stackImages.forEach((img) => img.setDisplaySize(width, height));
    this.countText.setFontSize(Math.round(height * 0.3));

    (this.input?.hitArea as Phaser.Geom.Rectangle)?.setSize(width, height);
  }
}
