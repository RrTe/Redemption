import * as Phaser from "phaser";
import { DeckListModel } from "./DeckListModel";
import { log, error } from "../../utils/logger";

export class CardMetricsOverlay {
  private scene: Phaser.Scene;
  private overlayNode: HTMLElement | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public show(
    card: any,
    deckListModel: DeckListModel,
    x: number,
    y: number,
    align: "left" | "right" = "right"
  ) {
    if (!this.overlayNode) {
      log("CardMetricsOverlay", "Retrieve HTML template from Phaser Cache...");
      const htmlText = this.scene.cache.html.get("cardMetrics") as string | undefined;
      if (!htmlText) {
        error("CardMetricsOverlay", "ERROR: 'cardMetrics' HTML template not found in Phaser cache!");
        return;
      }

      log("CardMetricsOverlay", "Parsing HTML template and appending directly to document.body...");
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");
      const element = doc.getElementById("cardMetrics");
      
      if (!element) {
        error("CardMetricsOverlay", "ERROR: Element with ID 'cardMetrics' not found in parsed HTML!");
        return;
      }

      this.overlayNode = element;
      this.overlayNode.style.position = "fixed";
      this.overlayNode.style.zIndex = "999999";
      this.overlayNode.style.pointerEvents = "none"; // Ensure clicks pass through to the game canvas
      this.overlayNode.style.display = "none";
      
      document.body.appendChild(this.overlayNode);
      log("CardMetricsOverlay", "Successfully appended DOM node to document.body.", this.overlayNode);
    }

    // Check if the deck is empty (just like standalone !this.deckList.deckEmpty())
    const isDeckEmpty = deckListModel.deck.length === 0 && deckListModel.reserve.length === 0;

    // Check if the card has metrics
    const METRIC_TYPES = ["Hero", "Evil Character", "DAC", "GE", "EE", "DAE", "Covenant", "Curse"];
    const cardType = card.Type || [];
    const hasMetrics = !isDeckEmpty && METRIC_TYPES.some((t) =>
      Array.isArray(cardType) ? cardType.includes(t) : cardType === t
    );

    if (hasMetrics) {
      this.fillCardMetrics(card, deckListModel);
      
      // Convert Phaser game coordinates to browser viewport CSS pixels
      const canvas = this.scene.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const gameWidth = this.scene.scale.width || 1280;
      const gameHeight = this.scene.scale.height || 720;
      const scaleX = rect.width / gameWidth;
      const scaleY = rect.height / gameHeight;

      // Force display style temporarily to measure its actual CSS offsetWidth
      this.overlayNode.style.display = "grid";
      const overlayWidth = this.overlayNode.offsetWidth || 300;

      let screenX = rect.left + (x * scaleX);
      if (align === "left") {
        screenX -= overlayWidth;
      }
      const screenY = rect.top + (y * scaleY);

      // Fixed positioning on viewport relative to window
      this.overlayNode.style.left = `${screenX}px`;
      this.overlayNode.style.top = `${screenY}px`;
      
    } else {
      this.hide();
    }
  }

  public hide() {
    if (this.overlayNode) {
      this.overlayNode.style.display = "none";
    }
  }

  public destroy() {
    log("CardMetricsOverlay", "destroy() called. Removing element from document.body...");
    if (this.overlayNode && this.overlayNode.parentNode) {
      this.overlayNode.parentNode.removeChild(this.overlayNode);
      this.overlayNode = null;
    }
  }

  private fillCardMetrics(card: any, deckListModel: DeckListModel) {
    if (!this.overlayNode) return;

    const checkTypeSet = new Set<string>();
    let caption = "";

    const types = Array.isArray(card.Type) ? card.Type : [card.Type];

    if (types.includes("DAE")) {
      ["Hero", "DAC", "Evil Character"].forEach(t => checkTypeSet.add(t));
    }
    if (types.includes("GE") || types.includes("Covenant")) {
      ["Hero", "DAC"].forEach(t => checkTypeSet.add(t));
    }
    if (types.includes("EE") || types.includes("Curse")) {
      ["Evil Character", "DAC"].forEach(t => checkTypeSet.add(t));
    }
    if (types.includes("Hero") || types.includes("DAC")) {
      ["GE", "DAE", "Covenant"].forEach(t => checkTypeSet.add(t));
    }
    if (types.includes("Evil Character")) {
      ["EE", "DAE", "Curse"].forEach(t => checkTypeSet.add(t));
    }

    const checkType = Array.from(checkTypeSet);

    if (
      types.includes("DAE") ||
      types.includes("GE") ||
      types.includes("Covenant") ||
      types.includes("EE") ||
      types.includes("Curse")
    ) {
      caption = "Characters to use with in";
    } else if (
      types.includes("Hero") ||
      types.includes("DAC") ||
      types.includes("Evil Character")
    ) {
      caption = "Enhancements for this Character in";
    }

    const cardsInDeck = this.countMatchingCards(card, deckListModel.deck, checkType);
    const cardsInReserve = this.countMatchingCards(card, deckListModel.reserve, checkType);

    const totalDeck = deckListModel.deck.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalReserve = deckListModel.reserve.reduce((sum, item) => sum + (item.quantity || 1), 0);

    const qs = (id: string) => this.overlayNode!.querySelector(id) as HTMLElement;

    if (qs("#metricsCaption")) qs("#metricsCaption").textContent = caption;
    if (qs("#deckValue")) qs("#deckValue").textContent = cardsInDeck.toString();
    if (qs("#reserveValue")) qs("#reserveValue").textContent = cardsInReserve.toString();
    
    if (qs("#deckPercentage")) {
      const pct = cardsInDeck === 0 || totalDeck === 0 ? 0 : Math.round((cardsInDeck / totalDeck) * 100);
      qs("#deckPercentage").textContent = pct.toString();
    }
    if (qs("#reservePercentage")) {
      const pct = cardsInReserve === 0 || totalReserve === 0 ? 0 : Math.round((cardsInReserve / totalReserve) * 100);
      qs("#reservePercentage").textContent = pct.toString();
    }
  }

  private countMatchingCards(card: any, pile: any[], checkType: string[]) {
    let amount = 0;

    // Helper to get sides array or fallback to a single simulated side object
    const getSides = (c: any) => {
      if (c.sides && c.sides.length > 0) return c.sides;
      return [{
        Alignment: Array.isArray(c.Alignment) ? c.Alignment[0] : c.Alignment,
        Type: Array.isArray(c.Type) ? c.Type : [c.Type],
        Brigade: Array.isArray(c.Brigade) ? c.Brigade : [c.Brigade]
      }];
    };

    const cardSides = getSides(card);

    pile.forEach((item) => {
      const c = item.card || item;
      const q = item.quantity || 1;
      
      const targetSides = getSides(c);

      // Check if any side of the current card is compatible with any side of the target card
      const isCompatible = cardSides.some((sideA: any) => {
        const typeA = Array.isArray(sideA.Type) ? sideA.Type : [sideA.Type];
        const alignmentA = sideA.Alignment;
        const brigadesA = Array.isArray(sideA.Brigade) ? sideA.Brigade : (sideA.Brigade ? [sideA.Brigade] : []);

        return targetSides.some((sideB: any) => {
          const typeB = Array.isArray(sideB.Type) ? sideB.Type : [sideB.Type];
          const alignmentB = sideB.Alignment;
          const brigadesB = Array.isArray(sideB.Brigade) ? sideB.Brigade : (sideB.Brigade ? [sideB.Brigade] : []);

          // 1. One is a character and one is an enhancement
          const typeMatch = checkType.some((val) => typeB.includes(val));
          if (!typeMatch) return false;

          // 2. Alignments match (same side: Good/Good or Evil/Evil)
          if (alignmentA !== alignmentB) return false;

          // 3. Brigade match (either one is Multi, or they share a color)
          const hasMulti = brigadesA.includes("Multi") || brigadesB.includes("Multi");
          const sharesColor = brigadesA.some((col: string) => brigadesB.includes(col));

          return hasMulti || sharesColor;
        });
      });

      if (isCompatible) {
        amount += q;
      }
    });

    return amount;
  }
}
