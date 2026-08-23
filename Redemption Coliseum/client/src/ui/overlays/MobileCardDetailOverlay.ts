import { CardRepository } from "../../../../shared/CardRepository.js";

/**
 * MobileCardDetailOverlay
 * Displays a split-view modal on mobile viewports with the card image and readable text.
 */
export class MobileCardDetailOverlay {
  private static overlayNode: HTMLElement | null = null;
  private static imgNode: HTMLImageElement | null = null;
  private static titleNode: HTMLElement | null = null;
  private static statsNode: HTMLElement | null = null;
  private static metaNode: HTMLElement | null = null;
  private static abilityNode: HTMLElement | null = null;
  private static referenceNode: HTMLElement | null = null;
  private static onCloseCallback: (() => void) | null = null;

  /**
   * Initializes the DOM elements for the overlay once.
   */
  private static createOverlay(): void {
    if (this.overlayNode) return;

    this.overlayNode = document.createElement("div");
    this.overlayNode.id = "mobile-card-detail-overlay";
    Object.assign(this.overlayNode.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      webkitBackdropFilter: "blur(4px)",
      zIndex: "99999",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      gap: "14px",
      padding: "12px",
      boxSizing: "border-box",
      userSelect: "none",
      webkitUserSelect: "none",
    });

    // Tap anywhere to close
    this.overlayNode.onclick = () => {
      this.hide();
    };

    // Card Image
    this.imgNode = document.createElement("img");
    Object.assign(this.imgNode.style, {
      maxHeight: "92vh",
      maxWidth: "42vw",
      height: "auto",
      width: "auto",
      objectFit: "contain",
      borderRadius: "8px",
      boxShadow: "0 6px 24px rgba(0, 0, 0, 0.8)",
      border: "1px solid rgba(255, 215, 0, 0.3)",
      flexShrink: "0",
    });

    // Detail Panel
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      maxHeight: "92vh",
      width: "min(380px, 50vw)",
      backgroundColor: "rgba(22, 26, 35, 0.96)",
      border: "1px solid rgba(255, 215, 0, 0.4)",
      borderRadius: "8px",
      padding: "12px 14px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      color: "#ffffff",
      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.9)",
      overflowY: "auto",
    });

    // Header row (Name + Stats)
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "8px",
    });

    this.titleNode = document.createElement("div");
    Object.assign(this.titleNode.style, {
      fontSize: "15px",
      fontWeight: "bold",
      color: "#ffd700",
      lineHeight: "1.2",
    });

    this.statsNode = document.createElement("div");
    Object.assign(this.statsNode.style, {
      fontSize: "13px",
      fontWeight: "bold",
      backgroundColor: "#2c3e50",
      color: "#ffffff",
      padding: "2px 6px",
      borderRadius: "4px",
      flexShrink: "0",
      border: "1px solid rgba(255, 255, 255, 0.2)",
    });

    header.appendChild(this.titleNode);
    header.appendChild(this.statsNode);

    // Meta row (Type, Brigade, Alignment)
    this.metaNode = document.createElement("div");
    Object.assign(this.metaNode.style, {
      fontSize: "11px",
      color: "#94a3b8",
      lineHeight: "1.3",
      borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
      paddingBottom: "6px",
    });

    // Special Ability
    this.abilityNode = document.createElement("div");
    Object.assign(this.abilityNode.style, {
      fontSize: "13px",
      lineHeight: "1.45",
      color: "#f1f5f9",
      whiteSpace: "pre-wrap",
      flex: "1",
      overflowY: "auto",
    });

    // Reference
    this.referenceNode = document.createElement("div");
    Object.assign(this.referenceNode.style, {
      fontSize: "11px",
      fontStyle: "italic",
      color: "#94a3b8",
      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
      paddingTop: "6px",
    });

    // Close hint
    const hintNode = document.createElement("div");
    hintNode.textContent = "Tap anywhere to close";
    Object.assign(hintNode.style, {
      fontSize: "10px",
      color: "#64748b",
      textAlign: "center",
      marginTop: "2px",
    });

    panel.appendChild(header);
    panel.appendChild(this.metaNode);
    panel.appendChild(this.abilityNode);
    panel.appendChild(this.referenceNode);
    panel.appendChild(hintNode);

    this.overlayNode.appendChild(this.imgNode);
    this.overlayNode.appendChild(panel);
    document.body.appendChild(this.overlayNode);
  }

  /**
   * Shows the detail overlay for a given card.
   * @param rawData Card state or card object
   * @param onClose Optional callback when the overlay is closed
   */
  public static show(rawData: any, onClose?: () => void): void {
    if (!rawData) return;
    this.onCloseCallback = onClose || null;
    this.createOverlay();
    if (!this.overlayNode || !this.imgNode || !this.titleNode || !this.statsNode || !this.metaNode || !this.abilityNode || !this.referenceNode) {
      return;
    }

    // Resolve comprehensive data from repository
    const identifier = rawData.cardId || rawData.id || rawData.ImageFile || rawData.Name;
    const repoCard = CardRepository.get(identifier);
    const card = { ...rawData, ...(repoCard || {}) };

    const imageFile = card.ImageFile || rawData.ImageFile;
    this.imgNode.src = imageFile ? `/assets/cards/${imageFile}.jpg` : "/assets/cards/cardback.jpg";

    this.titleNode.textContent = card.Name || "Unknown Card";

    // Stats
    const str = card.Strength ?? "";
    const tough = card.Toughness ?? "";
    if (str !== "" || tough !== "") {
      this.statsNode.textContent = `${str}/${tough}`;
      this.statsNode.style.display = "block";
    } else {
      this.statsNode.style.display = "none";
    }

    // Meta details
    const typeStr = Array.isArray(card.Type) ? card.Type.join(", ") : (card.Type || "");
    const brigadeStr = Array.isArray(card.Brigade) ? card.Brigade.join(", ") : (card.Brigade || "");
    const alignStr = Array.isArray(card.Alignment) ? card.Alignment.join(", ") : (card.Alignment || "");

    const metaParts = [typeStr, brigadeStr, alignStr].filter((p) => Boolean(p));
    this.metaNode.textContent = metaParts.join(" • ") || "Card";

    // Ability
    const ability = card.SpecialAbility || card.sides?.[0]?.SpecialAbility || "No special ability.";
    this.abilityNode.textContent = ability;

    // Reference
    if (card.Reference) {
      this.referenceNode.textContent = card.Reference;
      this.referenceNode.style.display = "block";
    } else {
      this.referenceNode.style.display = "none";
    }

    this.overlayNode.style.display = "flex";
  }

  /**
   * Hides the detail overlay.
   */
  public static hide(): void {
    if (this.overlayNode) {
      this.overlayNode.style.display = "none";
    }
    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = null;
      cb();
    }
  }

  /**
   * Cleans up the DOM element.
   */
  public static destroy(): void {
    if (this.overlayNode && this.overlayNode.parentNode) {
      this.overlayNode.parentNode.removeChild(this.overlayNode);
      this.overlayNode = null;
      this.imgNode = null;
      this.titleNode = null;
      this.statsNode = null;
      this.metaNode = null;
      this.abilityNode = null;
      this.referenceNode = null;
    }
  }
}
