import Phaser from "phaser";
import { ZONES, type Zone } from "../../../shared/zones";
import { type TypedRoom } from "./gameUI";
import { type NetworkManager } from "../network/NetworkManager"; // ✨ NEU
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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    zoneName: Zone, // Typ auf Zone geändert für mehr Sicherheit
    width: number,
    height: number,
    // ✨ NEU: Raum-Referenz für Nachrichtenversand
    room?: TypedRoom,
    networkManager?: NetworkManager, // ✨ NEU
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

    // Karten-Zähler
    this.countText = scene.add
      .text(0, 10, "0", {
        fontSize: "48px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);
    this.add(this.countText);

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
    this.countText.setText(String(newCount));
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
    this.nameText.setFontSize(fontSize); // ✨ KORREKTUR: Fehlendes Semikolon war hier, entfernt.
    this.countText.setFontSize(fontSize * 2); // ✨ KORREKTUR: Fehlendes Semikolon war hier, entfernt.

    // ✨ ENTSCHEIDENDE KORREKTUR: Aktualisiere die Größe der interaktiven "Hit Area".
    // Ohne dies behält der Klickbereich seine ursprüngliche Größe und überlappt andere Elemente.
    if (this.input) {
      this.input.hitArea.setSize(width, height); // ✨ KORREKTUR: Fehlendes Semikolon war hier, entfernt.
    }
  }
}
