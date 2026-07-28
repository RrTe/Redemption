import { tooltipConfig } from "../config/tooltip_config";

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
        padding: "6px 12px",
        background: "rgba(16, 22, 34, 0.95)",
        border: "1px solid #b8860b",
        borderRadius: "6px",
        color: "#ffd700",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontWeight: "bold",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.85)",
        textShadow: "1px 1px 2px rgba(0, 0, 0, 0.9)",
        whiteSpace: "nowrap",
        transform: "translate(-50%, -125%)",
        transition: "opacity 0.12s ease",
        opacity: "0",
      });
      document.body.appendChild(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  public static show(xPx: number, yPx: number, textKeyOrRaw: string): void {
    const el = this.getOrCreateElement();
    const text = tooltipConfig[textKeyOrRaw] || textKeyOrRaw;
    if (!text) return;

    el.innerText = text;
    el.style.left = `${Math.round(xPx)}px`;
    el.style.top = `${Math.round(yPx)}px`;
    el.style.display = "block";
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
