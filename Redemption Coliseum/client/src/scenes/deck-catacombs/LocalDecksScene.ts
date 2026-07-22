import Phaser from "phaser";
import { type SoundManager } from "../../managers/SoundManager";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { SettingsDialogScene } from "../SettingsDialogScene";
import { LocalDecksDB } from "../../utils/LocalDecksDB";
import { LocalDeckScanner } from "../../managers/LocalDeckScanner";
import { log } from "../../utils/logger";
import { OnboardingOverlay, ScanProgressOverlay } from "../../ui/overlays";

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
    // The background is already preloaded by DeckCatacombsScene as 'btn_local_decks',
    // but GameLoadingScene also preloads the backgroundKey. We just use it here.
    
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
  }

  private statusText!: Phaser.GameObjects.BitmapText;
  private resetButton!: Phaser.GameObjects.Image;

  create() {
    if (!this.scene.get("SettingsDialogScene")) {
      this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
    }

    this.soundManager = this.registry.get("soundManager");
    this.db = new LocalDecksDB();
    
    // Console helper for developer reset
    (window as any).resetLocalDecks = async () => {
      await this.db.clearAll();
      log("LocalDecksScene", "LocalDecksDB reset. Reloading scene...");
      this.scene.restart();
    };

    const cardDatabase = this.registry.get("cardDatabase")?.cards || [];
    this.scanner = new LocalDeckScanner(cardDatabase);

    const width = this.scale.width;
    const height = this.scale.height;

    // Render background image stretch-fitted to game bounds using ENVELOP
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

    this.initializeDecks();
  }

  private async initializeDecks() {
    // 1. Instantly load from cache to populate future grid
    const cachedDecks = await this.db.getAllCachedMetadata();
    
    log("LocalDecksScene", `Loaded ${cachedDecks.length} decks from cache.`);

    // 2. Check if we need onboarding
    let needsOnboarding = false;
    if ("showDirectoryPicker" in window) {
      const source = await this.db.getDirectoryHandle("source_dir");
      const target = await this.db.getDirectoryHandle("target_dir");
      if (!source || !target) needsOnboarding = true;
    } else {
      // In PWA/Mobile mode, if we have no cached decks, we show onboarding
      if (cachedDecks.length === 0) needsOnboarding = true;
    }

    if (needsOnboarding) {
      this.syncButton.setVisible(false); // Hide sync until onboarded
      this.resetButton.setVisible(false);
      this.statusText.setText("");
      this.showOnboarding();
    } else {
      this.syncButton.setVisible(true);
      this.resetButton.setVisible(true);
      this.statusText.setText(`${cachedDecks.length} Local Decks Ready`);
    }
  }

  private showOnboarding() {
    OnboardingOverlay.show(async () => {
      // User clicked "Link Folders Now"
      await this.triggerScan();
    });
  }

  private async triggerScan() {
    ScanProgressOverlay.show("Scanning Local Decks...");
    
    await this.scanner.scanDecks(
      async () => {
        // Scan complete callback
        ScanProgressOverlay.hide();
        this.syncButton.setVisible(true);
        this.resetButton.setVisible(true);
        
        // Reload cache and refresh status
        const updatedDecks = await this.db.getAllCachedMetadata();
        log("LocalDecksScene", `Post-scan: ${updatedDecks.length} decks in cache.`);
        this.statusText.setText(`${updatedDecks.length} Local Decks Loaded`);
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
