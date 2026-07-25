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

  constructor() {
    this.db = new LocalDecksDB();
    this.injectStyles();
  }

  public render(
    scene: Phaser.Scene,
    decks: DeckMetadata[],
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): void {
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
      decks.forEach((deck) => {
        const tile = this.createTile(scene, deck, cardDatabase, callbacks);
        this.containerEl?.appendChild(tile);
      });
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

  private createTile(
    scene: Phaser.Scene,
    deck: DeckMetadata,
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): HTMLElement {
    const tile = document.createElement("div");
    const totalWins = (deck.stats?.wins?.full || 0) + (deck.stats?.wins?.partial || 0);
    const tierClass = this.getTierClass(totalWins);
    tile.className = `deck-tile ${tierClass}`;

    // 1. Header
    const header = document.createElement("div");
    header.className = "deck-tile-header";

    const titleSpan = document.createElement("span");
    titleSpan.className = "deck-tile-title";
    titleSpan.innerText = deck.name;

    const editBtn = document.createElement("button");
    editBtn.className = "deck-tile-edit-btn";
    editBtn.innerHTML = "🖉";
    editBtn.title = "Rename Deck";

    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.enableInlineRename(titleSpan, deck, callbacks);
    };

    header.appendChild(titleSpan);
    header.appendChild(editBtn);
    tile.appendChild(header);

    // 2. Banner Medallion (Center)
    const banner = this.createBanner(scene, deck, cardDatabase, callbacks);
    tile.appendChild(banner);

    // 3. Footer
    const footer = this.createFooter(deck, callbacks);
    tile.appendChild(footer);

    return tile;
  }

  private createBanner(
    scene: Phaser.Scene,
    deck: DeckMetadata,
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): HTMLElement {
    const banner = document.createElement("div");
    banner.className = "deck-tile-banner";

    const evilCard = cardDatabase.find((c) => c.id === deck.visuals?.evilCharacterCardId);
    const heroCard = cardDatabase.find((c) => c.id === deck.visuals?.heroCharacterCardId);

    const bgUrl = evilCard ? `assets/cards/${evilCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";
    const heroUrl = heroCard ? `assets/cards/${heroCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";

    banner.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url('${bgUrl}')`;

    // Center Medallion
    const medallion = document.createElement("div");
    medallion.className = "deck-tile-medallion";
    medallion.style.backgroundImage = `url('${heroUrl}')`;
    banner.appendChild(medallion);

    // Action Icons Overlay (Metrics 📊 & Champions 👑)
    const actionsOverlay = document.createElement("div");
    actionsOverlay.className = "deck-tile-banner-actions";

    const metricsBtn = document.createElement("button");
    metricsBtn.className = "deck-banner-action-btn";
    metricsBtn.innerHTML = "📊";
    metricsBtn.title = "Deck Metrics";
    metricsBtn.onclick = (e) => {
      e.stopPropagation();
      this.openMetrics(scene, deck, cardDatabase);
    };

    const champsBtn = document.createElement("button");
    champsBtn.className = "deck-banner-action-btn";
    champsBtn.innerHTML = "👑";
    champsBtn.title = "Select Champions";
    champsBtn.onclick = (e) => {
      e.stopPropagation();
      callbacks.onSelectChampions(deck);
    };

    actionsOverlay.appendChild(metricsBtn);
    actionsOverlay.appendChild(champsBtn);
    banner.appendChild(actionsOverlay);

    return banner;
  }

  private createFooter(deck: DeckMetadata, callbacks: LocalDecksGridCallbacks): HTMLElement {
    const footer = document.createElement("div");
    footer.className = "deck-tile-footer";

    // Left: Brigades
    const brigadesContainer = document.createElement("div");
    brigadesContainer.className = "deck-tile-brigades";

    // const brigadesLabel = document.createElement("span");
    // brigadesLabel.className = "deck-tile-brigades-label";
    // brigadesLabel.innerText = "Brigades:";
    // brigadesContainer.appendChild(brigadesLabel);

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
    footer.appendChild(brigadesContainer);

    // Right: Stats & Counts
    const statsContainer = document.createElement("div");
    statsContainer.className = "deck-tile-stats";
    const w = (deck.stats?.wins?.full || 0) + (deck.stats?.wins?.partial || 0);
    const l = (deck.stats?.losses?.full || 0) + (deck.stats?.losses?.partial || 0);
    const t = deck.stats?.ties || 0;
    statsContainer.innerText = `W:${w} L:${l} T:${t} | M:${deck.cardCount?.main || 0} R:${deck.cardCount?.reserve || 0}`;
    footer.appendChild(statsContainer);

    // Bottom Action Buttons (Deck Smith & Battle)
    const btnContainer = document.createElement("div");
    btnContainer.className = "deck-tile-btn-group";

    const smithBtn = document.createElement("button");
    smithBtn.className = "deck-action-btn smith";
    smithBtn.innerHTML = "⚒️ Deck Smith";
    smithBtn.onclick = () => callbacks.onOpenDeckEditor(deck);

    const battleBtn = document.createElement("button");
    battleBtn.className = "deck-action-btn battle";
    battleBtn.innerHTML = "⚔️ Battle";
    battleBtn.onclick = () => callbacks.onStartBattle(deck);

    btnContainer.appendChild(smithBtn);
    btnContainer.appendChild(battleBtn);
    footer.appendChild(btnContainer);

    return footer;
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

  private injectStyles(): void {
    if (document.getElementById("local-decks-grid-styles")) return;

    const style = document.createElement("style");
    style.id = "local-decks-grid-styles";
    style.innerHTML = `
      .local-decks-grid-container {
        position: fixed; top: 90px; left: 5%; width: 90%; height: calc(100% - 150px);
        overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
        gap: 20px; z-index: 1000; padding-bottom: 20px; box-sizing: border-box;
      }
      .local-decks-empty-text { color: #aaa; font-family: sans-serif; font-size: 18px; grid-column: 1 / -1; text-align: center; margin-top: 50px; }
      .deck-tile { border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; color: #fff; font-family: sans-serif; box-sizing: border-box; background-size: 100% 100%; background-position: center; background-repeat: no-repeat; box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.65); }
      .tier-stone { border: 2px solid #555; background-image: url('assets/backgrounds/stocksnap-grey-2620586_640.jpg'); }
      .tier-bronze { border: 2px solid #cd7f32; background-image: url('assets/backgrounds/Bronze.jpg'); box-shadow: 0 0 10px rgba(205,127,50,0.3); }
      .tier-silver { border: 2px solid #c0c0c0; background-image: url('assets/backgrounds/Silver.jpg'); }
      .tier-gold { border: 2px solid #ffd700; background-image: url('assets/backgrounds/Gold.jpg'); transform: translateZ(0); will-change: opacity, box-shadow; animation: goldPulse 2.5s infinite ease-in-out; }
      @keyframes goldPulse { 0%, 100% { box-shadow: 0 0 12px rgba(255,215,0,0.4); } 50% { box-shadow: 0 0 22px rgba(255,215,0,0.8); } }
      .deck-tile-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 18px; color: #ffd83a; text-shadow: 1px 1px 2px #000000; background: rgba(15, 15, 15, 0.65); border-radius: 4px; padding: 3px 8px 3px 12px; box-sizing: border-box; width: 100%; gap: 8px; }
      .deck-tile-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; cursor: default; }
      .deck-tile-edit-btn { background: none; border: none; color: #aaa; cursor: pointer; font-size: 18px; text-shadow: 1px 1px 2px #000; flex-shrink: 0; margin-left: auto; padding: 0; line-height: 1; display: flex; align-items: center; }
      .deck-tile-edit-btn:hover { color: #fff; }
      .deck-tile-title-input { background: #222; border: 1px solid #ffd83a; color: #fff; font-size: 14px; padding: 2px 5px; border-radius: 4px; width: 80%; }
      .deck-tile-banner { height: 145px; border-radius: 8px; background-size: cover; background-position: top center; position: relative; display: flex; justify-content: center; align-items: center; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0px 5px 8px rgba(0, 0, 0, 0.65); }
      .deck-tile-medallion { width: 115px; height: 115px; border-radius: 50%; border: 3px solid #b8860b; background-size: cover; background-position: top center; box-shadow: 0px 5px 12px rgba(0, 0, 0, 0.85), 0 0 10px rgba(255,215,0,0.3); transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .deck-tile-medallion:hover { transform: scale(1.04) translateY(-2px); box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.9), 0 0 16px rgba(255,215,0,0.6); }
      .deck-tile-banner-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 6px; }
      .deck-banner-action-btn { background: rgba(0,0,0,0.7); border: 1px solid #b8860b; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; justify-content: center; align-items: center; font-size: 14px; box-shadow: 0px 3px 6px rgba(0,0,0,0.6); }
      .deck-banner-action-btn:hover { transform: scale(1.1); background: rgba(0,0,0,0.9); }
      .deck-tile-footer { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
      .deck-tile-brigades { display: flex; align-items: center; gap: 6px; }
      .brigade-gem { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.8); box-sizing: border-box; }
      .deck-tile-stats { color: #ffd83a; font-size: 15px; font-weight: bold; text-shadow: 1px 1px 2px #000000; background: rgba(15, 15, 15, 0.65); border-radius: 4px; padding: 4px 10px; box-sizing: border-box; width: 100%; text-align: center; }
      .deck-tile-btn-group { display: flex; gap: 8px; margin-top: 4px; }
      .deck-action-btn { flex: 1; padding: 8px 10px; border: 1px solid #b8860b; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; font-family: 'FairyDust', 'Georgia', serif, sans-serif; color: #ffd83a; text-shadow: 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000; box-shadow: 0 4px 6px rgba(0,0,0,0.6); transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease; }
      .deck-action-btn.smith { background: linear-gradient(180deg, #b8860b 0%, #684a04 100%); }
      .deck-action-btn.smith:hover { background: linear-gradient(180deg, #daa520 0%, #8b6508 100%); transform: scale(1.02); box-shadow: 0 0 8px rgba(218,165,32,0.6); }
      .deck-action-btn.battle { background: linear-gradient(180deg, #8b0000 0%, #4a0000 100%); }
      .deck-action-btn.battle:hover { background: linear-gradient(180deg, #b22222 0%, #660000 100%); transform: scale(1.02); box-shadow: 0 0 8px rgba(178,34,34,0.6); }
    `;
    document.head.appendChild(style);
  }
}
