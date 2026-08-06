import Phaser from "phaser";
import { type SoundManager } from "../../managers/SoundManager";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { SettingsDialogScene } from "../SettingsDialogScene";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { LocalDeckScanner } from "../../managers/LocalDeckScanner";
import { log } from "../../utils/logger";
import { OnboardingOverlay, ScanProgressOverlay, HelpOverlay } from "../../ui/overlays";
import { LocalDecksGridUI } from "../../ui/components/LocalDecksGridUI";
import type { DeckMetadata } from "../../types/DeckMetadata";
import { SelectionDialogScene } from "../SelectionDialogScene";
import { filterConfigData } from "../../ui/config/filter_config";
import { DeckHeaderFilterUI, type DeckFilterOptions } from "../../ui/components/filters/DeckHeaderFilterUI";
import { TROPHY_THRESHOLDS, TIER_CONFIG } from "../../config/BrigadeConfig";
import { CardRepository } from "../../../../shared/CardRepository.js";

export class LocalDecksScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private background!: Phaser.GameObjects.Image;
  private exitButton!: SidebarButton;
  private settingsButton!: SidebarButton;
  private helpButton!: SidebarButton;

  private db!: LocalDecksDB;
  private scanner!: LocalDeckScanner;
  private headerFilterUI!: DeckHeaderFilterUI;
  private allDecks: DeckMetadata[] = [];
  private lastFilterOptions: DeckFilterOptions | null = null;

  constructor() {
    super("LocalDecksScene");
  }

  preload() {
    this.load.image(
      "deck_catacombs_bg",
      "assets/backgrounds/Copilot_20260517_235633_Catacombs.png"
    );

    // UI elements
    this.load.image(
      "button_exit",
      "assets/ui/buttons/Button_Copilot_20260730_001735_exit.png"
    );
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png"
    );
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png"
    );

    // Sync button (placeholder using settings for now, user will provide graphic later)
    this.load.image(
      "button_sync_placeholder",
      "assets/ui/buttons/button-gold-7850928_1920.png"
    );

    this.load.bitmapFont(
      "fairydust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml"
    );

    this.load.bitmapFont(
      "wazoo",
      "assets/fonts/bitmap/Wazoo.png",
      "assets/fonts/bitmap/Wazoo.xml"
    );

    this.load.html(
      "deckMetrics",
      `templates/deckMetrics.html?v=${Date.now()}`
    );

    // === Selection Dialog UI Textures ===
    this.cache.json.add("filterConfig", filterConfigData);
    this.load.image("filterSelected_small", "assets/ui/filter-icons/selected_small.png");
    this.load.image("filterSelected_med", "assets/ui/filter-icons/selected_med.png");
    this.load.image("silver_cross_circle_med", "assets/ui/filter-icons/silver_cross_circle_med.png");
    this.load.image("silver_cross_circle_small", "assets/ui/filter-icons/silver_cross_circle_small.png");
    this.load.image("checkBoxUnChecked", "assets/ui/checkboxes/checkBox_Unchecked_compressed.png");
    this.load.image("checkBoxChecked", "assets/ui/checkboxes/checkBox_Checked_compressed.png");
    this.load.image("button_parchment", "assets/ui/buttons/ChatGPT_Parchment_Button_dark_cracked_transp1_small.png");
    this.load.image("arrow_left", "assets/ui/buttons/arrow-left_small.png");
    this.load.image("arrow_right", "assets/ui/buttons/arrow-right_small.png");
    this.load.image("button_sync", "assets/ui/buttons/sync.png");
    this.load.image("button_reset", "assets/ui/buttons/reset.png");
    this.load.image(
      "button_deck_smith",
      "assets/ui/buttons/Button_Copilot_20260721_210751_Deck_Blacksmith.png"
    );

    TIER_CONFIG.forEach((t) => {
      this.load.image(`${t.id}_bg`, t.bgImage);
    });

    // Audio effects for filter buttons matching DeckEditorScene
    this.load.audio("checkButtonHover", "assets/sounds/effects/swing-whoosh-110410_short.mp3");
    this.load.audio("checkButtonSelect", "assets/sounds/effects/notification-sound-7062.mp3");
    this.load.audio("checkButtonDeselect", "assets/sounds/effects/ToggleSwitchMetal PE1090917.mp3");

    if (filterConfigData && filterConfigData.filters) {
      filterConfigData.filters.forEach((filter: any) => {
        if (filter.iconSmallPath) {
          this.load.image(`${filter.id}_small`, filter.iconSmallPath);
          const medPath = filter.iconSmallPath.replace("_small.png", "_med.png");
          this.load.image(`${filter.id}_med`, medPath);
          const largePath = filter.iconSmallPath.replace("_small.png", ".png");
          this.load.image(`${filter.id}`, largePath);
        } else if (filter.iconPath) {
          this.load.image(`${filter.id}`, filter.iconPath);
          this.load.image(`${filter.id}_med`, filter.iconPath);
        }
      });
    }
  }

  private statusText!: Phaser.GameObjects.BitmapText;
  private resetButton!: Phaser.GameObjects.Image;
  private gridUI!: LocalDecksGridUI;
  private footerEl: HTMLElement | null = null;
  private currentDecks: DeckMetadata[] = [];

  create() {
    if (!this.scene.get("SettingsDialogScene")) {
      this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
    }

    this.soundManager = this.registry.get("soundManager");
    this.db = new LocalDecksDB();
    this.gridUI = new LocalDecksGridUI();

    // Console helper for developer reset
    (window as any).resetLocalDecks = async () => {
      await this.db.clearAll();
      this.gridUI.destroy();
      this.removeStaticFooter();
      log("LocalDecksScene", "LocalDecksDB reset. Reloading scene...");
      this.scene.restart();
    };

    const cardDatabase = this.registry.get("cardDatabase")?.cards || [];
    if (cardDatabase.length > 0) {
      CardRepository.initialize(cardDatabase);
    }
    this.scanner = new LocalDeckScanner(cardDatabase);

    const width = this.scale.width;
    const height = this.scale.height;

    // Render background image stretch-fitted to game bounds using CONTAIN (no heavy cropping)
    this.background = this.add.image(width / 2, height / 2, "btn_local_decks");
    this.adjustBackgroundSize();

    // Status text centered near the top
    this.statusText = this.add.bitmapText(width / 2, 50, "fairydust", "", 36)
      .setOrigin(0.5)
      .setTint(0xffd700);

    this.createSideButtons(height);

    this.scale.on("resize", this.resize, this);
    this.events.on("shutdown", this.cleanup, this);

    this.events.on("pause", () => {
      if (this.gridUI) this.gridUI.setVisible(false);
    });

    this.events.on("resume", () => {
      if (this.gridUI) this.gridUI.setVisible(true);
    });

    this.initializeDecks();
  }

  private cleanup() {
    if (this.gridUI) this.gridUI.destroy();
    if (this.headerFilterUI) this.headerFilterUI.destroy();
    this.removeStaticFooter();
  }

  private async initializeDecks(skipDiskSync: boolean = false) {
    if (this.scanner && !skipDiskSync) {
      await this.scanner.syncAllToCache();
    }
    const cachedDecks = await this.db.getAllCachedMetadata();
    const cardDatabase = this.registry.get("cardDatabase")?.cards || [];
    this.allDecks = cachedDecks;

    log("LocalDecksScene", `Loaded ${cachedDecks.length} decks from cache.`);

    if (this.statusText) this.statusText.setVisible(false);

    if (this.headerFilterUI) this.headerFilterUI.destroy();
    this.headerFilterUI = new DeckHeaderFilterUI(
      this,
      (opts) => {
        this.lastFilterOptions = opts;
        this.applyFiltersAndSort(opts, cardDatabase);
      },
      {
        onSync: () => this.showOnboarding(),
        onReset: async () => {
          const confirmed = window.confirm("Do you really want to reset local deck folder settings?");
          if (confirmed) {
            await this.db.clearAll();
            log("LocalDecksScene", "Storage reset by user button.");
            this.scene.restart();
          }
        },
        onOpenDeckEditor: () => {
          if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
          this.cleanup();
          this.scene.start("GameLoadingScene", {
            targetScene: "DeckEditorScene",
            backgroundKey: "btn_deck_editor",
          });
        }
      }
    );

    this.headerFilterUI.createUI(this.scale.width, 0, cachedDecks.length);

    if (this.lastFilterOptions) {
      this.applyFiltersAndSort(this.lastFilterOptions, cardDatabase);
    } else {
      this.renderGrid(cachedDecks, cardDatabase);
    }

    if (cachedDecks.length === 0) {
      const source = await this.db.getDirectoryHandle("source_dir");
      const target = await this.db.getDirectoryHandle("target_dir");
      if (!source || !target) {
        this.showOnboarding();
      }
    }

    await this.updateStaticFooter();
  }

  private applyFiltersAndSort(opts: DeckFilterOptions, cardDatabase: any[]) {
    let result = [...this.allDecks];

    if (!CardRepository.isInitialized && cardDatabase && cardDatabase.length > 0) {
      CardRepository.initialize(cardDatabase);
    }

    // 1. Text Search Filter
    if (opts.searchQuery) {
      const query = opts.searchQuery;
      result = result.filter((deck) => {
        let nameMatch = false;
        if (opts.searchInName) {
          nameMatch = deck.name.toLowerCase().includes(query);
        }
        let cardMatch = false;
        if (opts.searchInCard && deck.cardIds) {
          cardMatch = deck.cardIds.some((id) => {
            const card = CardRepository.get(id);
            return card?.Name?.toLowerCase().includes(query);
          });
        }
        return nameMatch || cardMatch;
      });
    }

    // 2. Brigade Color Filter (AND / OR logic)
    if (opts.activeBrigades && opts.activeBrigades.length > 0) {
      result = result.filter((deck) => {
        const deckBrigades = (deck.brigades || []).map((b) => b.toLowerCase());
        if (opts.isAndMode) {
          return opts.activeBrigades.every((b) =>
            deckBrigades.includes(b.toLowerCase())
          );
        } else {
          return opts.activeBrigades.some((b) =>
            deckBrigades.includes(b.toLowerCase())
          );
        }
      });
    }

    // 3. Tier Filter
    if (opts.activeTiers && opts.activeTiers.length > 0) {
      result = result.filter((deck) => {
        const wins = deck.stats?.wins?.full || 0;
        let tierId = "tier_stone";
        if (wins >= TROPHY_THRESHOLDS.GOLD) tierId = "tier_gold";
        else if (wins >= TROPHY_THRESHOLDS.SILVER) tierId = "tier_silver";
        else if (wins >= TROPHY_THRESHOLDS.BRONZE) tierId = "tier_bronze";

        return opts.activeTiers.includes(tierId);
      });
    }

    // 4. Format / DeckType Filter
    if (opts.activeFormats !== undefined) {
      if (opts.activeFormats.length > 0) {
        result = result.filter((deck) => {
          const deckFormat = deck.format || "type_1";
          return opts.activeFormats.includes(deckFormat);
        });
      } else {
        result = [];
      }
    }

    // 5. Sorting
    result.sort((a, b) => {
      if (opts.sortMode === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (opts.sortMode === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      if (opts.sortMode === "tier_desc") {
        return (b.stats?.wins?.full || 0) - (a.stats?.wins?.full || 0);
      }
      if (opts.sortMode === "tier_asc") {
        return (a.stats?.wins?.full || 0) - (b.stats?.wins?.full || 0);
      }
      if (opts.sortMode === "brigade") {
        const bA = a.brigades?.[0] || "";
        const bB = b.brigades?.[0] || "";
        return bA.localeCompare(bB);
      }
      if (opts.sortMode === "format") {
        const fA = a.format || "";
        const fB = b.format || "";
        return fA.localeCompare(fB);
      }
      return 0;
    });

    if (this.headerFilterUI) {
      this.headerFilterUI.updateCountText(result.length, this.allDecks.length);
    }

    this.renderGrid(result, cardDatabase);
  }

  private renderGrid(decks: DeckMetadata[], cardDatabase: any[]) {
    this.currentDecks = decks;
    if (this.statusText) {
      this.statusText.setText(`${decks.length} Local Decks`);
    }
    this.gridUI.render(this, decks, cardDatabase, {
      onOpenDeckEditor: (deck) => {
        if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
        this.cleanup();
        this.scene.start("GameLoadingScene", {
          targetScene: "DeckEditorScene",
          backgroundKey: "btn_deck_editor",
          targetData: { deckName: deck.name }
        });
      },
      onStartBattle: (deck) => {
        if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
        this.cleanup();
        this.scene.start("LobbyScene", { selectedDeckName: deck.name });
      },
      onSelectChampions: (deck) => {
        this.handleSelectChampions(deck);
      },
      onDeckRenamed: (deck, newName) => {
        log("LocalDecksScene", `Deck renamed to ${newName}`);
        this.initializeDecks();
      },
      onDeckDeleted: (deck) => {
        log("LocalDecksScene", `Deck deleted: ${deck.name}`);
        this.initializeDecks(true);
      }
    });
  }

  private handleSelectChampions(deck: DeckMetadata) {
    this.db.getVirtualDeck(deck.name).then((wrapped) => {
      const rawDb = this.registry.get("cardDatabase");
      const cardDatabase = Array.isArray(rawDb) ? rawDb : (rawDb?.cards || []);
      const allIds = wrapped?.deckData
        ? [...(wrapped.deckData.main || []), ...(wrapped.deckData.reserve || [])]
        : (deck.cardIds || []);

      const rawCards = allIds
        .map((id) => cardDatabase.find((c: any) => c.id === id || c.Name === id || c.ImageFile === id))
        .filter(Boolean);

      // Include ALL cards in the deck without any card type restrictions
      const charCards = rawCards.map((c: any, index: number) => {
        const cardKey = c.id || c.Name || c.ImageFile;
        return {
          ...c,
          cardKey: cardKey,
          id: `${cardKey}__idx_${index}`, // Unique instance ID for SelectionDialog UI
          ImageFile: c.ImageFile || "cardback",
          Name: c.Name || "Unknown Card",
        };
      });

      if (charCards.length === 0) {
        log("LocalDecksScene", "No cards found in deck to assign champions.");
        return;
      }

      // Map pre-selected card keys to corresponding unique instance IDs
      const heroKey = deck.visuals?.heroCharacterCardId;
      const evilKey = deck.visuals?.evilCharacterCardId;

      const preSelectedInstanceIds: string[] = [];
      if (heroKey) {
        const heroMatch = charCards.find((c: any) => c.cardKey === heroKey || c.Name === heroKey || c.ImageFile === heroKey);
        if (heroMatch) preSelectedInstanceIds.push(heroMatch.id);
      }
      if (evilKey) {
        const evilMatch = charCards.find(
          (c: any) => (c.cardKey === evilKey || c.Name === evilKey || c.ImageFile === evilKey) && !preSelectedInstanceIds.includes(c.id)
        );
        if (evilMatch) preSelectedInstanceIds.push(evilMatch.id);
      }

      this.gridUI.setVisible(false);
      if (this.footerEl) this.footerEl.style.display = "none";

      this.scene.pause();
      this.scene.launch("SelectionDialogScene", {
        title: `Select Cards for ${deck.name} Tile`,
        cards: charCards,
        showCloseButton: true,
        isInteractive: true,
        isMyAction: true,
        maxSelectableCount: 2,
        selectionRules: { min: 0, max: 2 },
        autoReplaceOnMax: true,
        preSelectedCardIds: preSelectedInstanceIds,
        hidePlayerLabels: true,
        confirmButtonLabel: "OK",
        onComplete: async (result: any) => {
          const selectedInstanceIds = (result.selectedCards || []).map((sc: any) => sc.id);
          const chosenCards = charCards.filter((c: any) => selectedInstanceIds.includes(c.id));

          if (!deck.visuals) {
            deck.visuals = { heroCharacterCardId: null, evilCharacterCardId: null, fallbackGraphic: "assets/cards/cardback.jpg" };
          }

          deck.visuals.heroCharacterCardId = chosenCards[0] ? chosenCards[0].cardKey : null;
          deck.visuals.evilCharacterCardId = chosenCards[1] ? chosenCards[1].cardKey : null;

          await this.scanner.saveMetadataPermanently(deck);

          this.gridUI.setVisible(true);
          if (this.footerEl) this.footerEl.style.display = "flex";
          this.scene.resume();
          this.initializeDecks();
        },
        onCancel: () => {
          this.gridUI.setVisible(true);
          if (this.footerEl) this.footerEl.style.display = "flex";
          this.scene.resume();
        }
      });
      this.scene.bringToTop("SelectionDialogScene");
    });
  }

  private async updateStaticFooter() {
    if (!this.footerEl) {
      this.footerEl = document.createElement("div");
      this.footerEl.id = "local-decks-footer-bar";
      this.footerEl.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%; height: 35px;
        background: rgba(0, 0, 0, 0.85); border-top: 1px solid #b8860b;
        color: #ccc; font-family: sans-serif; font-size: 13px;
        display: flex; justify-content: center; align-items: center; gap: 20px;
        z-index: 1100; box-sizing: border-box; padding: 0 10px;
      `;
      document.body.appendChild(this.footerEl);
    }

    if ("showDirectoryPicker" in window) {
      const source = await this.db.getDirectoryHandle("source_dir");
      const target = await this.db.getDirectoryHandle("target_dir");
      const sourceName = source ? source.name : "Not Linked";
      const targetName = target ? target.name : "Not Linked";
      this.footerEl.innerHTML = `<span><strong>Source Folder:</strong> ${sourceName}</span><span>|</span><span><strong>Target Folder:</strong> ${targetName}</span>`;
    } else {
      this.footerEl.innerHTML = `<span><strong>Storage Mode:</strong> Virtual DB (PWA)</span>`;
    }
  }

  private removeStaticFooter() {
    if (this.footerEl) {
      this.footerEl.remove();
      this.footerEl = null;
    }
  }

  private ensureFooterDiskStatusStyle() {
    if (!document.getElementById("footer-disk-status-style")) {
      const style = document.createElement("style");
      style.id = "footer-disk-status-style";
      style.innerHTML = `
        @keyframes footerDiskStatusBlink {
          0% { opacity: 1; filter: drop-shadow(0 0 6px #0CED35); }
          50% { opacity: 0.2; filter: none; }
          100% { opacity: 1; filter: drop-shadow(0 0 6px #0CED35); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  private updateFooterDiskProgress(written: number, total: number) {
    if (!this.footerEl) return;
    this.ensureFooterDiskStatusStyle();

    let diskStatusSpan = document.getElementById("footer-disk-status") as HTMLElement;

    if (!diskStatusSpan) {
      const separator = document.createElement("span");
      separator.id = "footer-disk-separator";
      separator.innerText = "|";
      separator.style.color = "#ccc";

      diskStatusSpan = document.createElement("span");
      diskStatusSpan.id = "footer-disk-status";
      diskStatusSpan.style.cssText = `
        color: #ffd700;
        font-weight: bold;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      `;

      this.footerEl.appendChild(separator);
      this.footerEl.appendChild(diskStatusSpan);
    }

    diskStatusSpan.innerHTML = `💾 <span>Writing to disk: <strong>${written}/${total}</strong></span>`;

    if (written >= total && total > 0) {
      if ((diskStatusSpan as any).hasCompleted) return;
      (diskStatusSpan as any).hasCompleted = true;

      diskStatusSpan.style.color = "#0CED35";
      diskStatusSpan.style.animation = "footerDiskStatusBlink 2.75s ease-in-out 3";

      setTimeout(() => {
        const separator = document.getElementById("footer-disk-separator");
        if (diskStatusSpan) {
          diskStatusSpan.style.animation = "none";
          diskStatusSpan.style.transition = "opacity 2.75s ease-out";
          diskStatusSpan.style.opacity = "1";
        }
        if (separator) {
          separator.style.animation = "none";
          separator.style.transition = "opacity 2.75s ease-out";
          separator.style.opacity = "1";
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (diskStatusSpan) diskStatusSpan.style.opacity = "0";
            if (separator) separator.style.opacity = "0";
          });
        });

        setTimeout(() => {
          if (diskStatusSpan && diskStatusSpan.parentNode) diskStatusSpan.remove();
          if (separator && separator.parentNode) separator.remove();
        }, 2750);
      }, 8250);
    }
  }

  private showOnboarding() {
    OnboardingOverlay.show(
      async () => {
        await this.triggerScan();
      },
      () => {
        // Simple cancel: overlay hides itself, scene UI remains 100% intact
      }
    );
  }

  private async triggerScan() {
    ScanProgressOverlay.show("Scanning Local Decks...");

    try {
      await this.scanner.scanDecks(
        async () => {
          ScanProgressOverlay.hide();
          await this.initializeDecks();
        },
        (current, total, filename) => {
          ScanProgressOverlay.updateProgress(current, total, filename);
        },
        (written, total) => {
          this.updateFooterDiskProgress(written, total);
        }
      );
    } catch (err) {
      log("LocalDecksScene", "Scan cancelled or failed", err);
    } finally {
      ScanProgressOverlay.hide();
    }
  }

  private createSideButtons(height: number) {
    if (this.settingsButton) this.settingsButton.destroy();
    if (this.exitButton) this.exitButton.destroy();
    if (this.helpButton) this.helpButton.destroy();

    this.settingsButton = new SidebarButton(
      this,
      "button_settings",
      height * 0.18,
      true, // Right side
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        this.scene.pause();
        this.scene.launch("SettingsDialogScene", { parentScene: "LocalDecksScene" });
      }
    );

    this.exitButton = new SidebarButton(
      this,
      "button_exit",
      height * 0.18,
      false, // Left side
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        this.cleanup();
        this.scene.start("DeckCatacombsScene");
      },
      "button_exit_to_catacombs"
    );

    this.helpButton = new SidebarButton(
      this,
      "button_help",
      height * 0.7,
      false, // Left side
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        HelpOverlay.toggle();
      }
    );
  }

  private hoverTween(target: any, text: any, scale: number) {
    this.tweens.add({
      targets: [target, text],
      scale: scale,
      duration: 200,
      ease: "Sine.easeOut",
    });
  }

  private adjustBackgroundSize() {
    const width = this.scale.width;
    const height = this.scale.height;

    // Scale background using ENVELOP logic (fill screen, no black borders, crop overflow)
    const scaleX = width / this.background.width;
    const scaleY = height / this.background.height;
    const scale = Math.min(scaleX, scaleY);

    this.background.setPosition(width / 2, height / 2);
    this.background.setScale(scale);
    this.background.setTint(0x333333);
  }

  private resize(gameSize: { width: number; height: number }) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.adjustBackgroundSize();

    if (this.statusText) this.statusText.setPosition(width / 2, 50);
    if (this.settingsButton) this.settingsButton.resize(width, height * 0.18);
    if (this.exitButton) this.exitButton.resize(width, height * 0.18);
    if (this.helpButton) this.helpButton.resize(width, height * 0.7);

    if (this.gridUI) {
      this.gridUI.updateContainerBounds(this);
    }
  }
}
