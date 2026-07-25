import Phaser from "phaser";
import { type SoundManager } from "../../managers/SoundManager";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { SettingsDialogScene } from "../SettingsDialogScene";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { LocalDeckScanner } from "../../managers/LocalDeckScanner";
import { log } from "../../utils/logger";
import { OnboardingOverlay, ScanProgressOverlay } from "../../ui/overlays";
import { LocalDecksGridUI } from "../../ui/components/LocalDecksGridUI";
import type { DeckMetadata } from "../../types/DeckMetadata";
import { SelectionDialogScene } from "../SelectionDialogScene";
import { filterConfigData } from "../../ui/config/filter_config";

export class LocalDecksScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private background!: Phaser.GameObjects.Image;
  private backButton!: Phaser.GameObjects.Image;
  private syncButton!: Phaser.GameObjects.Image;
  private settingsButton!: SidebarButton;
  private helpButton!: SidebarButton;
  
  private db!: LocalDecksDB;
  private scanner!: LocalDeckScanner;

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
      "button_back_placeholder",
      "assets/ui/buttons/button-gold-7850928_1920.png"
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

    if (filterConfigData && filterConfigData.filters) {
      filterConfigData.filters.forEach((filter: any) => {
        if (filter.iconSmallPath) {
          this.load.image(`${filter.id}_small`, filter.iconSmallPath);
          const medPath = filter.iconSmallPath.replace("_small.png", "_med.png");
          this.load.image(`${filter.id}_med`, medPath);
          const largePath = filter.iconSmallPath.replace("_small.png", ".png");
          this.load.image(`${filter.id}`, largePath);
        }
      });
    }
  }

  private statusText!: Phaser.GameObjects.BitmapText;
  private resetButton!: Phaser.GameObjects.Image;
  private gridUI!: LocalDecksGridUI;
  private footerEl: HTMLElement | null = null;

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

    this.createBackButton();
    this.createSideButtons(height);
    this.createSyncButton();
    this.createResetButton();

    this.scale.on("resize", this.resize, this);
    this.events.on("shutdown", this.cleanup, this);

    this.initializeDecks();
  }

  private cleanup() {
    if (this.gridUI) this.gridUI.destroy();
    this.removeStaticFooter();
  }

  private async initializeDecks() {
    if (this.scanner) {
      await this.scanner.syncAllToCache();
    }
    const cachedDecks = await this.db.getAllCachedMetadata();
    const cardDatabase = this.registry.get("cardDatabase")?.cards || [];
    
    log("LocalDecksScene", `Loaded ${cachedDecks.length} decks from cache.`);

    let needsOnboarding = false;
    if ("showDirectoryPicker" in window) {
      const source = await this.db.getDirectoryHandle("source_dir");
      const target = await this.db.getDirectoryHandle("target_dir");
      if (!source || !target) needsOnboarding = true;
    } else {
      if (cachedDecks.length === 0) needsOnboarding = true;
    }

    if (needsOnboarding) {
      this.syncButton.setVisible(false);
      this.resetButton.setVisible(false);
      this.statusText.setText("");
      if (this.gridUI) this.gridUI.destroy();
      this.showOnboarding();
    } else {
      this.syncButton.setVisible(true);
      this.resetButton.setVisible(true);
      this.statusText.setText(`${cachedDecks.length} Local Decks`);
      this.renderGrid(cachedDecks, cardDatabase);
    }
    
    await this.updateStaticFooter();
  }

  private renderGrid(decks: DeckMetadata[], cardDatabase: any[]) {
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
      
      let charCards = allIds
        .map((id) => cardDatabase.find((c: any) => c.id === id || c.Name === id || c.ImageFile === id))
        .filter(Boolean)
        .filter((c: any) => {
          const types = Array.isArray(c.Type) ? c.Type : [c.Type];
          return types.some((t: string) =>
            t && (t.includes("Hero") || t.includes("Evil") || t.includes("Character") || t.includes("DAC"))
          );
        })
        .map((c: any) => ({
          ...c,
          id: c.id || c.Name || c.ImageFile,
          ImageFile: c.ImageFile || "cardback",
          Name: c.Name || "Unknown Card",
        }));

      // Fallback: If no character cards detected, use all matched deck cards
      if (charCards.length === 0) {
        charCards = allIds
          .map((id) => cardDatabase.find((c: any) => c.id === id || c.Name === id || c.ImageFile === id))
          .filter(Boolean)
          .map((c: any) => ({
            ...c,
            id: c.id || c.Name || c.ImageFile,
            ImageFile: c.ImageFile || "cardback",
            Name: c.Name || "Unknown Card",
          }));
      }

      if (charCards.length === 0) {
        log("LocalDecksScene", "No cards found in deck to assign champions.");
        return;
      }

      this.gridUI.setVisible(false);
      if (this.footerEl) this.footerEl.style.display = "none";

      this.scene.pause();
      this.scene.launch("SelectionDialogScene", {
        title: `Select Champions for ${deck.name}`,
        cards: charCards,
        showCloseButton: true,
        isInteractive: true,
        isMyAction: true,
        maxSelectableCount: 2,
        hidePlayerLabels: true,
        confirmButtonLabel: "OK",
        onComplete: async (result: any) => {
          const selectedIds = (result.selectedCards || []).map((sc: any) => sc.id);
          const heroCard = charCards.find((c: any) => {
            if (!selectedIds.includes(c.id)) return false;
            const types = Array.isArray(c.Type) ? c.Type : [c.Type];
            return types.some((t: string) => t && (t.includes("Hero") || t.includes("DAC")));
          }) || charCards.find((c: any) => selectedIds.includes(c.id));

          const evilCard = charCards.find((c: any) => {
            if (!selectedIds.includes(c.id)) return false;
            const types = Array.isArray(c.Type) ? c.Type : [c.Type];
            return types.some((t: string) => t && t.includes("Evil"));
          }) || charCards.find((c: any) => selectedIds.includes(c.id) && c.id !== heroCard?.id);

          if (!deck.visuals) {
            deck.visuals = { heroCharacterCardId: null, evilCharacterCardId: null, fallbackGraphic: "assets/cards/cardback.jpg" };
          }
          if (heroCard) deck.visuals.heroCharacterCardId = heroCard.id;
          if (evilCard) deck.visuals.evilCharacterCardId = evilCard.id;

          await this.db.saveCachedMetadata(deck);
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

  private showOnboarding() {
    OnboardingOverlay.show(async () => {
      await this.triggerScan();
    });
  }

  private async triggerScan() {
    ScanProgressOverlay.show("Scanning Local Decks...");
    
    await this.scanner.scanDecks(
      async () => {
        ScanProgressOverlay.hide();
        this.syncButton.setVisible(true);
        this.resetButton.setVisible(true);
        
        await this.initializeDecks();
      },
      (current, total, filename) => {
        ScanProgressOverlay.updateProgress(current, total, filename);
      }
    );
  }

  private createSideButtons(height: number) {
    if (this.settingsButton) this.settingsButton.destroy();
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

    this.helpButton = new SidebarButton(
      this,
      "button_help",
      height * 0.7,
      false, // Left side
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        console.log("[DEBUG] Help Button clicked");
      }
    );
  }

  private createBackButton() {
    if (this.backButton) this.backButton.destroy();

    this.backButton = this.add
      .image(40, 40, "button_back_placeholder")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.8)
      .setTint(0xaaaaaa);

    const backText = this.add.bitmapText(40, 40, "fairydust", "<-", 24)
      .setOrigin(0.5)
      .setTint(0xffffff);

    this.backButton.on("pointerover", () => this.hoverTween(this.backButton, backText, 1.1));
    this.backButton.on("pointerout", () => this.hoverTween(this.backButton, backText, 1.0));
    
    this.backButton.on("pointerdown", () => {
      if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
      this.scene.start("DeckCatacombsScene");
    });
  }

  private createSyncButton() {
    if (this.syncButton) this.syncButton.destroy();

    const width = this.scale.width;
    
    this.syncButton = this.add
      .image(width - 40, 40, "button_sync_placeholder")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.9)
      .setTint(0xaaaaaa); // Placeholder tint

    const syncText = this.add.bitmapText(width - 40, 40, "fairydust", "Sync", 16)
      .setOrigin(0.5)
      .setTint(0xffffff);

    this.syncButton.setVisible(false); // Hidden by default until initialized/onboarded

    this.syncButton.on("pointerover", () => this.hoverTween(this.syncButton, syncText, 1.1));
    this.syncButton.on("pointerout", () => this.hoverTween(this.syncButton, syncText, 1.0));
    
    this.syncButton.on("pointerdown", () => {
      if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
      this.triggerScan();
    });
  }

  private createResetButton() {
    if (this.resetButton) this.resetButton.destroy();

    const width = this.scale.width;
    
    this.resetButton = this.add
      .image(width - 100, 40, "button_sync_placeholder")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.9)
      .setTint(0xff4444); // Red tint for reset

    const resetText = this.add.bitmapText(width - 100, 40, "fairydust", "Reset", 14)
      .setOrigin(0.5)
      .setTint(0xffffff);

    this.resetButton.setVisible(false);

    this.resetButton.on("pointerover", () => this.hoverTween(this.resetButton, resetText, 1.1));
    this.resetButton.on("pointerout", () => this.hoverTween(this.resetButton, resetText, 1.0));
    
    this.resetButton.on("pointerdown", async () => {
      if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
      await this.db.clearAll();
      log("LocalDecksScene", "Storage reset by user button.");
      this.scene.restart();
    });
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
    const scale = Math.max(scaleX, scaleY);
    
    this.background.setPosition(width / 2, height / 2);
    this.background.setScale(scale);
  }

  private resize(gameSize: { width: number; height: number }) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.adjustBackgroundSize();
    
    if (this.statusText) this.statusText.setPosition(width / 2, 50);
    if (this.settingsButton) this.settingsButton.resize(width, height * 0.18);
    if (this.helpButton) this.helpButton.resize(width, height * 0.7);
    
    if (this.syncButton) this.syncButton.setPosition(width - 40, 40);
    if (this.resetButton) this.resetButton.setPosition(width - 100, 40);
  }
}
