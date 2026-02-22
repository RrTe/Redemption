import Phaser from "phaser";
import { CardUI } from "../ui/CardUI";
import { SettingsManager } from "../managers/SettingsManager";
import { CardDrawEffect } from "../ui/effects/CardDrawEffect";
import { CardPlayEffect } from "../ui/effects/CardPlayEffect";
import { CARD_TYPES } from "../../../shared/card-constants"; // ✨ NEU: Import für Kartentypen
import { log, DEBUG } from "../utils/logger";


/**
 * Verwaltet visuelle Effekte und Animationen, die nicht direkt an den
 * Spielzustand gekoppelt sind, wie z.B. das Ziehen von Karten.
 */
export class AnimationManager {
  private scene: Phaser.Scene;
  /** ✨ DEIN PLAN: Eine Vormerkliste für Karten, deren Zieh-Animation abgespielt werden soll. */
  public pendingDrawAnimations = new Set<string>();
  // ✨ FINALE LÖSUNG: Eine Map, um die laufenden Tween-Objekte für jede Karte zu speichern.
  public activeDrawTweens = new Map<string, Phaser.Tweens.Tween>();
  private settingsManager: SettingsManager;
  // ✨ REFACTORING: Effekt-Klassen werden einmalig instanziiert.
  private cardDrawEffect: CardDrawEffect;
  private cardPlayEffect: CardPlayEffect;

  constructor(scene: Phaser.Scene, settingsManager: SettingsManager) {
    this.scene = scene;
    this.settingsManager = settingsManager;
    // ✨ REFACTORING: Instanziiere die Effekt-Handler im Konstruktor.
    this.cardDrawEffect = new CardDrawEffect(scene, settingsManager);
    this.cardPlayEffect = new CardPlayEffect(scene, settingsManager);
  }

  /**
   * Spielt die Animation für eine gezogene Karte vom Deck zur Hand.
   * @param cardToAnimate Das ECHTE CardUI-Objekt, das animiert werden soll.
   * @param startRect Die Position des Decks.
   * @param endPos Die finale Position und der Winkel in der Hand.
   * @param delay (Optional) Verzögerung in ms, bevor die Animation startet.
   */
  public playCardDrawAnimation(
    cardToAnimate: CardUI,
    startRect: Phaser.Geom.Rectangle,
    endPos: { x: number; y: number; angle: number },
    delay: number = 0
  ) {
    // Die Karte wird aus der Vormerk-Liste entfernt, da die Animation jetzt startet.
    this.pendingDrawAnimations.delete(cardToAnimate.cardData.id);

    const drawTween = this.cardDrawEffect.play(
      cardToAnimate,
      startRect,
      endPos,
      delay,
      () => {
        this.activeDrawTweens.delete(cardToAnimate.cardData.id);
        if (this.activeDrawTweens.size === 0) {
          this.scene.events.emit("all-draw-animations-complete");
        }
      }
    );

    if (drawTween) {
      this.activeDrawTweens.set(cardToAnimate.cardData.id, drawTween);
    }
  }

  /**
   * Spielt die Animation für das Ausspielen einer Karte von der Hand aufs Feld.
   * Die Karte fliegt in einem Bogen und passt ihre Größe an.
   *
   * @param cardToAnimate Das ECHTE CardUI-Objekt.
   * @param startPos Die Startwerte (Position, Winkel, Größe).
   * @param endPos Die Zielwerte (Position, Winkel, Größe).
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
    }
  ) {
    // ✨ FIX: Sound entfernt. Die Effekt-Klassen (CardPlayEffect -> StandardPlayEffect etc.)
    // spielen den Sound jetzt selbst ab. Das verhindert doppelte Sounds.

    // ✨ REFACTORING: Nutze die neue Effekt-Klasse.
    const playTween = this.cardPlayEffect.play(
      cardToAnimate,
      startPos,
      endPos,
      () => {
        this.activeDrawTweens.delete(cardToAnimate.cardData.id);
      }
    );

    if (playTween) {
      this.activeDrawTweens.set(cardToAnimate.cardData.id, playTween);
    }
  }

  /**
   * Stoppt alle Hover-Animationen auf einer Karte und setzt sie auf den Normalzustand zurück.
   * Wichtig beim Ausspielen einer Karte, damit sie nicht "steckenbleibt".
   */
  public stopHandHoverAnimation(card: CardUI) {
    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
      card.setData("hoverTween", null);
    }

    // Setze Skalierung auf den gespeicherten Originalwert zurück, falls vorhanden
    const originalScaleX = card.getData("originalScaleX");
    if (originalScaleX !== undefined) {
      card.scaleX = originalScaleX;
      card.scaleY = card.getData("originalScaleY");
    }
  }

  /**
   * Spielt die Hover-Animation für eine Handkarte ab (Pop-Up).
   * Die Karte wird angehoben und vergrößert, behält aber ihren z-Index.
   */
  public playHandHoverAnimation(card: CardUI) {
    // ✨ NEU: Settings prüfen (nur visuell)
    if (!this.settingsManager.areAnimationsEnabled()) return;

    // Stoppe laufende Hover-Tweens
    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    // Speichere Originalwerte, falls noch nicht geschehen
    if (card.getData("originalScaleX") === undefined) {
      card.setData("originalScaleX", card.scaleX);
      card.setData("originalScaleY", card.scaleY);
    }

    // ✨ DEIN WUNSCH: Keine Änderung der Tiefe (z-Index), damit die Karte im Fächer bleibt.
    // Wir nutzen sanftere Parameter für die Animation.
    const hoverTween = this.scene.tweens.add({
      targets: card,
      y: card.targetY - 80, // Weniger Anhebung als vorher (war 120)
      angle: 0, // Gerade ausrichten
      scale: card.getData("originalScaleX") * 1.35, // Moderater Zoom
      duration: 350, // Langsamer für "sanfteres" Gefühl (war 200)
      ease: "Cubic.easeOut", // Kein "Bounce"-Effekt mehr, sondern sanftes Abbremsen
    });
    card.setData("hoverTween", hoverTween);
  }

  /**
   * Spielt die Animation ab, wenn die Maus die Handkarte verlässt.
   */
  public playHandHoverOutAnimation(card: CardUI) {
    // ✨ FIX: Prüfen, ob die Karte noch existiert, um Abstürze zu verhindern.
    if (!card.scene) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    // ✨ NEU: Wenn Animationen aus sind, sofort zurücksetzen (kein Tween).
    if (!this.settingsManager.areAnimationsEnabled()) {
      if (card.getData("originalScaleX") !== undefined) {
        card.scale = card.getData("originalScaleX");
        card.y = card.targetY;
        card.angle = card.targetAngle;
      }
      return;
    }

    const returnTween = this.scene.tweens.add({
      targets: card,
      y: card.targetY,
      angle: card.targetAngle,
      scale: card.getData("originalScaleX") ?? card.scaleX, // Fallback, falls undefined
      duration: 300, // Auch das Zurückgleiten etwas langsamer
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", returnTween);
  }

  /**
   * ✨ NEU: Spielt die Hover-Animation für eine Karte im Territory ab.
   * Vergrößert die Karte leicht (1.1x).
   */
  public playTerritoryHoverAnimation(card: CardUI) {
    // ✨ NEU: Settings prüfen (nur visuell)
    if (!this.settingsManager.areAnimationsEnabled()) return;

    // Stoppe laufende Hover-Tweens
    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    // Speichere Originalwerte, falls noch nicht geschehen
    if (card.getData("originalScaleX") === undefined) {
      card.setData("originalScaleX", card.scaleX);
      card.setData("originalScaleY", card.scaleY);
    }

    // Bringe die Karte nach vorne, damit sie beim Vergrößern über den Nachbarn liegt
    this.scene.children.bringToTop(card);

    const hoverTween = this.scene.tweens.add({
      targets: card,
      scale: card.getData("originalScaleX") * 1.1, // 1.1-fache Vergrößerung
      duration: 200,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", hoverTween);
  }

  /**
   * ✨ NEU: Spielt die Animation ab, wenn die Maus die Territory-Karte verlässt.
   */
  public playTerritoryHoverOutAnimation(card: CardUI) {
    // ✨ FIX: Prüfen, ob die Karte noch existiert.
    if (!card.scene) return;

    const existingTween = card.getData("hoverTween");
    if (existingTween) {
      existingTween.stop();
    }

    // ✨ NEU: Wenn Animationen aus sind, sofort zurücksetzen.
    if (!this.settingsManager.areAnimationsEnabled()) {
      if (card.getData("originalScaleX") !== undefined) {
        card.scale = card.getData("originalScaleX");
      }
      return;
    }

    const returnTween = this.scene.tweens.add({
      targets: card,
      scale: card.getData("originalScaleX") ?? card.scaleX, // Zurück zur Originalgröße
      duration: 200,
      ease: "Cubic.easeOut",
    });
    card.setData("hoverTween", returnTween);
  }
}
