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
  private baseScale = 1;
  private bumpTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = this.scene.add.container(0, 0).setDepth(150).setAlpha(0);

    this.iconSprite = this.scene.add.sprite(0, 0, EFFECT_CHRONICLE_CONFIG.ASSET_KEY).setInteractive({ useHandCursor: true });
    this.iconSprite.on("pointerdown", () => this.onIconClickCallback?.());

    this.badgeContainer = this.scene.add.container(0, 0);
    this.badgeBg = this.scene.add.graphics();
    this.badgeText = this.scene.add.text(0, 0, "0", {
      fontSize: "14px", fontStyle: "bold", color: "#ffffff", fontFamily: "Arial, sans-serif",
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
   * Positions the Chronicle icon beside the deck pile (mirrored towards center for opponent).
   * @param deckRect The rectangle of the deck pile to anchor beside.
   * @param isOpponent Optional explicit flag; defaults to checking if deck is on the left half of the screen.
   */
  public updatePosition(deckRect: Phaser.Geom.Rectangle, isOpponent?: boolean): void {
    const targetHeight = deckRect.height * 0.85;
    const targetWidth = targetHeight * EFFECT_CHRONICLE_CONFIG.ASPECT_RATIO;
    this.baseScale = targetHeight / 512;
    this.iconSprite.setScale(this.baseScale);

    const isOpponentSide = isOpponent ?? (deckRect.centerX < (this.scene.scale?.width ?? 1000) / 2);
    const x = isOpponentSide
      ? deckRect.right + (targetWidth / 2) + EFFECT_CHRONICLE_CONFIG.OFFSET_X_FROM_DECK
      : deckRect.left - (targetWidth / 2) - EFFECT_CHRONICLE_CONFIG.OFFSET_X_FROM_DECK;

    this.container.setPosition(x, deckRect.centerY);
    this.badgeContainer.setPosition((targetWidth / 2) - 4, -(targetHeight / 2) + 4);
    this._drawBadge(14);
  }

  public setCount(count: number): void {
    if (count > 0) {
      this.badgeText.setText(String(count));
      this._show();
    } else {
      this._hide();
    }
  }

  public playCardFlightAnimation(
    startX: number,
    startY: number,
    cardTexture: string,
    width?: number,
    height?: number,
    rotation = 0,
    onComplete?: () => void
  ): void {
    this._ensureVisible();
    const tempSprite = this.scene.add.sprite(startX, startY, cardTexture).setDepth(200).setRotation(rotation);
    if (width && height && width > 0 && height > 0) tempSprite.setDisplaySize(width, height);

    const initX = tempSprite.scaleX, initY = tempSprite.scaleY;
    const targetX = this.container.x, targetY = this.container.y;
    const arcOffset = targetX < (this.scene.scale?.width ?? 1000) / 2 ? 60 : -60;
    const controlX = (startX + targetX) / 2 + arcOffset;
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
        const scale = Phaser.Math.Linear(1.0, EFFECT_CHRONICLE_CONFIG.SHRINK_MIN_SCALE, tweenObj.t);
        tempSprite.setScale(initX * scale, initY * scale);
        tempSprite.setRotation(Phaser.Math.Linear(rotation, 0.1, tweenObj.t));
      },
      onComplete: () => {
        tempSprite.destroy();
        this._playImpactPulse();
        onComplete?.();
      },
    });
  }

  public destroy(): void {
    this.pulseTween?.stop();
    this.pulseTween = null;
    this.bumpTween?.stop();
    this.bumpTween = null;
    this.container.destroy();
  }

  private _ensureVisible(): void {
    if (!this.isVisible || this.container.alpha < 1) {
      this.isVisible = true;
      this.scene.tweens.killTweensOf(this.container);
      this.container.setAlpha(1);
    }
  }

  private _show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 300,
      ease: "Power2",
      onComplete: () => { if (!this.bumpTween) this._startBreathingPulse(); },
    });
  }

  private _hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.pulseTween?.stop();
    this.pulseTween = null;
    this.bumpTween?.stop();
    this.bumpTween = null;
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({ targets: this.container, alpha: 0, duration: 300, ease: "Power2" });
  }

  private _startBreathingPulse(): void {
    if (this.pulseTween || !this.isVisible) return;
    this.pulseTween = this.scene.tweens.add({
      targets: this.iconSprite,
      scaleX: this.baseScale * 1.05,
      scaleY: this.baseScale * 1.05,
      duration: EFFECT_CHRONICLE_CONFIG.PULSE_DURATION_MS / 2,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private _playImpactPulse(): void {
    this._ensureVisible();
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
    }
    if (this.bumpTween) {
      this.bumpTween.stop();
      this.bumpTween = null;
    }
    this.iconSprite.setTint(EFFECT_CHRONICLE_CONFIG.FLASH_COLOR);
    this.iconSprite.setScale(this.baseScale * EFFECT_CHRONICLE_CONFIG.BUMP_SCALE_FACTOR);
    this.bumpTween = this.scene.tweens.add({
      targets: this.iconSprite,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: EFFECT_CHRONICLE_CONFIG.BUMP_DURATION_MS,
      ease: "Back.easeOut",
      onComplete: () => {
        this.bumpTween = null;
        this.iconSprite.setScale(this.baseScale);
        this.iconSprite.clearTint();
        if (this.isVisible && !this.pulseTween) {
          this._startBreathingPulse();
        }
      },
    });
  }

  private _lastFlightSoundTime = 0;

  private _playFlightSound(): void {
    const now = Date.now();
    if (now - this._lastFlightSoundTime < 200) return;
    this._lastFlightSoundTime = now;
    this.scene.game?.events?.emit("playSound", "CHRONICLE_CARD_FLIGHT");
  }

  private _drawBadge(radius: number): void {
    this.badgeBg.clear().fillStyle(EFFECT_CHRONICLE_CONFIG.BADGE_BG, 0.95).fillCircle(0, 0, radius);
    this.badgeBg.lineStyle(2, EFFECT_CHRONICLE_CONFIG.BADGE_BORDER, 1).strokeCircle(0, 0, radius);
  }
}
