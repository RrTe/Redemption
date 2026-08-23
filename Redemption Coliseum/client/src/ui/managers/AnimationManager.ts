import Phaser from "phaser";
import { CardUI } from "../CardUI";
import { SettingsManager } from "../../managers/SettingsManager";
import { CardDrawEffect } from "../effects/CardDrawEffect";
import { CardPlayEffect } from "../effects/CardPlayEffect";
import { CardHoverEffect } from "../effects/CardHoverEffect";

interface ActiveAnimationRecord {
  tween: Phaser.Tweens.Tween | null;
  cancel: () => void;
}

/**
 * Verwaltet visuelle Effekte und Animationen, die nicht direkt an den
 * Spielzustand gekoppelt sind, wie z.B. das Ziehen und Ausspielen von Karten.
 */
export class AnimationManager {
  private scene: Phaser.Scene;
  public pendingDrawAnimations = new Set<string>();
  public activeDrawTweens = new Map<string, Phaser.Tweens.Tween>();
  private activeAnimationRecords = new Map<string, ActiveAnimationRecord>();

  private cardDrawEffect: CardDrawEffect;
  private cardPlayEffect: CardPlayEffect;
  private cardHoverEffect: CardHoverEffect;

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.cardDrawEffect = new CardDrawEffect(scene, settingsManager);
    this.cardPlayEffect = new CardPlayEffect(scene, settingsManager);
    this.cardHoverEffect = new CardHoverEffect(scene, settingsManager);
  }

  /**
   * Spielt die Animation für eine gezogene Karte vom Deck zur Hand.
   */
  public playCardDrawAnimation(
    cardToAnimate: CardUI,
    startRect: Phaser.Geom.Rectangle,
    endPos: { x: number; y: number; angle: number },
    delay: number = 0,
  ) {
    const cardId = cardToAnimate.cardData.id;
    this.pendingDrawAnimations.delete(cardId);

    let cancelFn = () => {};

    const drawTween = this.cardDrawEffect.play(
      cardToAnimate,
      startRect,
      endPos,
      delay,
      () => {
        this.activeDrawTweens.delete(cardId);
        this.activeAnimationRecords.delete(cardId);
        if (this.activeDrawTweens.size === 0) {
          this.scene.events.emit("all-draw-animations-complete");
        }
      },
      (registeredCancel) => {
        cancelFn = registeredCancel;
      },
    );

    if (drawTween) {
      this.activeDrawTweens.set(cardId, drawTween);
      this.activeAnimationRecords.set(cardId, { tween: drawTween, cancel: cancelFn });
    }
  }

  /**
   * Spielt die Animation für das Ausspielen einer Karte von der Hand aufs Feld.
   */
  public playCardPlayAnimation(
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
  ) {
    const cardId = cardToAnimate.cardData.id;
    let cancelFn = () => {};

    const playTween = this.cardPlayEffect.play(
      cardToAnimate,
      startPos,
      endPos,
      () => {
        this.activeDrawTweens.delete(cardId);
        this.activeAnimationRecords.delete(cardId);
      },
      (registeredCancel) => {
        cancelFn = registeredCancel;
      },
    );

    if (playTween) {
      this.activeDrawTweens.set(cardId, playTween);
      this.activeAnimationRecords.set(cardId, { tween: playTween, cancel: cancelFn });
    }
  }

  /**
   * Stoppt sofort einen aktiven Tween (Draw/Play) für eine bestimmte Karte und zerstört Artefakte.
   */
  public stopActiveTween(cardId: string) {
    const record = this.activeAnimationRecords.get(cardId);
    if (record) {
      if (record.tween && record.tween.isPlaying()) {
        record.tween.stop();
      }
      try {
        record.cancel();
      } catch (err) {
        // Safe fallback
      }
      this.activeAnimationRecords.delete(cardId);
    }
    const tween = this.activeDrawTweens.get(cardId);
    if (tween) {
      if (tween.isPlaying()) {
        tween.stop();
      }
      this.activeDrawTweens.delete(cardId);
    }
  }

  // Delegated Hover & Pulse Methods
  public stopHandHoverAnimation(card: CardUI) {
    this.cardHoverEffect.stopHandHoverAnimation(card);
  }

  public playHandHoverAnimation(card: CardUI) {
    this.cardHoverEffect.playHandHoverAnimation(card);
  }

  public playHandHoverOutAnimation(card: CardUI) {
    this.cardHoverEffect.playHandHoverOutAnimation(card);
  }

  public playTerritoryHoverAnimation(card: CardUI) {
    this.cardHoverEffect.playTerritoryHoverAnimation(card);
  }

  public playTerritoryHoverOutAnimation(card: CardUI) {
    this.cardHoverEffect.playTerritoryHoverOutAnimation(card);
  }

  public startPulseAnimation(
    scene: Phaser.Scene,
    targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
    pulseAmplitude: number = 0.1,
    pulsePerSecond: number = 0.6,
  ): { stop: () => void } {
    return this.cardHoverEffect.startPulseAnimation(scene, targets, pulseAmplitude, pulsePerSecond);
  }
}
