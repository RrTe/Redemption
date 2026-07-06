import Phaser from "phaser";
import { log } from "../../utils/logger";

export class ViewportManager {
  private static game: Phaser.Game;
  private static currentWidth: number = 0;
  private static currentHeight: number = 0;
  private static resizeTimeout: number | null = null;
  private static initialized: boolean = false;

  /**
   * Initializes the ViewportManager and sets up the global resize listener.
   */
  public static init(game: Phaser.Game) {
    if (this.initialized) return;
    this.game = game;
    this.initialized = true;

    // Initial values
    this.updateDimensions();

    // Listen to resize events with debouncing
    this.game.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    // Fallback: Check if canvas size is 0 or default (800x600) on first tick
    // and force an update slightly later when DOM is ready
    if (this.currentWidth === 0 || (this.currentWidth === 800 && this.currentHeight === 600)) {
      setTimeout(() => {
        this.handleResize();
      }, 100);
    }

    log("ViewportManager", "Initialized", { width: this.currentWidth, height: this.currentHeight });
  }

  private static handleResize() {
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = window.setTimeout(() => {
      this.updateDimensions();
      // Emit a global event so scenes/components can rebuild layout if needed
      this.game.events.emit("viewport-changed", this.currentWidth, this.currentHeight);
    }, 150);
  }

  private static updateDimensions() {
    this.currentWidth = this.game.scale.width;
    this.currentHeight = this.game.scale.height;
  }

  /**
   * Returns a value representing a percentage of the viewport width.
   * e.g., vw(50) returns 50% of the screen width.
   */
  public static vw(percent: number): number {
    return (this.currentWidth * percent) / 100;
  }

  /**
   * Returns a value representing a percentage of the viewport height.
   */
  public static vh(percent: number): number {
    return (this.currentHeight * percent) / 100;
  }

  /**
   * Returns a percentage of the smaller viewport dimension (width or height).
   */
  public static vmin(percent: number): number {
    return (Math.min(this.currentWidth, this.currentHeight) * percent) / 100;
  }

  /**
   * Returns a percentage of the larger viewport dimension (width or height).
   */
  public static vmax(percent: number): number {
    return (Math.max(this.currentWidth, this.currentHeight) * percent) / 100;
  }

  /**
   * True if the available width is less than 768px.
   */
  public static isCompactMode(): boolean {
    return this.currentWidth < 768;
  }

  /**
   * True if the available width is between 768px and 1200px.
   */
  public static isTabletMode(): boolean {
    return this.currentWidth >= 768 && this.currentWidth < 1200;
  }

  /**
   * True if the available width is at least 1200px.
   */
  public static isDesktopMode(): boolean {
    return this.currentWidth >= 1200;
  }

  /**
   * True if the primary input method of the device is a touchscreen.
   */
  public static isTouchPrimary(): boolean {
    if (window.matchMedia) {
      return window.matchMedia("(pointer: coarse)").matches;
    }
    // Fallback if matchMedia is unavailable
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }
}
