// client/src/ui/overlays/EffectChronicleFlyoutUI.ts
import { type ChronicleItemData } from "../../../../shared/types";
import { CardDetailOverlay } from "./CardDetailOverlay";
import { CardRepository } from "../../../../shared/CardRepository.js";

/**
 * Slide-out DOM Drawer representing the Effect Chronicle.
 * Displays queued abilities in sequential order with active highlights, card detail zoom, and controls.
 */
export class EffectChronicleFlyoutUI {
  private container: HTMLDivElement | null = null;
  private backdrop: HTMLDivElement | null = null;
  private drawer: HTMLDivElement | null = null;
  private listElement: HTMLDivElement | null = null;
  private footerElement: HTMLDivElement | null = null;
  private badgeElement: HTMLSpanElement | null = null;
  private isDrawerOpen: boolean = false;

  public onExecuteCallback: ((itemId?: string) => void) | null = null;
  public onPassCallback: ((itemId?: string) => void) | null = null;
  public onPassAllCallback: (() => void) | null = null;

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
   * Updates the displayed items in the drawer.
   */
  public updateItems(items: ChronicleItemData[], hasPriority: boolean): void {
    if (!this.listElement || !this.footerElement || !this.badgeElement) return;

    this.badgeElement.textContent = String(items.length);
    this.listElement.innerHTML = "";

    if (items.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.cssText = "color:#94a3b8;text-align:center;padding:30px 10px;font-style:italic;";
      emptyMsg.textContent = "No effects pending in the Chronicle.";
      this.listElement.appendChild(emptyMsg);
      this._renderFooter(false, false);
      return;
    }

    items.forEach((item, index) => {
      const row = this._createItemRow(item, index === 0);
      this.listElement?.appendChild(row);
    });

    this._renderFooter(hasPriority, items.length > 0, items[0]?.id);
  }

  private _createItemRow(item: ChronicleItemData, isActive: boolean): HTMLDivElement {
    const row = document.createElement("div");
    const activeBorder = isActive ? "border:2px solid #ffd700;box-shadow:0 0 10px rgba(255,215,0,0.4);" : "border:1px solid #334155;";
    row.style.cssText = `display:flex;gap:10px;padding:8px;margin-bottom:8px;border-radius:6px;background:#1e293b;align-items:center;${activeBorder}`;

    // Order Badge
    const orderSpan = document.createElement("span");
    orderSpan.style.cssText = "font-weight:bold;color:#f59e0b;font-size:13px;min-width:24px;";
    orderSpan.textContent = `#${item.order}`;

    // Thumbnail with unified CardDetailOverlay zoom
    const thumb = document.createElement("img");
    thumb.style.cssText = "width:42px;height:58px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #475569;";
    const cardData = CardRepository.getByName(item.title) || { Name: item.title, SpecialAbility: item.description };
    const imagePath = cardData.ImageFile ? `assets/cards/${cardData.ImageFile}.jpg` : "assets/cards/cardback.jpg";
    thumb.src = imagePath;
    thumb.onmouseenter = (e) => {
      CardDetailOverlay.show(cardData, { imageSrc: imagePath, globalX: e.clientX, globalY: e.clientY });
    };
    thumb.onmouseleave = () => CardDetailOverlay.hide();
    thumb.onclick = (e) => {
      e.stopPropagation();
      CardDetailOverlay.show(cardData, { isModal: true, imageSrc: imagePath });
    };

    // Text details
    const textCol = document.createElement("div");
    textCol.style.cssText = "flex:1;overflow:hidden;";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:bold;color:#f8fafc;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    title.textContent = item.title;
    const desc = document.createElement("div");
    desc.style.cssText = "color:#cbd5e1;font-size:11px;max-height:36px;overflow:hidden;line-height:1.2;margin-top:2px;";
    desc.textContent = item.description || "Active effect";
    textCol.appendChild(title);
    textCol.appendChild(desc);

    row.appendChild(orderSpan);
    row.appendChild(thumb);
    row.appendChild(textCol);
    return row;
  }

  private _renderFooter(hasPriority: boolean, hasItems: boolean, activeItemId?: string): void {
    if (!this.footerElement) return;
    this.footerElement.innerHTML = "";

    if (!hasItems) return;

    if (!hasPriority) {
      const waitMsg = document.createElement("div");
      waitMsg.style.cssText = "color:#94a3b8;font-size:12px;text-align:center;padding:6px;font-style:italic;";
      waitMsg.textContent = "Waiting for opponent's decision...";
      this.footerElement.appendChild(waitMsg);
      return;
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;width:100%;justify-content:space-between;";

    const execBtn = document.createElement("button");
    execBtn.style.cssText = "flex:1.2;padding:8px 12px;background:#d4af37;color:#0f172a;font-weight:bold;border:none;border-radius:4px;cursor:pointer;";
    execBtn.textContent = "Execute";
    execBtn.onclick = () => this.onExecuteCallback?.(activeItemId);

    const passBtn = document.createElement("button");
    passBtn.style.cssText = "flex:1;padding:8px 8px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;cursor:pointer;";
    passBtn.textContent = "Pass";
    passBtn.onclick = () => this.onPassCallback?.(activeItemId);

    const passAllBtn = document.createElement("button");
    passAllBtn.style.cssText = "flex:1;padding:8px 6px;background:#1e293b;border:1px solid #475569;color:#94a3b8;border-radius:4px;cursor:pointer;font-size:11px;";
    passAllBtn.textContent = "Pass All";
    passAllBtn.onclick = () => this.onPassAllCallback?.();

    btnRow.appendChild(execBtn);
    btnRow.appendChild(passBtn);
    btnRow.appendChild(passAllBtn);
    this.footerElement.appendChild(btnRow);
  }

  private _createDOM(): void {
    this.container = document.createElement("div");
    this.container.id = "effect-chronicle-flyout";

    this.backdrop = document.createElement("div");
    this.backdrop.style.cssText = "position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.25);display:none;";
    this.backdrop.onclick = () => this.hide();

    this.drawer = document.createElement("div");
    this.drawer.style.cssText = `position:fixed;top:0;right:0;width:min(340px,85vw);height:100%;z-index:901;
      background:#0f172a;border-left:2px solid #d4af37;box-shadow:-4px 0 20px rgba(0,0,0,0.7);
      display:flex;flex-direction:column;transform:translateX(105%);transition:transform 0.28s ease-out;`;

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #334155;";
    const titleArea = document.createElement("div");
    titleArea.style.cssText = "display:flex;align-items:center;gap:8px;";
    const title = document.createElement("span");
    title.style.cssText = "font-weight:bold;color:#f8fafc;font-size:15px;";
    title.textContent = "Effect Chronicle";
    this.badgeElement = document.createElement("span");
    this.badgeElement.style.cssText = "background:#d4af37;color:#0f172a;font-weight:bold;font-size:11px;border-radius:10px;padding:1px 6px;";
    this.badgeElement.textContent = "0";
    titleArea.appendChild(title);
    titleArea.appendChild(this.badgeElement);

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;";
    closeBtn.textContent = "×";
    closeBtn.onclick = () => this.hide();

    header.appendChild(titleArea);
    header.appendChild(closeBtn);

    // List Container
    this.listElement = document.createElement("div");
    this.listElement.style.cssText = "flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;";

    // Footer Container
    this.footerElement = document.createElement("div");
    this.footerElement.style.cssText = "padding:12px 16px;border-top:1px solid #334155;background:#0b1120;";

    this.drawer.appendChild(header);
    this.drawer.appendChild(this.listElement);
    this.drawer.appendChild(this.footerElement);

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
