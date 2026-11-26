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

const TOAST_MIN_DURATION_MS = 4000;
const TOAST_MAX_DURATION_MS = 7500;
const TOAST_BASE_DURATION_MS = 2800;
const TOAST_MS_PER_CHAR = 50;
const TOAST_FADE_IN_OFFSET = 0.12;
const TOAST_FADE_OUT_START_OFFSET = 0.75;
const TOAST_MAX_WIDTH = "min(680px, 88vw)";

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
        lineHeight: "1.35",
        textAlign: "center",
        whiteSpace: "normal",
        maxWidth: TOAST_MAX_WIDTH,
        opacity: "0",
        backdropFilter: "blur(6px)",
      });
      document.body.appendChild(this.toastElement);
    }
    return this.toastElement;
  }

  /**
   * Computes a text-length-scaled toast duration bounded between 4000 ms and 7500 ms.
   *
   * @param {string} message - Toast message text.
   * @returns {number} Duration in milliseconds.
   */
  private static computeDurationMs(message: string): number {
    const trimmedLength = (message || "").trim().length;
    return Math.min(
      TOAST_MAX_DURATION_MS,
      Math.max(TOAST_MIN_DURATION_MS, TOAST_BASE_DURATION_MS + trimmedLength * TOAST_MS_PER_CHAR),
    );
  }

  /**
   * Displays a toast notification that rises slowly above the player's hand cards and fades out.
   *
   * @param {string} message - The text message to display.
   * @param {ToastType} [type="warning"] - The visual style type of the toast.
   * @param {number} [durationMs] - Optional explicit duration in milliseconds; defaults to length-scaled duration.
   */
  public static show(
    message: string,
    type: ToastType = "warning",
    durationMs?: number,
  ): void {
    const el = this.getOrCreateElement();
    const theme = TOAST_THEMES[type] || TOAST_THEMES.warning;
    const effectiveDurationMs =
      typeof durationMs === "number" ? durationMs : this.computeDurationMs(message);

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
        { transform: "translateX(-50%) translateY(-10px)", opacity: 1, offset: TOAST_FADE_IN_OFFSET },
        { transform: "translateX(-50%) translateY(-35px)", opacity: 1, offset: TOAST_FADE_OUT_START_OFFSET },
        { transform: "translateX(-50%) translateY(-65px)", opacity: 0, offset: 1.0 },
      ],
      {
        duration: effectiveDurationMs,
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
