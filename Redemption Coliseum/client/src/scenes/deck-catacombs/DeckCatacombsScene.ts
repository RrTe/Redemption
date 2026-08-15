import Phaser from "phaser";
import { MenuTile, type MenuTileData } from "../../ui/components/MenuTile";
import { type SoundManager } from "../../managers/SoundManager";
import { SidebarButton } from "../../ui/components/SidebarButton";
import { SettingsDialogScene } from "../SettingsDialogScene";
import { HelpOverlay } from "../../ui/overlays";

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
    this.load.image(
      "deck_catacombs_bg",
      "assets/backgrounds/Copilot_20260517_235633_Catacombs.png"
    );

    this.load.image(
      "btn_local_decks",
      "assets/backgrounds/Copilot_20260720_233159_Chest.png"
    );

    this.load.image(
      "btn_prebuilt_decks",
      "assets/backgrounds/Copilot_20260815_001449-armory_compressed.jpg"
    );

    this.load.image(
      "btn_community_decks",
      "assets/backgrounds/Copilot_20260720_233159_Library.png"
    );

    this.load.image(
      "chain_lock_overlay",
      "assets/gfx/Copilot_20260805_231447_chain_lock_small_compressed.png"
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

    this.background = this.add.image(width / 2, height / 2, "deck_catacombs_bg");
    this.adjustBackgroundSize();

    this.createTiles(width, height);
    this.createSideButtons(width, height);

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
      true,
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
      false,
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
      false,
      () => {
        if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
        HelpOverlay.toggle();
      }
    );
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

  private createTiles(width: number, height: number) {
    this.buttons.forEach((b) => b.destroy());
    this.buttons = [];

    const targetWidth = Math.min(width * 0.34, height * 0.52);
    const colLeftX = width * 0.30;
    const colRightX = width * 0.70;
    const rowTopY = height * 0.28;
    const rowBottomY = height * 0.74;

    const tileConfigs: { data: MenuTileData; x: number; y: number }[] = [
      {
        data: {
          id: "local_decks",
          imageKey: "btn_local_decks",
          labelText: "Local Decks",
          enabled: true,
          comingSoon: false,
          action: () => {
            if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
            this.scene.start("LocalDecksScene", { initialMode: "local" });
          },
        },
        x: colLeftX,
        y: rowTopY,
      },
      {
        data: {
          id: "prebuilt_decks",
          imageKey: "btn_prebuilt_decks",
          labelText: "Prebuilt Decks",
          enabled: true,
          comingSoon: false,
          action: () => {
            if (this.soundManager) this.soundManager.playSound("MENU_SELECT");
            this.scene.start("LocalDecksScene", { initialMode: "prebuilt" });
          },
        },
        x: colLeftX,
        y: rowBottomY,
      },
      {
        data: {
          id: "community_decks",
          imageKey: "btn_community_decks",
          labelText: "Community Decks",
          enabled: false,
          comingSoon: false,
          overlayImageKey: "chain_lock_overlay",
          action: () => {
            if (this.soundManager) this.soundManager.playSound("UI_TOGGLE");
          },
        },
        x: colRightX,
        y: rowTopY,
      },
      {
        data: {
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
        x: colRightX,
        y: rowBottomY,
      },
    ];

    tileConfigs.forEach((cfg) => {
      const tile = new MenuTile(this, cfg.x, cfg.y, cfg.data, targetWidth);
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
