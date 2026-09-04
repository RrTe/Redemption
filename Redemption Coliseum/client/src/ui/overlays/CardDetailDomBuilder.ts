/**
 * CardDetailDomBuilder
 * Builds and manages DOM nodes and styles for CardDetailOverlay.
 */
export class CardDetailDomBuilder {
  public overlayNode: HTMLElement | null = null;
  public wrapperNode: HTMLElement | null = null;
  public imgNode: HTMLImageElement | null = null;
  public panelNode: HTMLElement | null = null;
  public titleNode: HTMLElement | null = null;
  public statsNode: HTMLElement | null = null;
  public metaNode: HTMLElement | null = null;
  public abilityNode: HTMLElement | null = null;
  public referenceNode: HTMLElement | null = null;
  public hintNode: HTMLElement | null = null;

  public create(): void {
    if (this.overlayNode) return;

    this.overlayNode = document.createElement("div");
    this.overlayNode.id = "card-detail-overlay";
    Object.assign(this.overlayNode.style, {
      position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
      zIndex: "99999", display: "none", boxSizing: "border-box",
      userSelect: "none", webkitUserSelect: "none",
    });

    this.wrapperNode = document.createElement("div");
    Object.assign(this.wrapperNode.style, {
      display: "flex", gap: "16px", alignItems: "center", boxSizing: "border-box",
    });

    // Card Image
    this.imgNode = document.createElement("img");
    Object.assign(this.imgNode.style, {
      objectFit: "contain", borderRadius: "8px",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.85)",
      border: "1.5px solid rgba(255, 215, 0, 0.4)",
      flexShrink: "0", visibility: "hidden",
    });

    // Detail Panel
    this.panelNode = document.createElement("div");
    Object.assign(this.panelNode.style, {
      backgroundColor: "rgba(18, 22, 32, 0.97)",
      border: "1.5px solid rgba(255, 215, 0, 0.45)",
      borderRadius: "10px", padding: "16px 18px", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: "10px", color: "#ffffff",
      boxShadow: "0 10px 32px rgba(0, 0, 0, 0.9)", overflowY: "auto", alignSelf: "center",
    });

    // Header row (Name + Stats)
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px",
    });

    this.titleNode = document.createElement("div");
    Object.assign(this.titleNode.style, {
      fontSize: "17px", fontWeight: "bold", color: "#ffd700", lineHeight: "1.3", letterSpacing: "0.2px",
    });

    this.statsNode = document.createElement("div");
    Object.assign(this.statsNode.style, {
      fontSize: "13px", fontWeight: "bold", backgroundColor: "#243342", color: "#ffffff",
      padding: "3px 8px", borderRadius: "5px", flexShrink: "0", border: "1px solid rgba(255, 255, 255, 0.25)",
    });

    header.appendChild(this.titleNode);
    header.appendChild(this.statsNode);

    // Meta row (Type, Brigade, Alignment)
    this.metaNode = document.createElement("div");
    Object.assign(this.metaNode.style, {
      fontSize: "12.5px", color: "#94a3b8", lineHeight: "1.4",
      borderBottom: "1px solid rgba(255, 255, 255, 0.12)", paddingBottom: "8px",
    });

    // Special Ability
    this.abilityNode = document.createElement("div");
    Object.assign(this.abilityNode.style, {
      fontSize: "14.5px", lineHeight: "1.55", color: "#f8fafc",
      whiteSpace: "pre-wrap", flex: "0 1 auto", overflowY: "auto",
    });

    // Reference
    this.referenceNode = document.createElement("div");
    Object.assign(this.referenceNode.style, {
      fontSize: "12px", fontStyle: "italic", color: "#94a3b8",
      borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "8px",
    });

    // Close hint
    this.hintNode = document.createElement("div");
    this.hintNode.textContent = "Tap anywhere to close";
    Object.assign(this.hintNode.style, {
      fontSize: "11px", color: "#64748b", textAlign: "center", marginTop: "2px",
    });

    this.panelNode.appendChild(header);
    this.panelNode.appendChild(this.metaNode);
    this.panelNode.appendChild(this.abilityNode);
    this.panelNode.appendChild(this.referenceNode);
    this.panelNode.appendChild(this.hintNode);

    this.wrapperNode.appendChild(this.imgNode);
    this.wrapperNode.appendChild(this.panelNode);
    this.overlayNode.appendChild(this.wrapperNode);
    document.body.appendChild(this.overlayNode);
  }

  public setImageSource(targetSrc: string): void {
    if (!this.imgNode) return;
    const resolvedUrl = new URL(targetSrc, window.location.href).href;
    if (this.imgNode.src === resolvedUrl && this.imgNode.style.visibility === "visible") {
      return;
    }

    const currentImg = this.imgNode;

    // Check if the image is already completely cached/decoded in memory
    const probe = new Image();
    probe.src = resolvedUrl;

    if (probe.complete && probe.naturalWidth > 0) {
      currentImg.src = resolvedUrl;
      currentImg.style.visibility = "visible";
      return;
    }

    // Show cardback placeholder while loading instead of empty gap
    if (!currentImg.src || currentImg.src.endsWith("cardback.jpg")) {
      currentImg.src = new URL("/assets/cards/cardback.jpg", window.location.href).href;
      currentImg.style.visibility = "visible";
    }

    // Pre-decode before swapping to eliminate delay and layout jank
    probe.decode?.().then(() => {
      if (this.imgNode === currentImg) {
        currentImg.src = resolvedUrl;
        currentImg.style.visibility = "visible";
      }
    }).catch(() => {
      currentImg.onload = () => {
        if (currentImg.src === resolvedUrl) {
          currentImg.style.visibility = "visible";
        }
      };
      currentImg.onerror = () => {
        currentImg.style.visibility = "visible";
      };
      currentImg.src = resolvedUrl;
    });
  }

  public applyModalStyles(): void {
    if (!this.overlayNode || !this.wrapperNode || !this.imgNode || !this.panelNode || !this.hintNode) return;
    Object.assign(this.overlayNode.style, {
      backgroundColor: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)",
      webkitBackdropFilter: "blur(4px)", pointerEvents: "auto",
      alignItems: "center", justifyContent: "center", padding: "12px",
    });

    Object.assign(this.wrapperNode.style, {
      position: "static", flexDirection: "row",
    });

    Object.assign(this.imgNode.style, {
      maxHeight: "92vh", maxWidth: "42vw", height: "auto", width: "auto",
    });

    Object.assign(this.panelNode.style, {
      maxHeight: "92vh", width: "min(380px, 50vw)", height: "auto", padding: "12px 14px",
    });

    this.hintNode.style.display = "block";
  }

  public applyFloatingStyles(
    isLeft: boolean, targetLeft: number, targetTop: number, targetHeight: number, panelWidth: number
  ): void {
    if (!this.overlayNode || !this.wrapperNode || !this.imgNode || !this.panelNode || !this.hintNode) return;
    Object.assign(this.overlayNode.style, {
      backgroundColor: "transparent", backdropFilter: "none", webkitBackdropFilter: "none",
      pointerEvents: "none", padding: "0",
    });
    this.hintNode.style.display = "none";

    Object.assign(this.wrapperNode.style, {
      position: "absolute", left: `${Math.round(targetLeft)}px`, top: `${Math.round(targetTop)}px`,
      flexDirection: isLeft ? "row" : "row-reverse",
    });

    Object.assign(this.imgNode.style, {
      height: `${Math.round(targetHeight)}px`, width: "auto", maxHeight: "none", maxWidth: "none",
    });

    Object.assign(this.panelNode.style, {
      height: "auto", maxHeight: `${Math.round(targetHeight)}px`,
      width: `${Math.round(panelWidth)}px`, padding: "16px 18px",
    });
  }

  public destroy(): void {
    if (this.overlayNode?.parentNode) {
      this.overlayNode.parentNode.removeChild(this.overlayNode);
    }
    this.overlayNode = null;
    this.wrapperNode = null;
    this.imgNode = null;
    this.panelNode = null;
    this.titleNode = null;
    this.statsNode = null;
    this.metaNode = null;
    this.abilityNode = null;
    this.referenceNode = null;
    this.hintNode = null;
  }
}
