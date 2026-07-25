import type { DeckMetadata } from "../../types/DeckMetadata";
import { BRIGADE_COLORS } from "../../config/BrigadeConfig";
import { DeckMetricsOverlayManager } from "../managers/DeckMetricsOverlayManager";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { log, error } from "../../utils/logger";

export const TROPHY_THRESHOLDS = {
  BRONZE: 15,
  SILVER: 30,
  GOLD: 45,
};

export interface LocalDecksGridCallbacks {
  onOpenDeckEditor: (deck: DeckMetadata) => void;
  onStartBattle: (deck: DeckMetadata) => void;
  onSelectChampions: (deck: DeckMetadata) => void;
  onDeckRenamed?: (deck: DeckMetadata, newName: string) => void;
}

export class LocalDecksGridUI {
  private containerEl: HTMLElement | null = null;
  private db: LocalDecksDB;
  private templateNode: HTMLElement | null = null;

  constructor() {
    this.db = new LocalDecksDB();
    this.ensureStylesheetLoaded();
  }

  private async getTemplateNode(): Promise<HTMLElement> {
    if (this.templateNode) {
      return this.templateNode.cloneNode(true) as HTMLElement;
    }

    try {
      const resp = await fetch(`templates/deckTile.html?v=${Date.now()}`);
      const html = await resp.text();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html.trim();
      const tileEl = wrapper.querySelector(".deck-tile") as HTMLElement;
      this.templateNode = tileEl || (wrapper.firstElementChild as HTMLElement);
      return this.templateNode.cloneNode(true) as HTMLElement;
    } catch (err) {
      error("LocalDecksGridUI", "Failed to fetch deckTile.html template", err);
      return this.createFallbackTile();
    }
  }

  private createFallbackTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "deck-tile";
    return tile;
  }

  public async render(
    scene: Phaser.Scene,
    decks: DeckMetadata[],
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): Promise<void> {
    this.destroy();

    this.containerEl = document.createElement("div");
    this.containerEl.id = "local-decks-grid-container";
    this.containerEl.className = "local-decks-grid-container";

    if (decks.length === 0) {
      const emptyText = document.createElement("div");
      emptyText.className = "local-decks-empty-text";
      emptyText.innerText = "No decks found in storage.";
      this.containerEl.appendChild(emptyText);
    } else {
      for (const deck of decks) {
        const tile = await this.createTile(scene, deck, cardDatabase, callbacks);
        this.containerEl.appendChild(tile);
      }
    }

    document.body.appendChild(this.containerEl);
  }

  public setVisible(visible: boolean): void {
    if (this.containerEl) {
      this.containerEl.style.display = visible ? "grid" : "none";
    }
  }

  public destroy(): void {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }

  private async createTile(
    scene: Phaser.Scene,
    deck: DeckMetadata,
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): Promise<HTMLElement> {
    const tile = await this.getTemplateNode();
    const totalWins = (deck.stats?.wins?.full || 0) + (deck.stats?.wins?.partial || 0);
    const tierClass = this.getTierClass(totalWins);
    tile.className = `deck-tile ${tierClass}`;

    // 1. Header
    const titleSpan = tile.querySelector(".deck-tile-title") as HTMLElement;
    if (titleSpan) {
      titleSpan.innerText = deck.name;
    }

    const editBtn = tile.querySelector(".deck-tile-edit-btn") as HTMLButtonElement;
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (titleSpan) this.enableInlineRename(titleSpan, deck, callbacks);
      };
    }

    // 2. Banner Medallion (Center)
    const evilCard = cardDatabase.find((c) => c.id === deck.visuals?.evilCharacterCardId);
    const heroCard = cardDatabase.find((c) => c.id === deck.visuals?.heroCharacterCardId);

    const bgUrl = evilCard ? `assets/cards/${evilCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";
    const heroUrl = heroCard ? `assets/cards/${heroCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";

    const banner = tile.querySelector(".deck-tile-banner") as HTMLElement;
    if (banner) {
      banner.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url('${bgUrl}')`;
    }

    const medallion = tile.querySelector(".deck-tile-medallion") as HTMLElement;
    if (medallion) {
      medallion.style.backgroundImage = `url('${heroUrl}')`;
    }

    const metricsBtn = tile.querySelector(".deck-tile-metrics-btn") as HTMLButtonElement;
    if (metricsBtn) {
      metricsBtn.onclick = (e) => {
        e.stopPropagation();
        this.openMetrics(scene, deck, cardDatabase);
      };
    }

    const champsBtn = tile.querySelector(".deck-tile-champs-btn") as HTMLButtonElement;
    if (champsBtn) {
      champsBtn.onclick = (e) => {
        e.stopPropagation();
        callbacks.onSelectChampions(deck);
      };
    }

    // 3. Footer: Brigades
    const brigadesContainer = tile.querySelector(".deck-tile-brigades") as HTMLElement;
    if (brigadesContainer) {
      brigadesContainer.innerHTML = "";
      (deck.brigades || []).slice(0, 6).forEach((bName) => {
        const gem = document.createElement("span");
        gem.className = "brigade-gem";
        const hex = BRIGADE_COLORS[bName] ?? 0x808080;
        const hexStr = hex.toString(16).padStart(6, "0");
        gem.style.backgroundColor = `#${hexStr}`;
        gem.style.backgroundImage = "linear-gradient(to bottom, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 60%)";
        gem.style.boxShadow = `inset -2px -2px 4px rgba(0,0,0,0.5), 0 0 6px #${hexStr}`;
        gem.title = bName;
        brigadesContainer.appendChild(gem);
      });
    }

    // 4. Footer: Stats & Counts
    const statsContainer = tile.querySelector(".deck-tile-stats") as HTMLElement;
    if (statsContainer) {
      const fullWins = deck.stats?.wins?.full || 0;
      const partialWins = deck.stats?.wins?.partial || 0;
      const fullLosses = deck.stats?.losses?.full || 0;
      const partialLosses = deck.stats?.losses?.partial || 0;
      const t = deck.stats?.ties || 0;
      statsContainer.innerText = `W:${fullWins}/${partialWins} L:${fullLosses}/${partialLosses} T:${t} | M:${deck.cardCount?.main || 0} R:${deck.cardCount?.reserve || 0}`;
    }

    // 5. Action Buttons (Smith & Battle)
    const smithBtn = tile.querySelector(".deck-action-btn.smith") as HTMLButtonElement;
    if (smithBtn) {
      smithBtn.onclick = () => callbacks.onOpenDeckEditor(deck);
    }

    const battleBtn = tile.querySelector(".deck-action-btn.battle") as HTMLButtonElement;
    if (battleBtn) {
      battleBtn.onclick = () => callbacks.onStartBattle(deck);
    }

    return tile;
  }

  private async enableInlineRename(
    titleSpan: HTMLElement,
    deck: DeckMetadata,
    callbacks: LocalDecksGridCallbacks
  ) {
    const currentName = deck.name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "deck-tile-title-input";
    input.value = currentName;

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    const saveName = async () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        deck.name = newName;
        await this.db.saveCachedMetadata(deck);
        if (callbacks.onDeckRenamed) callbacks.onDeckRenamed(deck, newName);
      }
      const newSpan = document.createElement("span");
      newSpan.className = "deck-tile-title";
      newSpan.innerText = deck.name;
      input.replaceWith(newSpan);
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter") saveName();
      if (e.key === "Escape") {
        const newSpan = document.createElement("span");
        newSpan.className = "deck-tile-title";
        newSpan.innerText = currentName;
        input.replaceWith(newSpan);
      }
    };
    input.onblur = saveName;
  }

  private openMetrics(scene: Phaser.Scene, deck: DeckMetadata, cardDatabase: any[]) {
    this.db.getVirtualDeck(deck.name).then((wrapped) => {
      const allIds = wrapped?.deckData
        ? [...(wrapped.deckData.main || []), ...(wrapped.deckData.reserve || [])]
        : (deck.cardIds || []);

      const cardList = allIds
        .map((id) => cardDatabase.find((c) => c.id === id || c.Name === id || c.ImageFile === id))
        .filter(Boolean);

      DeckMetricsOverlayManager.showMetrics(scene, cardList);
    });
  }

  private getTierClass(wins: number): string {
    if (wins >= TROPHY_THRESHOLDS.GOLD) return "tier-gold";
    if (wins >= TROPHY_THRESHOLDS.SILVER) return "tier-silver";
    if (wins >= TROPHY_THRESHOLDS.BRONZE) return "tier-bronze";
    return "tier-stone";
  }

  private ensureStylesheetLoaded(): void {
    if (document.getElementById("deck-tile-template-style")) return;

    const link = document.createElement("link");
    link.id = "deck-tile-template-style";
    link.rel = "stylesheet";
    link.href = "templates/deckTile.css";
    document.head.appendChild(link);
  }
}
