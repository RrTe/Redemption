import { tooltipConfig } from "../config/tooltip_config";

// Central Tooltip Position Settings
export const TOOLTIP_CONFIG = {
  offsetY: 6, // Distance in px from the target element's edge
  minTopPadding: 2, // Minimum distance from screen top before auto-flipping
};

export class TooltipManager {
  private static tooltipEl: HTMLElement | null = null;

  private static getOrCreateElement(): HTMLElement {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div");
      this.tooltipEl.id = "game-tooltip-overlay";
      Object.assign(this.tooltipEl.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "100000",
        display: "none",
        padding: "5px 10px",
        background: "rgba(16, 22, 34, 0.95)",
        border: "1px solid #b8860b",
        borderRadius: "5px",
        color: "#ffd700",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontWeight: "bold",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.85)",
        textShadow: "1px 1px 2px rgba(0, 0, 0, 0.9)",
        whiteSpace: "nowrap",
        transition: "opacity 0.12s ease",
        opacity: "0",
      });
      document.body.appendChild(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  public static show(
    xPx: number,
    topYPx: number,
    textKeyOrRaw: string,
    preferredDir: "top" | "bottom" | "auto" = "top",
    targetHeight: number = 32
  ): void {
    const el = this.getOrCreateElement();
    const text = tooltipConfig[textKeyOrRaw] || textKeyOrRaw;
    if (!text) return;

    el.innerText = text;
    el.style.display = "block";
    el.style.left = "0px";
    el.style.top = "0px";

    const rect = el.getBoundingClientRect();
    const screenPadding = 10;
    const viewWidth = window.innerWidth;

    let top: number;
    if (preferredDir === "bottom") {
      // Position below target's bottom edge
      top = topYPx + targetHeight + TOOLTIP_CONFIG.offsetY;
    } else {
      // Position above target's top edge
      top = topYPx - rect.height - TOOLTIP_CONFIG.offsetY;
      if (preferredDir === "auto" && top < TOOLTIP_CONFIG.minTopPadding) {
        top = topYPx + targetHeight + TOOLTIP_CONFIG.offsetY;
      }
    }

    // Determine horizontal position (centered, clamped to screen edges)
    let left = xPx - rect.width / 2;
    if (left < screenPadding) {
      left = screenPadding;
    } else if (left + rect.width > viewWidth - screenPadding) {
      left = viewWidth - screenPadding - rect.width;
    }

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;

    requestAnimationFrame(() => {
      if (el) el.style.opacity = "1";
    });
  }

  public static hide(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.opacity = "0";
      this.tooltipEl.style.display = "none";
    }
  }

  public static destroy(): void {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
