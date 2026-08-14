import type { DeckMetadata } from "../../types/DeckMetadata";
import { BRIGADE_COLORS, GOOD_BRIGADES, EVIL_BRIGADES } from "../../config/BrigadeConfig";
import { DeckMetricsOverlayManager } from "../managers/DeckMetricsOverlayManager";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { LocalDeckScanner } from "../../managers/LocalDeckScanner";
import { log, error } from "../../utils/logger";
import { DECK_VALIDATION_RULES } from "../../../../shared/deck-validation-rules.js";
import { DeckValidator } from "../../../../shared/DeckValidator.js";
import { ConfirmationDialog } from "../notifications/ConfirmationDialog";
import { CardRepository } from "../../../../shared/CardRepository.js";

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
  onDeckDeleted?: (deck: DeckMetadata) => void;
}

export class LocalDecksGridUI {
  private containerEl: HTMLElement | null = null;
  private db: LocalDecksDB;
  private scanner: LocalDeckScanner;
  private templateNode: HTMLElement | null = null;

  constructor() {
    this.db = new LocalDecksDB();
    this.scanner = new LocalDeckScanner([]);
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

  private currentScene: Phaser.Scene | null = null;
  private currentRenderId: number = 0;

  public async render(
    scene: Phaser.Scene,
    decks: DeckMetadata[],
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks,
    options?: { isPrebuilt?: boolean }
  ): Promise<void> {
    const renderId = ++this.currentRenderId;
    this.destroy();
    this.currentScene = scene;

    const container = document.createElement("div");
    container.id = "local-decks-grid-container";
    container.className = "local-decks-grid-container";
    this.containerEl = container;

    this.updateContainerBounds(scene);

    if (!CardRepository.isInitialized && cardDatabase && cardDatabase.length > 0) {
      CardRepository.initialize(cardDatabase);
    }

    if (decks.length === 0) {
      const emptyText = document.createElement("div");
      emptyText.className = "local-decks-empty-text";
      emptyText.innerText = "No decks found matching the selected filter.";
      container.appendChild(emptyText);
    } else {
      // Pre-fetch template node ONCE so all tiles clone synchronously without network delay
      await this.getTemplateNode();

      if (options?.isPrebuilt) {
        const categories = [
          { id: "Starter", title: "🔰 STARTER DECKS" },
          { id: "Contender", title: "🛡️ CONTENDER DECKS" },
          { id: "Challenger", title: "🏆 CHALLENGER DECKS" },
          { id: "Champion", title: "👑 CHAMPION DECKS" },
        ];

        for (const cat of categories) {
          const categoryDecks = decks.filter(
            (d) => (d.category || "Starter").toLowerCase() === cat.id.toLowerCase()
          );

          if (categoryDecks.length > 0) {
            const headerEl = document.createElement("div");
            headerEl.className = "prebuild-section-header";
            headerEl.innerHTML = `
              <span class="prebuild-section-title">${cat.title}</span>
              <div class="prebuild-section-line"></div>
            `;
            container.appendChild(headerEl);

            for (const deck of categoryDecks) {
              if (this.currentRenderId !== renderId) {
                container.remove();
                return;
              }
              const tile = this.createTileSync(scene, deck, cardDatabase, callbacks);
              container.appendChild(tile);
            }
          }
        }
      } else {
        for (const deck of decks) {
          if (this.currentRenderId !== renderId) {
            container.remove();
            return;
          }
          const tile = this.createTileSync(scene, deck, cardDatabase, callbacks);
          container.appendChild(tile);
        }
      }
    }

    if (this.currentRenderId === renderId) {
      document.body.appendChild(container);
    } else {
      container.remove();
    }
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
    const orphanContainers = document.querySelectorAll("#local-decks-grid-container");
    orphanContainers.forEach((el) => el.remove());
    this.currentScene = null;
  }

  public updateContainerBounds(scene?: Phaser.Scene): void {
    const sc = scene || this.currentScene;
    if (!this.containerEl || !sc) return;

    const canvas = sc.game.canvas;
    if (canvas && sc.scale && sc.scale.height > 0) {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.max(0.85, sc.scale.width / 1280);
      const nativeTop = 152 * scale; // Dynamic bottom of lower bar panel
      const topPx = Math.round(bounds.top + (nativeTop / sc.scale.height) * bounds.height);
      const footerOffset = 50; // 35px footer bar + 15px spacing
      const maxBottomPx = Math.round(bounds.top + bounds.height - footerOffset);
      const heightPx = Math.max(150, maxBottomPx - topPx);

      this.containerEl.style.top = `${topPx}px`;
      this.containerEl.style.height = `${heightPx}px`;
    }
  }

  private createTileSync(
    scene: Phaser.Scene,
    deck: DeckMetadata,
    cardDatabase: any[],
    callbacks: LocalDecksGridCallbacks
  ): HTMLElement {
    const tile = this.templateNode ? (this.templateNode.cloneNode(true) as HTMLElement) : this.createFallbackTile();
    const totalWins = (deck.stats?.wins?.full || 0) + (deck.stats?.wins?.partial || 0);
    const tierClass = this.getTierClass(totalWins);
    const isReadOnly = Boolean(deck.category && deck.category.toLowerCase() !== "local");
    const catKey = (deck.category || "starter").toLowerCase();
    const prebuiltClass = isReadOnly ? `prebuild-deck-tile prebuild-cat-${catKey} is-read-only` : "";
    tile.className = `deck-tile ${tierClass} ${prebuiltClass}`;

    // 1. Header
    const titleSpan = tile.querySelector(".deck-tile-title") as HTMLElement;
    if (titleSpan) {
      titleSpan.innerText = deck.name;
    }

    const deleteBtn = tile.querySelector(".deck-tile-delete-btn") as HTMLButtonElement;
    if (deleteBtn && !isReadOnly) {
      this.db.getDirectoryHandle("target_dir").then((targetDir) => {
        const hasDiskFolder = "showDirectoryPicker" in window && !!targetDir;
        deleteBtn.title = hasDiskFolder
          ? "Delete Deck from Local List & Disk"
          : "Delete Deck from Local List";
      });

      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const hasDiskFolder = "showDirectoryPicker" in window && !!(await this.db.getDirectoryHandle("target_dir"));

        const noteHtml = hasDiskFolder
          ? `<div style="margin-top: 14px; font-size: 14px; color: #f5e6c8; text-shadow: 0 1px 3px rgba(0,0,0,0.9); line-height: 1.45;">⚠️ <b><i>Note: The corresponding file will also be deleted from your linked local deck folder on your disk.</i></b></div>`
          : `<div style="margin-top: 14px; font-size: 14px; color: #f5e6c8; text-shadow: 0 1px 3px rgba(0,0,0,0.9); line-height: 1.45;">💡 <b><i>Note: The deck will be deleted from your local deck list.</i></b></div>`;

        const messageText = `<div>Are you sure you want to delete the deck <b>"${deck.name}"</b>?</div>${noteHtml}`;

        new ConfirmationDialog({
          title: "Delete Deck",
          message: messageText,
          confirmLabel: "OK",
          cancelLabel: "Cancel",
          severity: "warning",
          onConfirm: async () => {
            try {
              await this.db.deleteDeck(deck.name);
              if (hasDiskFolder) {
                await this.scanner.deleteDeckFile(deck.name);
              }
              log("LocalDecksGridUI", `Deleted deck "${deck.name}" from IndexedDB and disk.`);
              if (callbacks.onDeckDeleted) {
                callbacks.onDeckDeleted(deck);
              } else if (this.currentScene && typeof (this.currentScene as any).initializeDecks === "function") {
                (this.currentScene as any).initializeDecks();
              }
            } catch (err) {
              error("LocalDecksGridUI", `Failed to delete deck "${deck.name}"`, err);
            }
          },
        }).show();
      };
    }

    const editBtn = tile.querySelector(".deck-tile-edit-btn") as HTMLButtonElement;
    if (editBtn && !isReadOnly) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (titleSpan) this.enableInlineRename(titleSpan, deck, callbacks);
      };
    }

    // 2. Banner Medallion (Center) using O(1) CardRepository
    const evilCard = deck.visuals?.evilCharacterCardId ? CardRepository.get(deck.visuals.evilCharacterCardId) : undefined;
    const heroCard = deck.visuals?.heroCharacterCardId ? CardRepository.get(deck.visuals.heroCharacterCardId) : undefined;

    const bgUrl = evilCard?.ImageFile ? `assets/cards/${evilCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";
    const heroUrl = heroCard?.ImageFile ? `assets/cards/${heroCard.ImageFile}.jpg` : "assets/cards/cardback.jpg";

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

    // 3. Footer: Brigades (Top Good & Top Evil Brigades, including ties)
    const brigadesContainer = tile.querySelector(".deck-tile-brigades") as HTMLElement;
    if (brigadesContainer) {
      brigadesContainer.innerHTML = "";
      const dominantBrigades = this.getDominantBrigades(deck, cardDatabase);

      dominantBrigades.forEach((bName) => {
        const gem = document.createElement("span");
        gem.className = "brigade-gem";
        const numColor = BRIGADE_COLORS[bName] ?? (BRIGADE_COLORS as any)[`${bName} Good`] ?? (BRIGADE_COLORS as any)[`${bName} Evil`] ?? 0x808080;
        const hexStr = numColor.toString(16).padStart(6, "0");
        gem.style.backgroundColor = `#${hexStr}`;
        gem.style.backgroundImage = "linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 60%)";
        gem.style.boxShadow = `inset -2px -2px 4px rgba(0,0,0,0.5), 0 0 6px #${hexStr}`;
        if (bName === "Black") {
          gem.style.border = "1px solid #777";
        }
        gem.title = bName;
        brigadesContainer.appendChild(gem);
      });
    }

    // Format & Validity Row (Instant read from metadata)
    const formatSpan = tile.querySelector(".deck-tile-format") as HTMLElement;
    if (formatSpan) {
      formatSpan.innerText = this.getFormatShortCode(deck.format);
    }

    const validityContainer = tile.querySelector(".deck-tile-validity") as HTMLElement;
    if (validityContainer) {
      validityContainer.innerHTML = "";
      const isValid = typeof deck.isValid === "boolean" ? deck.isValid : true;
      const violations = deck.validationErrors || [];

      const validImgSrc = "assets/ui/icons/green_checkmark_small_compressed.png";
      const invalidImgSrc = "assets/ui/icons/red_cross_small_compressed.png";

      if (isValid) {
        const img = document.createElement("img");
        img.className = "deck-validity-icon";
        img.src = validImgSrc;
        const formatName = DECK_VALIDATION_RULES.formats[deck.format]?.displayName || "Type 1";
        img.title = `Deck is valid for ${formatName}`;

        img.onerror = () => {
          const badge = document.createElement("span");
          badge.className = "deck-validity-badge valid";
          badge.innerText = "✓";
          badge.title = img.title;
          if (validityContainer.contains(img)) {
            validityContainer.removeChild(img);
          }
          validityContainer.appendChild(badge);
        };

        validityContainer.appendChild(img);
      } else {
        const tooltipText = violations.length > 0
          ? `Invalid Deck Building Rules:\n• ${violations.join("\n• ")}`
          : "Invalid Deck Building Rules";

        const img = document.createElement("img");
        img.className = "deck-validity-icon";
        img.src = invalidImgSrc;
        img.title = tooltipText;

        img.onerror = () => {
          const badge = document.createElement("span");
          badge.className = "deck-validity-badge invalid";
          badge.innerText = "✕";
          badge.title = tooltipText;
          if (validityContainer.contains(img)) {
            validityContainer.removeChild(img);
          }
          validityContainer.appendChild(badge);
        };

        validityContainer.appendChild(img);
      }
    }

    // 4. Footer: Stats & Counts
    const statsContainer = tile.querySelector(".deck-tile-stats") as HTMLElement;
    const statsText = tile.querySelector(".deck-tile-stats-text") as HTMLElement;
    const statsEditBtn = tile.querySelector(".deck-tile-stats-edit-btn") as HTMLButtonElement;

    this.updateStatsText(statsText, deck);

    if (statsEditBtn) {
      statsEditBtn.onclick = (e) => {
        e.stopPropagation();
        this.enableInlineStatsEdit(tile, statsContainer, deck, callbacks);
      };
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

  private getFormatShortCode(formatId?: string): string {
    if (!formatId) return "T1";
    const rule = DECK_VALIDATION_RULES.formats[formatId];
    if (rule && rule.shortName) {
      return rule.shortName.slice(0, 7);
    }
    if (formatId.startsWith("type_")) {
      return `T${formatId.replace("type_", "")}`.slice(0, 7);
    }
    const name = rule?.displayName || formatId;
    return name.slice(0, 7);
  }

  private updateStatsText(statsText: HTMLElement | null, deck: DeckMetadata): void {
    if (!statsText) return;
    const fullWins = deck.stats?.wins?.full || 0;
    const partialWins = deck.stats?.wins?.partial || 0;
    const fullLosses = deck.stats?.losses?.full || 0;
    const partialLosses = deck.stats?.losses?.partial || 0;
    const t = deck.stats?.ties || 0;
    statsText.innerText = `W:${fullWins}/${partialWins} L:${fullLosses}/${partialLosses} T:${t} | M:${deck.cardCount?.main || 0} R:${deck.cardCount?.reserve || 0}`;
  }

  private async enableInlineStatsEdit(
    tile: HTMLElement,
    statsContainer: HTMLElement,
    deck: DeckMetadata,
    callbacks: LocalDecksGridCallbacks
  ) {
    const fullWins = deck.stats?.wins?.full || 0;
    const partialWins = deck.stats?.wins?.partial || 0;
    const fullLosses = deck.stats?.losses?.full || 0;
    const partialLosses = deck.stats?.losses?.partial || 0;
    const ties = deck.stats?.ties || 0;

    const originalContent = statsContainer.innerHTML;
    statsContainer.innerHTML = "";

    const editWrapper = document.createElement("div");
    editWrapper.className = "deck-stat-edit-container";

    editWrapper.innerHTML = `
      <span>W:</span>
      <input type="number" min="0" class="deck-stat-input win-full" value="${fullWins}">
      <span>/</span>
      <input type="number" min="0" class="deck-stat-input win-part" value="${partialWins}">
      <span style="margin-left:2px;">L:</span>
      <input type="number" min="0" class="deck-stat-input loss-full" value="${fullLosses}">
      <span>/</span>
      <input type="number" min="0" class="deck-stat-input loss-part" value="${partialLosses}">
      <span style="margin-left:2px;">T:</span>
      <input type="number" min="0" class="deck-stat-input ties-input" value="${ties}">
      <button class="deck-stat-save-btn" title="Save Stats">✓</button>
    `;

    statsContainer.appendChild(editWrapper);

    const winFullIn = editWrapper.querySelector(".win-full") as HTMLInputElement;
    const winPartIn = editWrapper.querySelector(".win-part") as HTMLInputElement;
    const lossFullIn = editWrapper.querySelector(".loss-full") as HTMLInputElement;
    const lossPartIn = editWrapper.querySelector(".loss-part") as HTMLInputElement;
    const tiesIn = editWrapper.querySelector(".ties-input") as HTMLInputElement;
    const saveBtn = editWrapper.querySelector(".deck-stat-save-btn") as HTMLButtonElement;

    if (winFullIn) {
      winFullIn.focus();
      winFullIn.select();
    } let isSaved = false;

    const cleanupOutsideListener = () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };

    const cancelAndRestore = () => {
      if (isSaved) return;
      isSaved = true;
      cleanupOutsideListener();
      restoreNormalView();
    };

    const handleOutsideClick = (e: PointerEvent | MouseEvent) => {
      if (!statsContainer.contains(e.target as Node)) {
        cancelAndRestore();
      }
    };

    setTimeout(() => {
      document.addEventListener("pointerdown", handleOutsideClick);
    }, 50);

    const restoreNormalView = () => {
      statsContainer.innerHTML = originalContent;
      const newStatsText = statsContainer.querySelector(".deck-tile-stats-text") as HTMLElement;
      this.updateStatsText(newStatsText, deck);
      const newEditBtn = statsContainer.querySelector(".deck-tile-stats-edit-btn") as HTMLButtonElement;
      if (newEditBtn) {
        newEditBtn.onclick = (ev) => {
          ev.stopPropagation();
          this.enableInlineStatsEdit(tile, statsContainer, deck, callbacks);
        };
      }
    };

    const saveStats = async () => {
      if (isSaved) return;
      isSaved = true;
      cleanupOutsideListener();

      const newFullWins = Math.max(0, parseInt(winFullIn?.value || "0") || 0);
      const newPartialWins = Math.max(0, parseInt(winPartIn?.value || "0") || 0);
      const newFullLosses = Math.max(0, parseInt(lossFullIn?.value || "0") || 0);
      const newPartialLosses = Math.max(0, parseInt(lossPartIn?.value || "0") || 0);
      const newTies = Math.max(0, parseInt(tiesIn?.value || "0") || 0);

      deck.stats = {
        ...(deck.stats || {}),
        wins: { full: newFullWins, partial: newPartialWins },
        losses: { full: newFullLosses, partial: newPartialLosses },
        ties: newTies,
      };

      await this.scanner.saveMetadataPermanently(deck);

      const totalWins = newFullWins + newPartialWins;
      tile.className = `deck-tile ${this.getTierClass(totalWins)}`;

      restoreNormalView();

      if (callbacks.onDeckRenamed) {
        callbacks.onDeckRenamed(deck, deck.name);
      }
    };

    saveBtn.onclick = (e) => {
      e.stopPropagation();
      saveStats();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        saveStats();
      } else if (e.key === "Escape") {
        cancelAndRestore();
      }
    };

    editWrapper.querySelectorAll("input").forEach((inp) => {
      inp.onkeydown = handleKeyDown;
    });
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

    let isDone = false;

    const restoreTitleSpan = () => {
      if (isDone) return;
      isDone = true;
      const newSpan = document.createElement("span");
      newSpan.className = "deck-tile-title";
      newSpan.innerText = deck.name;
      input.replaceWith(newSpan);
    };

    const saveName = async () => {
      if (isDone) return;
      isDone = true;
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        deck.name = newName;
        await this.scanner.saveMetadataPermanently(deck);
        if (callbacks.onDeckRenamed) callbacks.onDeckRenamed(deck, newName);
      }
      restoreTitleSpan();
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter") saveName();
      if (e.key === "Escape") restoreTitleSpan();
    };
    input.onblur = () => restoreTitleSpan();
  }

  private openMetrics(scene: Phaser.Scene, deck: DeckMetadata, cardDatabase: any[]) {
    this.db.getVirtualDeck(deck.name).then((wrapped) => {
      const allItems = wrapped?.deckData
        ? [...(wrapped.deckData.main || []), ...(wrapped.deckData.reserve || [])]
        : (deck.cardIds || []);

      const cardList = allItems
        .map((item) => {
          if (item && typeof item === "object") {
            const cardObj = item as any;
            const cardKey = cardObj.id || cardObj.Name || cardObj.ImageFile;
            return cardDatabase.find((c) => c.id === cardKey || c.Name === cardKey || c.ImageFile === cardKey) || item;
          }
          return cardDatabase.find((c) => c.id === item || c.Name === item || c.ImageFile === item);
        })
        .filter(Boolean);

      DeckMetricsOverlayManager.showMetrics(scene, cardList, deck.name);
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

  private getDominantBrigades(deck: DeckMetadata, cardDatabase: any[]): string[] {
    const goodCounts = new Map<string, number>();
    const evilCounts = new Map<string, number>();

    const GOOD_SET = new Set(GOOD_BRIGADES);
    const EVIL_SET = new Set(EVIL_BRIGADES);

    const allIdentifiers = deck.cardIds && deck.cardIds.length > 0 ? deck.cardIds : [];

    const addBrigade = (b: string) => {
      if (!b || b === "None" || b === "Multi") return;
      const parts = b.split(/[\/,]/).map((p) => p.trim());
      parts.forEach((part) => {
        const normGood = Array.from(GOOD_SET).find((g) => g.toLowerCase() === part.toLowerCase());
        const normEvil = Array.from(EVIL_SET).find((e) => e.toLowerCase() === part.toLowerCase());

        if (normGood) {
          goodCounts.set(normGood, (goodCounts.get(normGood) || 0) + 1);
        } else if (normEvil) {
          evilCounts.set(normEvil, (evilCounts.get(normEvil) || 0) + 1);
        }
      });
    };

    if (allIdentifiers.length > 0) {
      allIdentifiers.forEach((id) => {
        const match = CardRepository.get(id);
        if (match && match.Brigade) {
          if (Array.isArray(match.Brigade)) {
            match.Brigade.forEach((b: string) => addBrigade(b));
          } else if (typeof match.Brigade === "string") {
            addBrigade(match.Brigade);
          }
        }
      });
    } else if (deck.brigades && deck.brigades.length > 0) {
      deck.brigades.forEach((b) => addBrigade(b));
    }

    let maxGood = 0;
    goodCounts.forEach((count) => {
      if (count > maxGood) maxGood = count;
    });

    const topGood: string[] = [];
    if (maxGood > 0) {
      goodCounts.forEach((count, bName) => {
        if (count === maxGood) topGood.push(bName);
      });
    }

    let maxEvil = 0;
    evilCounts.forEach((count) => {
      if (count > maxEvil) maxEvil = count;
    });

    const topEvil: string[] = [];
    if (maxEvil > 0) {
      evilCounts.forEach((count, bName) => {
        if (count === maxEvil) topEvil.push(bName);
      });
    }

    const result = [...topGood, ...topEvil];
    if (result.length === 0) {
      return (deck.brigades || []).slice(0, 6);
    }
    return result;
  }
}
