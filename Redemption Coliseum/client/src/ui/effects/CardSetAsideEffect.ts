import Phaser from "phaser";
import type { CardUI } from "../CardUI";
import type { CardVisuals } from "./CardVisuals";

/**
 * Manages the liquid distortion shader effect for Set Aside cards.
 * Applies the LiquidDistortionPipeline shader (real-time GLSL fluid wave displacement)
 * and translucent opacity while active.
 */
export class CardSetAsideEffect {
  private scene: Phaser.Scene;
  private cardUI: CardUI;
  private visuals: CardVisuals;
  private isActive: boolean = false;

  constructor(scene: Phaser.Scene, cardUI: CardUI, visuals: CardVisuals) {
    this.scene = scene;
    this.cardUI = cardUI;
    this.visuals = visuals;
  }

  /**
   * Updates the active status of the Set Aside liquid distortion effect.
   *
   * @param {boolean} active - Whether the Set Aside effect should be active.
   */
  public update(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;

    if (active && this.visuals.areEffectsEnabled()) {
      this.visuals.applyLiquidShader(true);
      this.visuals.setFrontBackAlpha(0.58);
    } else {
      this.visuals.applyLiquidShader(false);
      this.visuals.setFrontBackAlpha(1.0);
    }
  }

  /**
   * Re-applies shader if card images or sizes reload.
   */
  public onUpdateSize(): void {
    if (this.isActive) {
      this.visuals.applyLiquidShader(true);
    }
  }

  /**
   * Lifecycle hook called each frame.
   */
  public onUpdate(): void {
    // WebGL pipeline processes time automatically
  }

  /**
   * Cleans up all applied shader pipelines and restores original alpha.
   */
  public destroy(): void {
    this.update(false);
  }
}
