import Phaser from "phaser";
import { CardUI } from "../CardUI.js";

/**
 * Definiert eine einheitliche Schnittstelle für alle "Ausspiel"-Animationseffekte.
 * Jede Klasse, die diesen Vertrag implementiert, kann vom CardPlayEffect-Dirigenten
 * als primärer Animationseffekt verwendet werden.
 */
export interface IPlayEffect {
  /**
   * Spielt nur den Sound dieses Effekts ab.
   */
  playAudio(card: CardUI): void;

  play(
    cardToAnimate: CardUI,
    startPos: {
      x: number;
      y: number;
      angle: number;
      width: number;
      height: number;
    },
    endPos: {
      x: number;
      y: number;
      angle: number;
      width: number;
      height: number;
    },
    onComplete: () => void,
    onCancel?: (cancelFn: () => void) => void,
  ): Phaser.Tweens.Tween | null;
}
