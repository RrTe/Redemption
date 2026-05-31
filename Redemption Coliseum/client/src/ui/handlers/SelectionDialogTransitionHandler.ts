import Phaser from "phaser";

/**
 * Handles fly-in and fly-out transitions for the SelectionDialogScene.
 */
export class SelectionDialogTransitionHandler {
  private scene: Phaser.Scene;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private _isTransitioning: boolean = false;
  private _nextDelta: number | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public get isTransitioning(): boolean {
    return this._isTransitioning;
  }

  public get nextDelta(): number | null {
    return this._nextDelta;
  }

  public set nextDelta(value: number | null) {
    this._nextDelta = value;
  }

  public speedUpActiveTransitions(): void {
    this.activeTweens.forEach((tween) => {
      if (tween && tween.isPlaying()) {
        tween.timeScale = 5;
      }
    });
  }

  public slideOut(
    targets: (
      | Phaser.GameObjects.GameObject
      | Phaser.GameObjects.GameObject[]
    )[],
    direction: number,
    duration: number,
    stagger: number,
    onElementComplete: (target: any) => void,
  ): void {
    this._isTransitioning = true;
    const offset =
      direction > 0 ? -this.scene.scale.width : this.scene.scale.width;

    targets.forEach((target, index) => {
      const delay =
        direction > 0
          ? index * stagger
          : (targets.length - 1 - index) * stagger;
      const tween = this.scene.tweens.add({
        targets: target,
        x: "+=" + offset,
        duration: duration,
        delay: delay,
        ease: "Cubic.easeIn",
        onComplete: () => onElementComplete(target),
      });
      this.activeTweens.push(tween);
    });
  }

  public slideIn(
    targets: (
      | Phaser.GameObjects.GameObject
      | Phaser.GameObjects.GameObject[]
    )[],
    targetXCoords: number[],
    direction: number,
    duration: number,
    stagger: number,
    baseDelay: number,
    onAllComplete: () => void,
  ): void {
    this._isTransitioning = true;
    targets.forEach((target, index) => {
      const delay =
        direction > 0
          ? index * stagger
          : (targets.length - 1 - index) * stagger;
      const tween = this.scene.tweens.add({
        targets: target,
        x: targetXCoords[index],
        duration: duration,
        delay: baseDelay + delay,
        ease: "Cubic.easeOut",
        onComplete: () => {
          const isLast =
            direction > 0 ? index === targets.length - 1 : index === 0;
          if (isLast) {
            this._isTransitioning = false;
            this.activeTweens = [];
            onAllComplete();
          }
        },
      });
      this.activeTweens.push(tween);
    });
  }

  public reset(): void {
    this.activeTweens.forEach((t) => t.stop());
    this.activeTweens = [];
    this._isTransitioning = false;
    this._nextDelta = null;
  }
}
