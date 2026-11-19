// client/src/ui/overlays/EffectChronicleFlyoutUI.ts
import { type ChronicleItemData } from "../../../../shared/types";
import { CardDetailOverlay } from "./CardDetailOverlay";
import { CardRepository } from "../../../../shared/CardRepository.js";

/**
 * Slide-out DOM Drawer representing the Effect Chronicle as a passive Phase Inspector.
 * Displays Phase History (resolved) and Pending Queue (triggers) with unified card zoom.
 */
export class EffectChronicleFlyoutUI {
  private container: HTMLDivElement | null = null;
  private backdrop: HTMLDivElement | null = null;
  private drawer: HTMLDivElement | null = null;
  private listElement: HTMLDivElement | null = null;
  private badgeElement: HTMLSpanElement | null = null;
  private isDrawerOpen: boolean = false;

  constructor() {
    this._createDOM();
  }

  public show(): void {
    if (this.isDrawerOpen || !this.drawer || !this.backdrop) return;
    this.isDrawerOpen = true;
    this.backdrop.style.display = "block";
    requestAnimationFrame(() => {
      if (this.drawer) this.drawer.style.transform = "translateX(0)";
    });
  }

  public hide(): void {
    if (!this.isDrawerOpen || !this.drawer || !this.backdrop) return;
    this.isDrawerOpen = false;
    this.drawer.style.transform = "translateX(105%)";
    setTimeout(() => {
      if (!this.isDrawerOpen && this.backdrop) this.backdrop.style.display = "none";
    }, 280);
  }

  public toggle(): void {
    if (this.isDrawerOpen) this.hide();
    else this.show();
  }

  public isOpen(): boolean {
    return this.isDrawerOpen;
  }

  /**
   * Updates the displayed items in the inspector.
   * In Tournament mode (isInGameSupport=false), pending queue is strictly hidden.
   */
  public updateItems(
    pendingItems: ChronicleItemData[],
    historyItems: ChronicleItemData[],
    isInGameSupport: boolean
  ): void {
    if (!this.listElement || !this.badgeElement) return;

    const visibleItemsCount = (isInGameSupport ? pendingItems.length : 0) + historyItems.length;
    this.badgeElement.textContent = String(visibleItemsCount);
    this.listElement.innerHTML = "";

    if (visibleItemsCount === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.cssText = "color:#94a3b8;text-align:center;padding:30px 10px;font-style:italic;";
      emptyMsg.textContent = isInGameSupport
        ? "No effects pending or resolved in this phase."
        : "No resolved effects in this phase.";
      this.listElement.appendChild(emptyMsg);
      return;
    }

    // 1. Pending Queue (visible only when In-Game Support is enabled)
    if (isInGameSupport && pendingItems.length > 0) {
      this._appendSectionHeader("Pending Triggers", "#f59e0b", pendingItems.length);
      pendingItems.forEach((item, index) => {
        this.listElement?.appendChild(this._createItemRow(item, index === 0, false));
      });
    }

    // 2. Phase History (always visible as immutable tournament log)
    if (historyItems.length > 0) {
      this._appendSectionHeader("Phase History", "#10b981", historyItems.length);
      historyItems.forEach((item) => {
        this.listElement?.appendChild(this._createItemRow(item, false, true));
      });
    }
  }

  private _appendSectionHeader(title: string, color: string, count: number): void {
    const header = document.createElement("div");
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;
      margin:10px 0 6px 0;padding:4px 6px;border-bottom:1px solid #334155;color:${color};font-size:12px;font-weight:bold;`;
    header.innerHTML = `<span>${title}</span><span>(${count})</span>`;
    this.listElement?.appendChild(header);
  }

  private _createItemRow(item: ChronicleItemData, isActive: boolean, isHistory: boolean): HTMLDivElement {
    const row = document.createElement("div");
    const isPassed = isHistory && item.status === "passed";
    const activeBorder = isActive
      ? "border:2px solid #ffd700;box-shadow:0 0 10px rgba(255,215,0,0.4);"
      : isPassed
      ? "border:1px solid #334155;"
      : isHistory
      ? "border:1px solid #1e3a2f;"
      : "border:1px solid #334155;";
    const rowBg = isPassed ? "#161e2e;" : isHistory ? "#0f2027;" : "#1e293b;";
    const rowOpacity = isPassed ? "opacity:0.85;" : "";
    row.style.cssText = `display:flex;gap:10px;padding:8px;margin-bottom:8px;border-radius:6px;background:${rowBg}${rowOpacity}align-items:center;${activeBorder}`;

    // Order, Checkmark (completed), or Dash (passed) Badge
    const badgeSpan = document.createElement("span");
    const badgeColor = isPassed ? "#94a3b8" : isHistory ? "#10b981" : "#f59e0b";
    badgeSpan.style.cssText = `font-weight:bold;color:${badgeColor};font-size:13px;min-width:24px;text-align:center;`;
    badgeSpan.textContent = isPassed ? "–" : isHistory ? "✓" : `#${item.order}`;

    // Thumbnail with unified CardDetailOverlay zoom (prefer templateId lookup over name)
    const thumb = document.createElement("img");
    thumb.style.cssText = "width:42px;height:58px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #475569;";
    const cardData =
      (item.templateId ? CardRepository.getById(item.templateId) : null) ||
      CardRepository.getByName(item.title) || {
        Name: item.title,
        SpecialAbility: item.description,
      };
    const imagePath = cardData.ImageFile ? `assets/cards/${cardData.ImageFile}.jpg` : "assets/cards/cardback.jpg";
    thumb.src = imagePath;
    thumb.onmouseenter = (e) => CardDetailOverlay.show(cardData, { imageSrc: imagePath, globalX: e.clientX, globalY: e.clientY });
    thumb.onmouseleave = () => CardDetailOverlay.hide();
    thumb.onclick = (e) => {
      e.stopPropagation();
      CardDetailOverlay.show(cardData, { isModal: true, imageSrc: imagePath });
    };

    // Primary line: "Card Name — Effect", Secondary line: Status / Result summary
    const textCol = document.createElement("div");
    textCol.style.cssText = "flex:1;min-width:0;";

    const primaryText = item.effectLabel ? `${item.title} — ${item.effectLabel}` : item.title;
    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:bold;color:#f8fafc;font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.25;";
    title.textContent = primaryText;
    title.title = primaryText;

    const secondaryText = isHistory
      ? (item.resultSummary || (isPassed ? "Passed" : (item.description || "Resolved")))
      : (item.resultSummary || (item.effectLabel ? (item.isOptional ? "Optional" : "Mandatory") : (item.description || "Pending effect")));
    const desc = document.createElement("div");
    desc.style.cssText = `color:${isPassed ? "#94a3b8" : "#cbd5e1"};font-size:11px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.25;margin-top:3px;`;
    desc.textContent = secondaryText;
    desc.title = secondaryText;

    textCol.appendChild(title);
    textCol.appendChild(desc);

    row.appendChild(badgeSpan);
    row.appendChild(thumb);
    row.appendChild(textCol);
    return row;
  }

  private _shield(el: HTMLElement): void {
    const stop = (e: Event) => e.stopPropagation();
    ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "touchstart", "touchend", "click", "wheel"].forEach(
      (evt) => el.addEventListener(evt, stop)
    );
  }

  private _createDOM(): void {
    this.container = document.createElement("div");
    this.container.id = "effect-chronicle-flyout";

    this.backdrop = document.createElement("div");
    this.backdrop.style.cssText = "position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.25);display:none;";
    this.backdrop.onclick = (e) => { e.stopPropagation(); this.hide(); };

    this.drawer = document.createElement("div");
    this.drawer.style.cssText = `position:fixed;top:0;right:0;width:min(340px,85vw);height:100%;z-index:901;
      background:#0f172a;border-left:2px solid #d4af37;box-shadow:-4px 0 20px rgba(0,0,0,0.7);
      display:flex;flex-direction:column;transform:translateX(105%);transition:transform 0.28s ease-out;`;

    this._shield(this.backdrop);
    this._shield(this.drawer);

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #334155;";
    const titleArea = document.createElement("div");
    titleArea.style.cssText = "display:flex;align-items:center;gap:8px;";
    const title = document.createElement("span");
    title.style.cssText = "font-weight:bold;color:#f8fafc;font-size:15px;";
    title.textContent = "Phase Inspector";
    this.badgeElement = document.createElement("span");
    this.badgeElement.style.cssText = "background:#d4af37;color:#0f172a;font-weight:bold;font-size:11px;border-radius:10px;padding:1px 6px;";
    this.badgeElement.textContent = "0";
    titleArea.appendChild(title);
    titleArea.appendChild(this.badgeElement);

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;";
    closeBtn.textContent = "×";
    closeBtn.onclick = (e) => { e.stopPropagation(); this.hide(); };
    this._shield(closeBtn);

    header.appendChild(titleArea);
    header.appendChild(closeBtn);

    // List Container
    this.listElement = document.createElement("div");
    this.listElement.style.cssText = "flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;";

    // Passive Footer Note
    const footer = document.createElement("div");
    footer.style.cssText = "padding:10px 16px;border-top:1px solid #334155;background:#0b1120;color:#64748b;font-size:11px;text-align:center;font-style:italic;";
    footer.textContent = "Chronicle Phase-Log (purges on next phase)";

    this.drawer.appendChild(header);
    this.drawer.appendChild(this.listElement);
    this.drawer.appendChild(footer);

    this.container.appendChild(this.backdrop);
    this.container.appendChild(this.drawer);
    document.body.appendChild(this.container);
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}
