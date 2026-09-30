// client/src/ui/effects/EffectChronicleEffect.ts
import Phaser from "phaser";
import { EFFECT_CHRONICLE_CONFIG } from "../config/visualConfig";

/**
 * Pure visual/audio effect component for Effect Chronicle in Phaser.
 * Manages the HUD icon container, breathing pulse, and quadratic bezier card flight animations.
 */
export class EffectChronicleEffect {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private iconSprite: Phaser.GameObjects.Sprite;
  private badgeContainer: Phaser.GameObjects.Container;
  private badgeBg: Phaser.GameObjects.Graphics;
  private badgeText: Phaser.GameObjects.Text;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private onIconClickCallback: (() => void) | null = null;
  private isVisible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setAlpha(0);

    // Chronicle Icon Sprite
    this.iconSprite = this.scene.add.sprite(0, 0, EFFECT_CHRONICLE_CONFIG.ASSET_KEY);
    this.iconSprite.setInteractive({ useHandCursor: true });
    this.iconSprite.on("pointerdown", () => {
      this.onIconClickCallback?.();
    });

    // Badge Container
    this.badgeContainer = this.scene.add.container(0, 0);
    this.badgeBg = this.scene.add.graphics();
    this.badgeText = this.scene.add.text(0, 0, "0", {
      fontSize: "14px",
      fontStyle: "bold",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5);

    this.badgeContainer.add([this.badgeBg, this.badgeText]);
    this.container.add([this.iconSprite, this.badgeContainer]);
  }

  /**
   * Sets callback invoked when player clicks on the Chronicle Icon.
   */
  public setOnClickCallback(cb: () => void): void {
    this.onIconClickCallback = cb;
  }

  /**
   * Positions the Chronicle icon directly to the left of the active player's deck pile.
   */
  public updatePosition(deckRect: Phaser.Geom.Rectangle): void {
    const targetHeight = deckRect.height * 0.85;
    const targetWidth = targetHeight * EFFECT_CHRONICLE_CONFIG.ASPECT_RATIO;
    const scale = targetHeight / 512; // Base texture height is 512px

    this.iconSprite.setScale(scale);

    const x = deckRect.x - (targetWidth / 2) - EFFECT_CHRONICLE_CONFIG.OFFSET_X_FROM_DECK;
    const y = deckRect.centerY;

    this.container.setPosition(x, y);

    // Position badge at top-right corner of the icon
    const badgeX = (targetWidth / 2) - 4;
    const badgeY = -(targetHeight / 2) + 4;
    this.badgeContainer.setPosition(badgeX, badgeY);

    this._drawBadge(14);
  }

  /**
   * Updates item count badge and visibility.
   */
  public setCount(count: number): void {
    if (count > 0) {
      this.badgeText.setText(String(count));
      this._show();
    } else {
      this._hide();
    }
  }

  /**
   * Animates a card sprite flying along a quadratic bezier curve into the Chronicle icon.
   */
  public playCardFlightAnimation(
    startX: number,
    startY: number,
    cardTexture: string,
    width?: number,
    height?: number,
    rotation = 0,
    onComplete?: () => void
  ): void {
    const tempSprite = this.scene.add.sprite(startX, startY, cardTexture);
    tempSprite.setDepth(200);
    tempSprite.setRotation(rotation);

    if (width && height && width > 0 && height > 0) {
      tempSprite.setDisplaySize(width, height);
    }

    const initialScaleX = tempSprite.scaleX;
    const initialScaleY = tempSprite.scaleY;
    const targetX = this.container.x;
    const targetY = this.container.y;

    // Control point for subtle arc towards board center
    const controlX = (startX + targetX) / 2 - 60;
    const controlY = Math.min(startY, targetY) - 80;

    const path = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(startX, startY),
      new Phaser.Math.Vector2(controlX, controlY),
      new Phaser.Math.Vector2(targetX, targetY)
    );

    this._playFlightSound();

    const tweenObj = { t: 0 };
    this.scene.tweens.add({
      targets: tweenObj,
      t: 1,
      duration: EFFECT_CHRONICLE_CONFIG.FLIGHT_DURATION_MS,
      ease: "Quad.easeInOut",
      onUpdate: () => {
        const pos = path.getPoint(tweenObj.t);
        tempSprite.setPosition(pos.x, pos.y);
        const scaleFactor = Phaser.Math.Linear(1.0, EFFECT_CHRONICLE_CONFIG.SHRINK_MIN_SCALE, tweenObj.t);
        tempSprite.setScale(initialScaleX * scaleFactor, initialScaleY * scaleFactor);
        tempSprite.setRotation(Phaser.Math.Linear(rotation, 0.1, tweenObj.t));
      },
      onComplete: () => {
        tempSprite.destroy();
        this._playImpactPulse();
        onComplete?.();
      },
    });
  }

  /**
   * Destroys all objects.
   */
  public destroy(): void {
    this.pulseTween?.stop();
    this.container.destroy();
  }

  private _show(): void {
    if (this.isVisible) return;
    this.isVisible = true;

    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 300,
      ease: "Power2",
      onComplete: () => this._startBreathingPulse(),
    });
  }

  private _hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.pulseTween?.stop();
    this.pulseTween = null;

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 300,
      ease: "Power2",
    });
  }

  private _startBreathingPulse(): void {
    if (this.pulseTween || !this.isVisible) return;

    this.pulseTween = this.scene.tweens.add({
      targets: this.iconSprite,
      scaleX: this.iconSprite.scaleX * 1.05,
      scaleY: this.iconSprite.scaleY * 1.05,
      duration: EFFECT_CHRONICLE_CONFIG.PULSE_DURATION_MS / 2,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private _playImpactPulse(): void {
    const baseScale = this.iconSprite.scaleX;
    this.scene.tweens.add({
      targets: this.iconSprite,
      scaleX: baseScale * EFFECT_CHRONICLE_CONFIG.BUMP_SCALE_FACTOR,
      scaleY: baseScale * EFFECT_CHRONICLE_CONFIG.BUMP_SCALE_FACTOR,
      duration: EFFECT_CHRONICLE_CONFIG.BUMP_DURATION_MS,
      yoyo: true,
      ease: "Back.easeOut",
    });
  }

  private _lastFlightSoundTime = 0;

  private _playFlightSound(): void {
    const now = Date.now();
    if (now - this._lastFlightSoundTime < 200) return;
    this._lastFlightSoundTime = now;
    if (this.scene.game?.events) {
      this.scene.game.events.emit("playSound", "CHRONICLE_CARD_FLIGHT");
    }
  }

  private _drawBadge(radius: number): void {
    this.badgeBg.clear();
    this.badgeBg.fillStyle(EFFECT_CHRONICLE_CONFIG.BADGE_BG, 0.95);
    this.badgeBg.fillCircle(0, 0, radius);
    this.badgeBg.lineStyle(2, EFFECT_CHRONICLE_CONFIG.BADGE_BORDER, 1);
    this.badgeBg.strokeCircle(0, 0, radius);
  }
}
