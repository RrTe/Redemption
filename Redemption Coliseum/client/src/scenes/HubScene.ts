import Phaser from "phaser";
import { type SoundManager } from "../managers/SoundManager";
import { SettingsDialogScene } from "./SettingsDialogScene";
import { MenuTile } from "../ui/components/MenuTile";

const DECK_EDITOR_ENABLED = true; // Feature toggle to easily enable/disable deck editor access

export class HubScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private buttons: MenuTile[] = [];
  private background!: Phaser.GameObjects.Image;
  private settingsButton!: Phaser.GameObjects.Image;
  private titleText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super("HubScene");
  }

  preload() {
    // 1. Preload placeholder background image using specific key 'hub_bg'
    this.load.image(
      "hub_bg",
      "assets/backgrounds/Copilot_Hintergrrund_Temple_ganz_neu.png",
    );

    // 2. Preload button graphics and fonts
    this.load.image(
      "btn_coliseum_img",
      "assets/backgrounds/Copilot_20260517_235633_Coliseum_neu.png",
    );
    this.load.image(
      "btn_catacombs_img",
      "assets/backgrounds/Copilot_20260517_235633_Catacombs.png",
    );
    this.load.bitmapFont(
      "fairydust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml",
    );

    // 3. Preload particles/flares for premium hover glow effect
    this.load.image("light_glow", "assets/particles/lightGlow.png"); // Soft base glow

    // 4. Settings button assets
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png",
    );
    this.load.image("scroll_bg", "assets/ui/paper-8527340_optimised.png");

    // 5. UI click and selection sounds
    this.load.audio(
      "ui_toggle",
      "assets/sounds/effects/49053354-switch-2-307459.mp3",
    );
    this.load.audio("menu_select", "assets/sounds/effects/menu/select.mp3");
    this.load.audio("error", "assets/sounds/effects/whoosh-drama-383028.mp3");
  }

  create() {
    // Add SettingsDialogScene if it does not already exist in manager
    if (!this.scene.get("SettingsDialogScene")) {
      this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
    }

    this.soundManager = this.registry.get("soundManager");

    // Start background music via global SoundManager (random track playlist from server)
    this.soundManager.startBackgroundMusic();

    const width = this.scale.width;
    const height = this.scale.height;

    // Render background image stretch-fitted to game bounds (full opacity)
    this.background = this.add.image(width / 2, height / 2, "hub_bg");
    this.adjustBackgroundSize();

    // Render game title aligned with LobbyScene typography
    this.titleText = this.add.bitmapText(
      width / 2,
      height * 0.1,
      "fairydust",
      "Redemption Coliseum",
      64,
    );
    this.titleText.setOrigin(0.5);
    this.titleText.setTint(0xfff0a0);
    this.titleText.setDropShadow(4, 4, 0x000000, 0.8);

    // Create Hub Navigation Buttons
    this.createImageButtons(width, height);

    // Create Settings Sidebar Button (aligned 1:1 with LobbyScene)
    this.createSettingsButton(width, height);

    // Handle screen resize
    this.scale.on("resize", this.resize, this);
  }

  private adjustBackgroundSize() {
    const width = this.scale.width;
    const height = this.scale.height;

    // Scale background to cover viewport perfectly
    const scaleX = width / this.background.width;
    const scaleY = height / this.background.height;
    const scale = Math.max(scaleX, scaleY);
    this.background.setScale(scale);
  }

  private createImageButtons(width: number, height: number) {
    // Clear previous elements
    this.buttons.forEach((b) => {
      b.destroy();
    });
    this.buttons = [];

    const buttonData = [
      {
        id: "deck_catacombs",
        imageKey: "btn_catacombs_img",
        labelText: "Deck Catacombs",
        enabled: DECK_EDITOR_ENABLED,
        comingSoon: !DECK_EDITOR_ENABLED,
        action: () => {
          if (DECK_EDITOR_ENABLED) {
            // Load intermediate scene instead of directly to Deck Editor
            this.scene.start("DeckCatacombsScene");
          } else {
            this.soundManager.playSound("FORTRESS_IMPACT"); // locked / denied sound
            this.cameraShakeButton("deck_catacombs");
          }
        },
      },
      {
        id: "coliseum",
        imageKey: "btn_coliseum_img",
        labelText: "Stadium",
        enabled: true,
        comingSoon: false,
        action: () => {
          this.scene.start("LobbyScene");
        },
      },
    ];

    // Horizontal layout settings: increased button width (35% of page) and aligned 12% gap in between
    const targetWidth = width * 0.35;
    const gap = width * 0.12;
    const leftX = width / 2 - targetWidth / 2 - gap / 2;
    const rightX = width / 2 + targetWidth / 2 + gap / 2;
    const centerY = height * 0.55;

    buttonData.forEach((data, index) => {
      const posX = index === 0 ? leftX : rightX;
      
      const tile = new MenuTile(this, posX, centerY, data, targetWidth);
      this.buttons.push(tile);
    });
  }

  private cameraShakeButton(buttonId: string) {
    const btn = this.buttons.find(
      (b) => b.container.getData("id") === buttonId,
    );

    if (btn) {
      const originalX = btn.container.x;
      this.tweens.add({
        targets: btn.container,
        x: { from: originalX - 6, to: originalX + 6 },
        duration: 50,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          btn.container.x = originalX;
        },
      });
    }
  }

  private createSettingsButton(width: number, height: number) {
    if (this.settingsButton) this.settingsButton.destroy();

    // Position settings button aligned 1:1 with LobbyScene
    this.settingsButton = this.add
      .image(width + 12, height * 0.18, "button_settings")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDisplaySize(48, 48)
      .setAlpha(0.6);

    this.settingsButton.on("pointerover", () => {
      this.tweens.add({
        targets: this.settingsButton,
        x: width - 24,
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    this.settingsButton.on("pointerout", () => {
      this.tweens.add({
        targets: this.settingsButton,
        x: width + 12,
        duration: 200,
        ease: "Sine.easeOut",
      });
    });

    this.settingsButton.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      this.scene.pause();
      this.scene.launch("SettingsDialogScene", { parentScene: "HubScene" });
    });
  }

  resize(gameSize: { width: number; height: number }) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.adjustBackgroundSize();

    // Reposition and scale title text
    if (this.titleText) {
      this.titleText.setPosition(width / 2, height * 0.1);
      this.titleText.setFontSize(Math.max(32, Math.min(80, height * 0.1)));
    }

    this.createImageButtons(width, height);
    this.createSettingsButton(width, height);
  }
}
