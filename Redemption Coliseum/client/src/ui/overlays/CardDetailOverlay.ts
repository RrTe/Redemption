import { CardRepository } from "../../../../shared/CardRepository.js";
import { CardDetailDomBuilder } from "./CardDetailDomBuilder.js";

export interface CardDetailPositionOptions {
  globalX?: number;
  globalY?: number;
  cardWidth?: number;
  cardHeight?: number;
  isModal?: boolean;
  imageSrc?: string;
}

/**
 * CardDetailOverlay
 * Displays card image and readable text panel (floating on Desktop, modal on Mobile).
 */
export class CardDetailOverlay {
  private static builder = new CardDetailDomBuilder();
  private static onCloseCallback: (() => void) | null = null;

  public static show(
    rawData: any,
    optionsOrClose?: CardDetailPositionOptions | (() => void),
    onClose?: () => void
  ): void {
    if (!rawData) return;
    this.builder.create();
    if (!this.builder.overlayNode) return;

    let options: CardDetailPositionOptions = {};
    if (typeof optionsOrClose === "function") {
      this.onCloseCallback = optionsOrClose;
    } else {
      options = optionsOrClose || {};
      this.onCloseCallback = onClose || null;
    }

    this.populateData(rawData, options.imageSrc);

    const isModal = options.isModal ?? false;
    if (isModal) {
      this.builder.applyModalStyles();
      this.builder.overlayNode.onclick = () => { this.hide(); };
    } else {
      this.applyFloatingLayout(options);
      this.builder.overlayNode.onclick = null;
    }

    this.builder.overlayNode.style.display = isModal ? "flex" : "block";
  }

  private static populateData(rawData: any, imageSrc?: string): void {
    const b = this.builder;
    if (!b.titleNode || !b.statsNode || !b.metaNode || !b.abilityNode || !b.referenceNode) {
      return;
    }

    const identifier = rawData.cardId || rawData.id || rawData.ImageFile || rawData.Name;
    const repoCard = CardRepository.get(identifier);
    const card = { ...rawData, ...(repoCard || {}) };

    const imageFile = card.ImageFile || rawData.ImageFile;
    const targetSrc = imageSrc || (imageFile ? `/assets/cards/${imageFile}.jpg` : "/assets/cards/cardback.jpg");
    b.setImageSource(targetSrc);

    b.titleNode.textContent = card.Name || "Unknown Card";

    const str = card.Strength ?? "";
    const tough = card.Toughness ?? "";
    if (str !== "" || tough !== "") {
      b.statsNode.textContent = `${str}/${tough}`;
      b.statsNode.style.display = "block";
    } else {
      b.statsNode.style.display = "none";
    }

    const typeStr = Array.isArray(card.Type) ? card.Type.join(", ") : (card.Type || "");
    const brigadeStr = Array.isArray(card.Brigade) ? card.Brigade.join(", ") : (card.Brigade || "");
    const alignStr = Array.isArray(card.Alignment) ? card.Alignment.join(", ") : (card.Alignment || "");
    const metaParts = [typeStr, brigadeStr, alignStr].filter(Boolean);
    b.metaNode.textContent = metaParts.join(" • ") || "Card";

    b.abilityNode.textContent = this.formatAbilityText(card);


    if (card.Reference) {
      b.referenceNode.textContent = card.Reference;
      b.referenceNode.style.display = "block";
    } else {
      b.referenceNode.style.display = "none";
    }
  }

  /**
   * Formats ability text by separating multiple modes (top/bottom, sides, or generic TAG:/slash prefixes)
   * into clean paragraphs with empty lines in between, while normalizing artifact tags to "ART:".
   */
  private static formatAbilityText(card: any): string {
    // 1. Check if separate side abilities exist (Extended data structure)
    const topAbility = card.CardSides?.top?.SpecialAbility;
    const bottomAbility = card.CardSides?.bottom?.SpecialAbility;
    if (topAbility && bottomAbility) {
      return [this.cleanAbilityString(topAbility), this.cleanAbilityString(bottomAbility)]
        .filter(Boolean)
        .join("\n\n");
    }

    if (Array.isArray(card.sides) && card.sides.length > 1) {
      const sideAbilities = card.sides.map((s: any) => s?.SpecialAbility).filter(Boolean);
      if (sideAbilities.length > 1) {
        return sideAbilities.map((ab: string) => this.cleanAbilityString(ab)).join("\n\n");
      }
    }

    // 2. Extract shared or legacy string
    const rawAbility =
      card.SpecialAbility ||
      card.CardSides?.shared?.SpecialAbility ||
      card.sides?.[0]?.SpecialAbility ||
      "";

    if (!rawAbility) {
      return "No special ability.";
    }

    return this.cleanAbilityString(rawAbility);
  }

  /**
   * Normalizes tags (e.g. A: -> ART:) and splits generic TAG: boundaries or slashes into paragraphs.
   */
  private static cleanAbilityString(raw: string): string {
    if (!raw) return "";

    // Normalize "A:" at line starts, after slashes, or after sentence ends to "ART:"
    const normalized = raw.replace(/(^|\s*[\/\n]\s*|(?<=[.!?])\s+)A:\s+/g, "$1ART: ");

    // Split on slashes (" / "), existing newlines, or uppercase tag boundaries after sentence ends (. TAG:)
    const parts = normalized
      .split(/\s*\/\s*|\r?\n\r?\n|\r?\n|(?<=[.!?])\s+(?=[A-Z0-9/]{1,8}:\s)/)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.join("\n\n") || "No special ability.";
  }


  private static applyFloatingLayout(options: CardDetailPositionOptions): void {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const padding = 20;

    const targetHeight = Math.min(540, Math.max(320, screenH * 0.64));
    const estimatedCardWidth = targetHeight * 0.714;
    const panelWidth = Math.min(380, Math.max(280, screenW * 0.32));
    const totalWidth = estimatedCardWidth + 16 + panelWidth;

    const globalX = options.globalX ?? screenW / 2;
    const globalY = options.globalY ?? screenH / 2;
    const cardHalfWidth = (options.cardWidth ?? 0) / 2;

    const isLeft = globalX < screenW / 2;
    let targetLeft: number;

    if (isLeft) {
      targetLeft = globalX + cardHalfWidth + padding;
      if (targetLeft + totalWidth > screenW - padding) {
        targetLeft = Math.max(padding, screenW - padding - totalWidth);
      }
    } else {
      targetLeft = globalX - cardHalfWidth - padding - totalWidth;
      if (targetLeft < padding) {
        targetLeft = padding;
      }
    }

    let targetTop = globalY - targetHeight / 2;
    if (targetTop < padding) targetTop = padding;
    if (targetTop + targetHeight > screenH - padding) {
      targetTop = Math.max(padding, screenH - padding - targetHeight);
    }

    this.builder.applyFloatingStyles(isLeft, targetLeft, targetTop, targetHeight, panelWidth);
  }

  public static hide(): void {
    if (this.builder.overlayNode) {
      this.builder.overlayNode.style.display = "none";
    }
    if (this.builder.imgNode) {
      this.builder.imgNode.style.visibility = "hidden";
    }
    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = null;
      cb();
    }
  }

  public static destroy(): void {
    this.builder.destroy();
  }
}

export { CardDetailOverlay as MobileCardDetailOverlay };
