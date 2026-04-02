import Phaser from "phaser";
import { calculateLayout, type GameLayout } from "../layout";
import { type ElementManager } from "./ElementManager";
import { type HUDManager } from "./HUDManager";
import { type ChatManager } from "./ChatManager";
import { type CardRenderer } from "../renderers/CardRenderer";

/**
 * Orchestrates UI positioning, layout calculations, and transitions.
 */
export class LayoutManager {
  private scene: Phaser.Scene;
  private elementManager: ElementManager;
  private hudManager: HUDManager;
  private chatManager: ChatManager;
  private cardRenderer: CardRenderer;
  private dragBounds: Phaser.Geom.Rectangle;

  public layout!: GameLayout;

  constructor(
    scene: Phaser.Scene,
    elementManager: ElementManager,
    hudManager: HUDManager,
    chatManager: ChatManager,
    cardRenderer: CardRenderer,
    dragBounds: Phaser.Geom.Rectangle
  ) {
    this.scene = scene;
    this.elementManager = elementManager;
    this.hudManager = hudManager;
    this.chatManager = chatManager;
    this.cardRenderer = cardRenderer;
    this.dragBounds = dragBounds;
  }

  public updateLayout(width: number, height: number, phase: string) {
    this.layout = calculateLayout(width, height, phase);
    // Sync dependencies
    this.elementManager.layout = this.layout;
    this.cardRenderer.layout = this.layout;
    this.hudManager.updateLayout(this.layout);
  }

  public repositionUI() {
    this.elementManager.repositionUI(this.layout);
    this.chatManager.reposition(this.layout);
    this.dragBounds.setSize(this.layout.GAME_WIDTH, this.layout.GAME_HEIGHT);
  }

  public startPhaseChangeAnimation(endLayout: GameLayout, onComplete: () => void) {
    this.scene.tweens.add({
      targets: { value: 0 },
      value: 1,
      duration: 400,
      ease: "Sine.easeInOut",
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        const progress = tween.getValue();
        const interpolatedLayout = this.interpolateLayout(this.layout, endLayout, progress);
        this.elementManager.repositionUI(interpolatedLayout);
      },
      onComplete: () => {
        this.layout = endLayout;
        this.repositionUI();
        onComplete();
      },
    });
  }

  private interpolateLayout(start: GameLayout, end: GameLayout, t: number): GameLayout {
    const interpolated = { ...end };
    for (const key in start) {
      const typedKey = key as keyof GameLayout;
      if (start[typedKey] instanceof Phaser.Geom.Rectangle) {
        const startRect = start[typedKey] as Phaser.Geom.Rectangle;
        const endRect = end[typedKey] as Phaser.Geom.Rectangle;
        (interpolated as any)[typedKey] = new Phaser.Geom.Rectangle(
          Phaser.Math.Linear(startRect.x, endRect.x, t),
          Phaser.Math.Linear(startRect.y, endRect.y, t),
          Phaser.Math.Linear(startRect.width, endRect.width, t),
          Phaser.Math.Linear(startRect.height, endRect.height, t)
        );
      }
    }
    return interpolated as GameLayout;
  }
}