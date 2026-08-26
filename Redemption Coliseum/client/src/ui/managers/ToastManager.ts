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

const TOAST_THEMES: Record<ToastType, ToastStyleConfig> = {
  info: {
    borderColor: "#b8860b",
    textColor: "#ffd700",
    shadowColor: "rgba(184, 134, 11, 0.4)",
  },
  warning: {
    borderColor: "#e67e22",
    textColor: "#f39c12",
    shadowColor: "rgba(230, 126, 34, 0.45)",
  },
  error: {
    borderColor: "#e74c3c",
    textColor: "#ff6b6b",
    shadowColor: "rgba(231, 76, 60, 0.5)",
  },
};

/**
 * Manages display of floating toast notification pills across scenes and dialogs.
 */
export class ToastManager {
  private static toastElement: HTMLElement | null = null;
  private static dismissTimer: any = null;

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
        top: "70px",
        left: "50%",
        transform: "translateX(-50%) translateY(-20px)",
        pointerEvents: "none",
        zIndex: "200000",
        display: "none",
        padding: "8px 18px",
        background: "rgba(10, 14, 24, 0.94)",
        borderRadius: "20px",
        fontFamily: '"Arial Black", Arial, sans-serif',
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity: "0",
        transition: "opacity 0.2s ease, transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        backdropFilter: "blur(4px)",
      });
      document.body.appendChild(this.toastElement);
    }
    return this.toastElement;
  }

  /**
   * Displays a toast notification with the given message and styling.
   *
   * @param {string} message - The text message to display.
   * @param {ToastType} [type="warning"] - The visual style type of the toast.
   * @param {number} [durationMs=2500] - Duration in milliseconds before auto-dismissal.
   */
  public static show(
    message: string,
    type: ToastType = "warning",
    durationMs: number = 2500,
  ): void {
    const el = this.getOrCreateElement();
    const theme = TOAST_THEMES[type] || TOAST_THEMES.warning;

    el.innerText = message;
    el.style.border = `1.5px solid ${theme.borderColor}`;
    el.style.color = theme.textColor;
    el.style.boxShadow = `0 4px 16px ${theme.shadowColor}, 0 2px 6px rgba(0, 0, 0, 0.8)`;
    el.style.display = "block";

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }

    requestAnimationFrame(() => {
      if (el) {
        el.style.opacity = "1";
        el.style.transform = "translateX(-50%) translateY(0)";
      }
    });

    this.dismissTimer = setTimeout(() => {
      this.hide();
    }, durationMs);
  }

  /**
   * Hides the active toast notification immediately.
   */
  public static hide(): void {
    if (this.toastElement) {
      this.toastElement.style.opacity = "0";
      this.toastElement.style.transform = "translateX(-50%) translateY(-20px)";
      setTimeout(() => {
        if (this.toastElement && this.toastElement.style.opacity === "0") {
          this.toastElement.style.display = "none";
        }
      }, 250);
    }
  }
}
