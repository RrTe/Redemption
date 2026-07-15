import Phaser from "phaser";
import { CardUI } from "../CardUI.js";
import { SettingsManager } from "../../managers/SettingsManager.js";
import { ALIGNMENTS, CARD_TYPES } from "../../../../shared/card-constants.js";
import { FortressImpactEffect } from "./FortressImpactEffect.js";
import { GoodDominantPlayEffect } from "./GoodDominantPlayEffect.js";
import { EvilDominantPlayEffect } from "./EvilDominantPlayEffect.js";
import { StandardPlayEffect } from "./StandardPlayEffect.js";
import { SymbolZoomEffect } from "./SymbolZoomEffect.js";
import type { IPlayEffect } from "./IPlayEffect.js";
import { log, DEBUG } from "../../utils/logger";


export class CardPlayEffect {
  private scene: Phaser.Scene;
  private settingsManager: SettingsManager;

  // --- Die verschiedenen Animations-Strategien ---
  private standardEffect: StandardPlayEffect;
  private goodDominantEffect: GoodDominantPlayEffect;
  private evilDominantEffect: EvilDominantPlayEffect;
  private fortressImpactEffect: FortressImpactEffect;
  private symbolZoomEffect: SymbolZoomEffect;

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;

    // Instanziiere alle bekannten Effekt-Handler
    this.standardEffect = new StandardPlayEffect(scene);
    this.goodDominantEffect = new GoodDominantPlayEffect(scene);
    this.evilDominantEffect = new EvilDominantPlayEffect(scene);
    this.fortressImpactEffect = new FortressImpactEffect(scene);
    this.symbolZoomEffect = new SymbolZoomEffect(scene);
  }

  /**
   * Wählt den primären Animationseffekt basierend auf dem Kartentyp aus.
   * Jeder Effekt ist für seinen eigenen Sound verantwortlich.
   */
  private getPrimaryEffect(card: CardUI): IPlayEffect {
    const Type = card.cardData.inGameType || card.cardData.Type;
    const Alignment = card.cardData.inGameAlignment || card.cardData.Alignment;

    if (Type === CARD_TYPES.DOMINANT && Alignment === ALIGNMENTS.GOOD) {
      return this.goodDominantEffect;
    }

    if (Type === CARD_TYPES.DOMINANT && Alignment === ALIGNMENTS.EVIL) {
      return this.evilDominantEffect;
    }

    // Standard-Effekt für alle anderen Karten
    return this.standardEffect;
  }

  /**
   * Sammelt zusätzliche Effekte, die nach der primären Animation abgespielt werden sollen.
   */
  private getSecondaryEffects(card: CardUI): { play: Function }[] {
    const Type = card.cardData.inGameType || card.cardData.Type;
    const effects: { play: Function }[] = [];

    if (Type === CARD_TYPES.FORTRESS || Type === CARD_TYPES.SITE) {
      effects.push(this.fortressImpactEffect);
    }

    // Symbol-Zoom für Heroes, ECs, Artifacts und Enhancements
    if (
      Type === CARD_TYPES.HERO ||
      Type === CARD_TYPES.EC ||
      Type === CARD_TYPES.ARTIFACT ||
      Type === CARD_TYPES.GE ||
      Type === CARD_TYPES.EE
    ) {
      effects.push(this.symbolZoomEffect);
    }

    return effects;
  }

  public play(
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
  ): Phaser.Tweens.Tween | null {
    log(
      "CardPlayEffect", `[PLAY_ANIM] Triggered for card ${cardToAnimate.cardData.id.slice(-4)}`,
    );

    // 1. Wähle die passende Animations-Strategie
    const primaryEffect = this.getPrimaryEffect(cardToAnimate);
    const secondaryEffects = this.getSecondaryEffects(cardToAnimate);

    if (!this.settingsManager.areAnimationsEnabled()) {
      // ✨ REFACTORING: Nutze die Audio-Logik der Effekte (keine Dopplung mehr!)
      primaryEffect.playAudio(cardToAnimate);

      // Auch Sekundär-Sounds (Fortress Impact) abspielen
      const { Type } = cardToAnimate.cardData;
      if (Type === CARD_TYPES.FORTRESS || Type === CARD_TYPES.SITE) {
        this.fortressImpactEffect.playAudio(cardToAnimate);
      }

      // Instant Move (Visuelle Animation überspringen)
      cardToAnimate.x = endPos.x;
      cardToAnimate.y = endPos.y;
      cardToAnimate.setAngle(endPos.angle);
      cardToAnimate.updateSize(endPos.width, endPos.height);

      cardToAnimate.setLockedVisibility(false);
      // ✨ FIX: Stelle sicher, dass der onComplete-Callback auch hier aufgerufen wird.
      onComplete();
      return null;
    }

    // 2. Erstelle einen neuen onComplete-Callback, der die sekundären Effekte auslöst.
    const finalOnComplete = () => {
      // Spiele alle sekundären Effekte ab (z.B. Fortress-Impact)
      secondaryEffects.forEach((effect) => effect.play(cardToAnimate));
      // Rufe den ursprünglichen onComplete-Callback auf (vom AnimationManager)
      onComplete();
    };

    // 3. Führe den primären Effekt aus.
    // Dieser ist für seinen eigenen Sound und die Hauptanimation verantwortlich.
    return primaryEffect.play(cardToAnimate, startPos, endPos, finalOnComplete);
  }
}
