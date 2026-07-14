import Phaser from "phaser";
import { ZONES, type Zone } from "../../../shared/zones";
import { type TypedRoom } from "./gameUI";
import { type GameNetworkManager } from "../network/GameNetworkManager"; // ✨ NEU
import { DEBUG } from "../utils/logger";

const SHADOW_CONFIG = {
  OFFSET: 5,
  PADDING: 5,
  SLICE: 5,
  ALPHA: 0.4,
};

export class PileUI extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private countText: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.NineSlice; // ✨ NEU
  private placeholderImage: Phaser.GameObjects.Image | null = null; // ✨ NEU
  private badgeBg: Phaser.GameObjects.Graphics; // ✨ NEU: Badge Hintergrund
  private badgeContainer: Phaser.GameObjects.Container; // ✨ NEU: Container auf Szenen-Ebene für den Z-Index
  private cardCount: number = 0;

  // ✨ HIER KANNST DU DIE SCHRIFTGRÖSSE FÜR DEN HANDY-ZÄHLER ANPASSEN
  private getCountFontSize(width: number, height: number): number {
    const baseFontSize = Math.max(12, Math.round(width * 0.15));
    let countFontSize = baseFontSize * 2;
    // Wenn die Höhe sehr klein ist (Handy), wende diese spezielle Formel an:
    if (height < 100) countFontSize = Math.max(14, Math.round(height * 0.1));
    return countFontSize;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    zoneName: Zone, // Typ auf Zone geändert für mehr Sicherheit
    width: number,
    height: number,
    // ✨ NEU: Raum-Referenz für Nachrichtenversand
    room?: TypedRoom,
    networkManager?: GameNetworkManager, // ✨ NEU
    isOpponent: boolean = false, // ✨ NEU: Flag für Gegner-Darstellung
  ) {
    super(scene, x, y);
    this.name = zoneName;
    this.setSize(width, height);

    // ✨ NEU: Schatten
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

    // ✨ NEU: Platzhalter-Grafik basierend auf Zone
    let textureKey = "";
    if (zoneName === ZONES.DISCARD) textureKey = "pile_discard";
    else if (zoneName === ZONES.BANISH) textureKey = "pile_banish";
    else if (zoneName === ZONES.LAND_OF_REDEMPTION) textureKey = "pile_lor";

    if (textureKey) {
      this.placeholderImage = scene.add.image(0, 0, textureKey);
      this.placeholderImage.setDisplaySize(width, height);
      this.placeholderImage.setOrigin(0.5);
      if (isOpponent) {
        this.placeholderImage.setAngle(180); // Auf den Kopf stellen
        this.placeholderImage.setAlpha(0.6); // Etwas blasser
      }
      this.add(this.placeholderImage);
    }

    // Hintergrund und Drop-Zone
    this.background = scene.add.rectangle(0, 0, width, height, 0x000000, 0.2);
    this.background.setStrokeStyle(2, 0xaaaaaa, 0.5);
    this.add(this.background);

    // Zonen-Name
    this.nameText = scene.add
      .text(0, -height / 2 + 20, zoneName.toUpperCase(), {
        fontSize: "16px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);
    this.nameText.setVisible(DEBUG); // ✨ FIX: Namen nur im Debug-Modus anzeigen (stören sonst die Optik)
    this.add(this.nameText);

    // ✨ FIX: Badge-Container auf Szene-Ebene erstellen, damit er über den Karten liegt
    this.badgeContainer = scene.add.container(x, y);
    this.badgeContainer.setDepth(100); // Weit über den Karten (Z-Index)

    // Karten-Zähler Badge
    this.badgeBg = scene.add.graphics();
    this.badgeContainer.add(this.badgeBg);

    // Karten-Zähler
    const initialFontSize = this.getCountFontSize(width, height);
    this.countText = scene.add
      .text(0, 0, "0", {
        fontSize: `${initialFontSize}px`,
        color: "#ffffff",
        align: "center",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6, // Wird in updateSize dynamisch angepasst
      })
      .setOrigin(0.5);
    this.badgeContainer.add(this.countText);

    // Initial verstecken, da wir mit 0 starten
    this.countText.setVisible(false);
    this.badgeBg.setVisible(false);

    // Cleanup bei Zerstörung des Piles
    this.on('destroy', () => {
      this.badgeContainer.destroy();
    });

    // ✨ FINALE KORREKTUR: Mache JEDEN Stapel von Anfang an interaktiv.
    // 1. Definiere eine klickbare Fläche (Hit Area), die der Größe des Stapels entspricht.
    //    Ohne dies empfängt der Container keine Klick-Events.
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    // 2. Setze den Cursor und mache das Objekt zu einer Drop-Zone.
    if (this.input) {
      this.input.cursor = "pointer";
      this.input.dropZone = true;
    }

    this.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      // ✨ FIX: Ignoriere Events, wenn die Maus bewegt wurde (Drag & Drop Operation).
      if (pointer.getDistance() > 20) return;

      // Die Logik zum Kartenziehen wird weiterhin nur für das Deck bei einem Linksklick ausgeführt.
      // ✨ FIX: Verhindere Ziehen vom Gegner-Deck per Linksklick.
      if (
        zoneName === ZONES.DECK &&
        !isOpponent &&
        pointer.leftButtonReleased()
      ) {
        networkManager?.sendMoveCard({
          from: ZONES.DECK,
          to: ZONES.HAND,
          index: 0,
        });
      }
    });

    scene.add.existing(this);
  }

  public updateCount(newCount: number) {
    this.cardCount = newCount;
    this.countText.setText(String(newCount));

    if (this.cardCount === 0) {
      this.countText.setVisible(false);
      this.badgeBg.setVisible(false);
    } else {
      this.countText.setVisible(true);
      this.badgeBg.setVisible(true);
      this.drawBadge();
    }
  }

  private drawBadge() {
    this.badgeBg.clear();
    // Ein dezenter Kreis, der sich an der Textgröße orientiert
    // ✨ FIX: Auf dem Handy (height < 100) kein zusätzliches Padding, damit es eleganter/enger anliegt
    const padding = this.height < 100 ? 0 : 4;
    const radius = Math.max(this.countText.width, this.countText.height) / 2 + padding;

    this.badgeBg.fillStyle(0x000000, 0.6);
    this.badgeBg.fillCircle(this.countText.x, this.countText.y, radius);

    this.badgeBg.lineStyle(2, 0xffffff, 0.6);
    this.badgeBg.strokeCircle(this.countText.x, this.countText.y, radius);
  }

  // ✨ NEU: Überschreibe setPosition, damit der externe Badge-Container mitwandert
  public setPosition(x?: number, y?: number, z?: number, w?: number): this {
    super.setPosition(x, y, z, w);
    if (this.badgeContainer) {
      this.badgeContainer.setPosition(x, y);
    }
    return this;
  }

  // ✨ NEU: Methode zur Aktualisierung der Größe
  public updateSize(width: number, height: number) {
    if (!this.scene || !this.active) return; // ✨ FIX: Sicherheitscheck gegen Abstürze bei zerstörten Objekten

    this.setSize(width, height);
    this.background.setSize(width, height);
    this.placeholderImage?.setDisplaySize(width, height); // ✨ NEU: Bildgröße anpassen
    this.shadow.setSize(
      width + SHADOW_CONFIG.PADDING,
      height + SHADOW_CONFIG.PADDING,
    ); // ✨ FIX: Konsistente Größe
    this.nameText.setY(-height / 2 + 20);
    // Optional: Skaliere die Schriftgröße mit, um die Lesbarkeit zu erhalten
    const fontSize = Math.max(12, Math.min(16, width / 8));
    this.nameText.setFontSize(fontSize);

    // Zähler-Schriftgröße über die neue Hilfsmethode abrufen
    let countFontSize = this.getCountFontSize(width, height);

    // Dynamische Anpassungen für das Handy (height < 100)
    const isMobile = height < 100;
    const strokeT = isMobile ? 4 : 6;

    this.countText.setFontSize(countFontSize);
    this.countText.setStroke("#000000", strokeT);

    // ✨ FIX: Auf dem Handy machen wir die Schrift extra fett (Arial Black + 900 Weight)
    this.countText.setFontStyle(isMobile ? "900" : "bold");
    this.countText.setFontFamily(isMobile ? '"Arial Black", Impact, sans-serif' : 'sans-serif');

    if (this.cardCount > 0) {
      this.drawBadge();
    }

    // ✨ ENTSCHEIDENDE KORREKTUR: Aktualisiere die Größe der interaktiven "Hit Area".
    // Ohne dies behält der Klickbereich seine ursprüngliche Größe und überlappt andere Elemente.
    if (this.input) {
      this.input.hitArea.setSize(width, height); // ✨ KORREKTUR: Fehlendes Semikolon war hier, entfernt.
    }
  }
}
