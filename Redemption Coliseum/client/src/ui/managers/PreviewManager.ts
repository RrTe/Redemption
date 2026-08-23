import Phaser from "phaser";
import { CardUI } from "../CardUI";

/**
 * Verwaltet die vergrößerte Kartenvorschau (Preview), die erscheint,
 * wenn man mit der Maus über eine Karte fährt.
 */
export class PreviewManager {
  private scene: Phaser.Scene;
  private previewImage: Phaser.GameObjects.Image | null = null;
  private readonly PREVIEW_DEPTH = 3000; // Höher als alles andere (Effekte sind ~2000)
  private showTimer: number | null = null; // Timer für die verzögerte Anzeige
  private readonly SHOW_DELAY = 450; // 350ms Verzögerung für ruhigeres Verhalten

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Erstellt das Preview-Bild einmalig.
   */
  private createPreviewImage() {
    // Die X-Position wird dynamisch in `show()` berechnet.
    const y = this.scene.scale.height / 2; // Vertikal zentriert

    this.previewImage = this.scene.add.image(0, y, "card-back");
    this.previewImage.setOrigin(0.5);
    this.previewImage.setDepth(this.PREVIEW_DEPTH);
    this.previewImage.setVisible(false);
    this.previewImage.setScrollFactor(0); // Bleibt fix, falls sich die Kamera bewegt
    // Mache das Bild interaktiv, damit es Klicks "abfängt" und nicht durchlässt.
    this.previewImage.setInteractive();

    // ✨ Mobile: Schließe das Preview, wenn man direkt darauf tippt
    this.previewImage.on("pointerdown", () => {
      this.hide();
    });
  }

  /**
   * Zeigt die Vorschau für eine bestimmte Karte an.
   * @param card Die anzuzeigende Karte.
   * @param currentSessionId Die ID des aktuellen Spielers.
   */
  public show(card: CardUI, currentSessionId: string) {
    // Breche einen laufenden Timer ab, falls die Maus schnell über Karten bewegt wird.
    if (this.showTimer) {
      clearTimeout(this.showTimer);
    }

    // Starte einen neuen Timer, um die Vorschau mit Verzögerung anzuzeigen.
    this.showTimer = window.setTimeout(() => {
      const isControlledByMe = card.cardData.controllerId === currentSessionId;

      // Zeige eine Vorschau nur, wenn die Karte offen liegt ODER ich sie kontrolliere.
      // Verdeckte Karten des Gegners zeigen gar nichts an.
      const shouldShowPreview = !card.isCurrentlyFaceDown() || isControlledByMe;

      if (!shouldShowPreview) {
        // Falls noch ein altes Bild sichtbar ist, verstecke es sicherheitshalber.
        if (this.previewImage && this.previewImage.visible) {
          this.previewImage.setVisible(false);
        }
        return;
      }

      if (!this.previewImage) {
        this.createPreviewImage();
      }

      if (!this.previewImage) return;

      // Textur bestimmen: Wir zeigen immer die Vorderseite, da wir oben
      // bereits gefiltert haben (wir dürfen die Karte sehen).
      let textureKey = "card-back";
      if (card.cardData.ImageFile) {
        const key = "card-" + card.cardData.ImageFile;
        if (this.scene.textures.exists(key)) {
          textureKey = key;
        }
      }

      this.previewImage.setTexture(textureKey);

      // Größe anpassen (Desktop 60%, Mobile / Low-Height 92% der Bildschirmhöhe)
      const isLowHeight = this.scene.scale.height < 600;
      const targetHeight = this.scene.scale.height * (isLowHeight ? 0.92 : 0.6);
      this.previewImage.displayHeight = targetHeight;
      this.previewImage.scaleX = this.previewImage.scaleY; // Seitenverhältnis beibehalten

      // ✨ NEU: Dynamische Positionierung neben der Karte (Hearthstone-Style)
      // ✨ FIX: Wir berechnen die Grenzen manuell basierend auf card.x/y und width/height.
      // card.getBounds() ist unzuverlässig, da der Partikel-Emitter die BoundingBox des Containers verfälschen kann.

      // ✨ FIX: Weltkoordinaten verwenden, damit es auch in Containern (z.B. SelectionDialog) funktioniert.
      const matrix = card.getWorldTransformMatrix();
      const globalX = matrix.tx;
      const globalY = matrix.ty;

      const cardHalfWidth = (card.width * card.scaleX) / 2;
      const cardRight = globalX + cardHalfWidth;
      const cardLeft = globalX - cardHalfWidth;

      const screenWidth = this.scene.scale.width;
      const screenHeight = this.scene.scale.height;
      const previewWidth = this.previewImage.displayWidth;
      const previewHeight = this.previewImage.displayHeight;
      const padding = isLowHeight ? 10 : 20;

      // ✨ FIX: Zurück zur Logik basierend auf der Bildschirmhälfte. Das ist stabiler.
      // Horizontal: Wenn Karte links ist -> Vorschau rechts, sonst links
      if (globalX < screenWidth / 2) {
        this.previewImage.x = cardRight + padding + previewWidth / 2;
      } else {
        this.previewImage.x = cardLeft - padding - previewWidth / 2;
      }

      // Vertikal: Zentriert zur Karte, aber im Bildschirm halten (Clamping)
      let targetY = globalY;
      const halfHeight = previewHeight / 2;

      // Nicht oben rausschieben
      if (targetY - halfHeight < padding) targetY = halfHeight + padding;
      // Nicht unten rausschieben
      if (targetY + halfHeight > screenHeight - padding)
        targetY = screenHeight - halfHeight - padding;

      this.previewImage.y = targetY;

      // ✨ FIX: Horizontal auch im Bildschirm halten (Clamping), falls die Karte sehr weit am Rand ist.
      const halfWidth = previewWidth / 2;
      if (this.previewImage.x - halfWidth < padding)
        this.previewImage.x = halfWidth + padding;
      if (this.previewImage.x + halfWidth > screenWidth - padding)
        this.previewImage.x = screenWidth - halfWidth - padding;

      // Sichtbar machen mit Fade-In
      this.previewImage.setVisible(true);
      this.previewImage.setAlpha(0);

      this.scene.tweens.add({
        targets: this.previewImage,
        alpha: 1,
        duration: 100,
        ease: "Sine.easeOut",
      });
    }, this.SHOW_DELAY);
  }

  /**
   * ✨ NEU: Zeigt die Vorschau basierend auf Rohdaten an (z.B. aus dem Chat).
   */
  public showFromData(cardData: any, sourceRightX: number, sourceY: number) {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
    }

    this.showTimer = window.setTimeout(() => {
      if (!this.previewImage) {
        this.createPreviewImage();
      }

      if (!this.previewImage) return;

      let textureKey = "card-back";
      if (cardData.ImageFile) {
        const key = "card-" + cardData.ImageFile;
        if (this.scene.textures.exists(key)) {
          textureKey = key;
        }
      }

      this.previewImage.setTexture(textureKey);

      const isLowHeight = this.scene.scale.height < 600;
      const targetHeight = this.scene.scale.height * (isLowHeight ? 0.92 : 0.6);
      this.previewImage.displayHeight = targetHeight;
      this.previewImage.scaleX = this.previewImage.scaleY;

      const padding = isLowHeight ? 10 : 20;
      const previewWidth = this.previewImage.displayWidth;
      
      this.previewImage.x = sourceRightX + padding + previewWidth / 2;
      this.previewImage.y = sourceY;

      const screenHeight = this.scene.scale.height;
      const halfHeight = this.previewImage.displayHeight / 2;

      if (this.previewImage.y - halfHeight < padding) this.previewImage.y = halfHeight + padding;
      if (this.previewImage.y + halfHeight > screenHeight - padding)
        this.previewImage.y = screenHeight - halfHeight - padding;

      this.previewImage.setVisible(true);
      this.previewImage.setAlpha(0);

      this.scene.tweens.add({
        targets: this.previewImage,
        alpha: 1,
        duration: 100,
        ease: "Sine.easeOut",
      });
    }, this.SHOW_DELAY);
  }

  /**
   * Versteckt die Vorschau.
   */
  public hide() {
    // Breche einen laufenden Timer zum Anzeigen ab.
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    // Verstecke das Bild, falls es bereits sichtbar ist.
    if (this.previewImage && this.previewImage.visible) {
      this.previewImage.setVisible(false);
    }
  }
}
