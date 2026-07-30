import Phaser from "phaser";
import { MenuTile, type MenuTileData } from "../../ui/components/MenuTile";
import { type SoundManager } from "../../managers/SoundManager";
import { DirectoryPicker } from "../../utils/DirectoryPicker";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { SettingsDialogScene } from "../SettingsDialogScene";
import { HelpOverlay } from "../../ui/overlays";
import { log } from "../../utils/logger";
export class DeckCatacombsScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private background!: Phaser.GameObjects.Image;
  private exitButton!: SidebarButton;
  private buttons: MenuTile[] = [];
  private settingsButton!: SidebarButton;
  private helpButton!: SidebarButton;

  constructor() {
    super("DeckCatacombsScene");
  }

  preload() {
    // Background image
    this.load.image(
      "deck_catacombs_bg",
      "assets/backgrounds/Copilot_20260517_235633_Catacombs.png"
    );

    // Tiles image placeholder
    this.load.image(
      "btn_catacombs_img",
      "assets/backgrounds/Copilot_20260517_235633_Catacombs.png"
    );

    this.load.image(
      "btn_local_decks",
      "assets/backgrounds/Copilot_20260720_233159_Chest.png"
    );

    this.load.image(
      "btn_community_decks",
      "assets/backgrounds/Copilot_20260720_233159_Library.png"
    );

    this.load.image(
      "btn_deck_editor",
      "assets/backgrounds/Copilot_20260721_210751_Deck_Blacksmith.png"
    );

    // Particles/flares for premium hover glow effect (MenuTile needs these)
    this.load.image("light_glow", "assets/particles/lightGlow.png");

    // UI elements
    this.load.image(
      "button_exit",
      "assets/ui/buttons/Button_Copilot_20260730_001735_exit.png"
    );

    // Settings and Help Buttons
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png"
    );
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png"
    );

    // Fonts
    this.load.bitmapFont(
      "fairydust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml"
    );
  }

  create() {
    if (!this.scene.get("SettingsDialogScene")) {
      this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
    }

    this.soundManager = this.registry.get("soundManager");

    const width = this.scale.width;
    const height = this.scale.height;

    // Render background image stretch-fitted to game bounds using ENVELOP
    this.background = this.add.image(width / 2, height / 2, "deck_catacombs_bg");
    this.adjustBackgroundSize();

    // Create 3 Menu Tiles
    this.createTiles(width, height);

    // Create Side Buttons
    this.createSideButtons(width, height);

    // Handle screen resize
    this.scale.on("resize", this.resize, this);
  }

  private createSideButtons(width: number, height: number) {
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
        this.scene.launch("SettingsDialogScene", { parentScene: "DeckCatacombsScene" });
      }
    );

    this.exitButton = new SidebarButton(
      this,
      "button_exit",
      height * 0.18,
      false, // Left side
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        this.scene.start("HubScene");
      },
      "button_exit_to_hub"
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

  private createTiles(width: number, height: number) {
    this.buttons.forEach((b) => b.destroy());
    this.buttons = [];

    const buttonData: MenuTileData[] = [
      {
        id: "local_decks",
        imageKey: "btn_local_decks",
        labelText: "Local Decks",
        enabled: true,
        comingSoon: false,
        action: async () => {
          if (this.soundManager) this.soundManager.playSound("MENU_SELECT");

          this.scene.start("LocalDecksScene");
        },
      },
      {
        id: "community_decks",
        imageKey: "btn_community_decks",
        labelText: "Community Decks",
        enabled: true,
        comingSoon: false,
        action: () => {
          if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
          console.log("[DEBUG] Community Decks geklickt");
        },
      },
      {
        id: "deck_editor",
        imageKey: "btn_deck_editor",
        labelText: "Deck Smith",
        enabled: true,
        comingSoon: false,
        action: () => {
          if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
          this.scene.start("GameLoadingScene", {
            targetScene: "DeckEditorScene",
            backgroundKey: "btn_deck_editor",
          });
        },
      },
    ];

    // Layout settings for 3 tiles
    const targetWidth = width * 0.25; // Slightly smaller to fit 3
    const gap = width * 0.05;

    // Calculate starting X so they are centered
    const totalWidth = (targetWidth * 3) + (gap * 2);
    const startX = (width - totalWidth) / 2 + targetWidth / 2;
    const centerY = height * 0.55;

    buttonData.forEach((data, index) => {
      const posX = startX + index * (targetWidth + gap);
      const tile = new MenuTile(this, posX, centerY, data, targetWidth);
      this.buttons.push(tile);
    });
  }

  resize(gameSize: { width: number; height: number }) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.adjustBackgroundSize();
    this.createTiles(width, height);

    if (this.settingsButton) this.settingsButton.resize(width, height * 0.18);
    if (this.exitButton) this.exitButton.resize(width, height * 0.18);
    if (this.helpButton) this.helpButton.resize(width, height * 0.7);
  }
}
