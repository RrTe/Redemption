import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import { CARD_TYPES } from "../../../../shared/card-constants.js";

/**
 * Konfiguration für den Zoom-Effekt pro Kartentyp.
 */
interface SymbolConfig {
  texture: string;
  targetScale: number;
  startScale?: number; // Optional, falls nicht 1.0
}

/**
 * Spielt eine Animation ab, bei der ein Symbol aus der Karte herauszoomt und verblasst.
 * Wird als Sekundäreffekt verwendet, nachdem die Karte platziert wurde.
 */
export class SymbolZoomEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Ermittelt die Konfiguration basierend auf dem Kartentyp.
   */
  private getConfig(cardType: string): SymbolConfig | null {
    switch (cardType) {
      case CARD_TYPES.HERO:
        return { texture: "icon_cross", targetScale: 2.0 };
      case CARD_TYPES.GE:
        return { texture: "icon_bible", targetScale: 3.0 };
      case CARD_TYPES.EE:
        return { texture: "icon_skull", targetScale: 1.0, startScale: 0.5 };
      case CARD_TYPES.EC: // Evil Character
        return { texture: "icon_dragon", targetScale: 1.0, startScale: 0.5 };
      case CARD_TYPES.ARTIFACT:
        return { texture: "icon_artifact", targetScale: 2.0 };
      default:
        return null;
    }
  }

  public play(card: CardUI) {
    const config = this.getConfig(card.cardData.Type);
    if (!config) return;

    // Position der Karte (Mittelpunkt)
    const x = card.x;
    const y = card.y;

    // Symbol erstellen
    const symbol = this.scene.add.image(x, y, config.texture).setOrigin(0.5);

    // Startwerte setzen
    const startScale = config.startScale ?? 1.0;
    symbol.setScale(startScale);
    symbol.setAlpha(0); // Startet unsichtbar und wird im Tween eingeblendet
    symbol.setDepth(card.depth + 10); // Über der Karte

    // Tween starten (Logik aus PoCs)
    this.scene.tweens.add({
      targets: symbol,
      y: y - 100, // Bewegt sich nach oben
      scale: config.targetScale,
      alpha: 0, // Fadet aus (Zielwert)
      duration: 2200,
      ease: "Cubic.easeOut",
      onStart: () => {
        // Sofort sichtbar machen beim Start der Animation.
        // Der Tween fadet dann von 1 (implizit gesetzt durch setAlpha(1)) zu 0.
        symbol.setAlpha(1);
      },
      onComplete: () => {
        symbol.destroy();
      },
    });
  }
}
