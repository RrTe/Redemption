/**
 * @module ToastManager
 * Centralized DOM-based toast notification system for non-blocking alerts and feedback.
 */

export type ToastType = "info" | "warning" | "error";

interface ToastStyleConfig {
  borderColor: string;
  textColor: string;
  shadowColor: string;
}

/** Gold color value matching the Deck Synchronization dialogs */
const GOLD_COLOR = "#ffd700";

const TOAST_THEMES: Record<ToastType, ToastStyleConfig> = {
  info: {
    borderColor: GOLD_COLOR,
    textColor: GOLD_COLOR,
    shadowColor: "rgba(255, 215, 0, 0.45)",
  },
  warning: {
    borderColor: GOLD_COLOR,
    textColor: GOLD_COLOR,
    shadowColor: "rgba(255, 215, 0, 0.45)",
  },
  error: {
    borderColor: "#ff4d4d",
    textColor: "#ff4d4d",
    shadowColor: "rgba(255, 77, 77, 0.5)",
  },
};

/**
 * Manages display of floating toast notification pills that rise above the hand cards.
 */
export class ToastManager {
  private static toastElement: HTMLElement | null = null;
  private static activeAnimation: Animation | null = null;

  /**
   * Initializes or returns the singleton DOM toast element.
   *
   * @returns {HTMLElement} The toast container element.
   */
  private static getOrCreateElement(): HTMLElement {
    if (!this.toastElement) {
      this.toastElement = document.createElement("div");
      this.toastElement.id = "game-toast-container";
      Object.assign(this.toastElement.style, {
        position: "fixed",
        bottom: "clamp(130px, 23vh, 220px)",
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: "200000",
        display: "none",
        padding: "8px 22px",
        background: "rgba(10, 10, 10, 0.92)",
        borderRadius: "20px",
        fontFamily: 'Arial, "Arial Black", sans-serif',
        fontSize: "14px",
        fontWeight: "bold",
        letterSpacing: "1px",
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity: "0",
        backdropFilter: "blur(6px)",
      });
      document.body.appendChild(this.toastElement);
    }
    return this.toastElement;
  }

  /**
   * Displays a toast notification that rises slowly above the player's hand cards and fades out.
   *
   * @param {string} message - The text message to display.
   * @param {ToastType} [type="warning"] - The visual style type of the toast.
   * @param {number} [durationMs=4000] - Duration in milliseconds for the rise and fade animation.
   */
  public static show(
    message: string,
    type: ToastType = "warning",
    durationMs: number = 4000,
  ): void {
    const el = this.getOrCreateElement();
    const theme = TOAST_THEMES[type] || TOAST_THEMES.warning;

    if (this.activeAnimation) {
      this.activeAnimation.cancel();
      this.activeAnimation = null;
    }

    el.innerText = message;
    el.style.border = `1.5px solid ${theme.borderColor}`;
    el.style.color = theme.textColor;
    el.style.boxShadow = `0 4px 20px ${theme.shadowColor}, 0 2px 8px rgba(0, 0, 0, 0.9)`;
    el.style.display = "block";

    // Slowly ascend upwards above the hand fan and fade out
    this.activeAnimation = el.animate(
      [
        { transform: "translateX(-50%) translateY(0px)", opacity: 0, offset: 0 },
        { transform: "translateX(-50%) translateY(-10px)", opacity: 1, offset: 0.12 },
        { transform: "translateX(-50%) translateY(-35px)", opacity: 1, offset: 0.65 },
        { transform: "translateX(-50%) translateY(-65px)", opacity: 0, offset: 1.0 },
      ],
      {
        duration: durationMs,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        fill: "forwards",
      },
    );

    this.activeAnimation.onfinish = () => {
      if (el) el.style.display = "none";
      this.activeAnimation = null;
    };
  }

  /**
   * Hides the active toast notification immediately.
   */
  public static hide(): void {
    if (this.activeAnimation) {
      this.activeAnimation.cancel();
      this.activeAnimation = null;
    }
    if (this.toastElement) {
      this.toastElement.style.display = "none";
    }
  }
}
