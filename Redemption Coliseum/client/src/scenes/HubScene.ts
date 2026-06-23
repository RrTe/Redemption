import Phaser from "phaser";
import { type SoundManager } from "../managers/SoundManager";
import { SettingsDialogScene } from "./SettingsDialogScene";

const DECK_EDITOR_ENABLED = true; // Feature toggle to easily enable/disable deck editor access

export class HubScene extends Phaser.Scene {
  private soundManager!: SoundManager;
  private buttons: { container: Phaser.GameObjects.Container }[] = [];
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
      "assets/ui/buttons/Copilot_20260517_235633_Coliseum_neu.png",
    );
    this.load.image(
      "btn_catacombs_img",
      "assets/ui/buttons/Copilot_20260517_235633_Catacombs.png",
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
    // Clear previous elements and active tweens to prevent memory leaks
    this.buttons.forEach((b) => {
      const tweens = b.container.getData("rayTweens") as Phaser.Tweens.Tween[];
      if (tweens) {
        tweens.forEach((t) => t.stop());
      }
      b.container.destroy();
    });
    this.buttons = [];

    // Dynamically generate the MTG Arena-style golden wispy ray burst texture
    if (!this.textures.exists("gold_ray_burst")) {
      const size = 512;
      const rt = this.make.graphics({ x: 0, y: 0 });

      const centerX = size / 2;
      const centerY = size / 2;
      const rayCount = 36; // Wispy feel
      const outerRadius = size / 2;

      // Draw a soft central core glow decaying quadratically
      for (let r = outerRadius; r > 10; r -= 4) {
        const alpha = Math.pow(1 - r / outerRadius, 2.8) * 0.15;
        rt.fillStyle(0xffffff, alpha);
        rt.fillCircle(centerX, centerY, r);
      }

      // Draw very thin, low opacity radiating wispy lines (no thick blocky spikes)
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const length = outerRadius * (0.6 + 0.4 * Math.sin(i * 3.5));

        rt.lineStyle(1.8, 0xffffff, 0.04); // 1.8px width, only 4% opacity for wispy streaks
        rt.beginPath();
        rt.moveTo(centerX, centerY);
        rt.lineTo(
          centerX + Math.cos(angle) * length,
          centerY + Math.sin(angle) * length,
        );
        rt.strokePath();
      }

      rt.generateTexture("gold_ray_burst", size, size);
      rt.destroy();
    }

    const buttonData = [
      {
        id: "deck_catacombs",
        imageKey: "btn_catacombs_img",
        labelText: "Deck Catacombs",
        enabled: DECK_EDITOR_ENABLED,
        comingSoon: !DECK_EDITOR_ENABLED,
        action: () => {
          if (DECK_EDITOR_ENABLED) {
            this.scene.start("GameLoadingScene", {
              targetScene: "DeckEditorScene",
              backgroundKey: "btn_catacombs_img",
            });
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
      const container = this.add.container(posX, centerY);
      container.setData("id", data.id);

      // Get original texture size to calculate scale
      const texture = this.textures.get(data.imageKey).getSourceImage();
      const originalW = texture ? texture.width : 500;
      const targetScale = targetWidth / originalW;

      const displayWidth = targetWidth;
      const displayHeight = texture ? texture.height * targetScale : 300;

      // 1. MTG Arena-style Rotating Golden Ray Flares (behind shadow & image)
      const rayScale = (displayWidth * 1.5) / 512;

      // Base soft radial glow
      const baseGlow = this.add.image(0, 0, "light_glow");
      baseGlow.setScale((displayWidth * 1.8) / 512);
      baseGlow.setTint(0xff8c00); // warm orange/gold
      baseGlow.setAlpha(0);
      baseGlow.setBlendMode(Phaser.BlendModes.ADD);
      container.add(baseGlow);

      const ray1 = this.add.image(0, 0, "gold_ray_burst");
      ray1.setScale(rayScale);
      ray1.setTint(0xffd700); // Yellow-gold
      ray1.setAlpha(0);
      ray1.setBlendMode(Phaser.BlendModes.ADD);
      container.add(ray1);

      const ray2 = this.add.image(0, 0, "gold_ray_burst");
      ray2.setScale(rayScale * 1.15);
      ray2.setTint(0xffa500); // Layered depth
      ray2.setAlpha(0);
      ray2.setBlendMode(Phaser.BlendModes.ADD);
      container.add(ray2);

      // 2. Offset Shadow for 3D elevation look
      const shadow = this.add.image(15, 15, data.imageKey);
      shadow.setScale(targetScale);
      shadow.setTint(0x000000);
      shadow.setAlpha(0.45);
      container.add(shadow);

      // 3. Main Image Button
      const btnImg = this.add.image(0, 0, data.imageKey);
      btnImg.setScale(targetScale);
      btnImg.setInteractive({ useHandCursor: true });
      container.add(btnImg);

      // 4. Rounded Corner Masks (using off-display-list graphics objects in world space so they render correctly)
      const maskGfx = this.make.graphics({ x: posX, y: centerY });
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillRoundedRect(
        -displayWidth / 2,
        -displayHeight / 2,
        displayWidth,
        displayHeight,
        20,
      );

      const shadowMaskGfx = this.make.graphics({ x: posX, y: centerY });
      shadowMaskGfx.fillStyle(0xffffff);
      shadowMaskGfx.fillRoundedRect(
        -displayWidth / 2 + 15,
        -displayHeight / 2 + 15,
        displayWidth,
        displayHeight,
        20,
      );

      // Apply geometry masks
      btnImg.setMask(maskGfx.createGeometryMask());
      shadow.setMask(shadowMaskGfx.createGeometryMask());

      // 5. Darker Gold/Bronze Rounded Border outlining the image (0xb58c22 instead of 0xe9cd45)
      const border = this.add.graphics();
      border.lineStyle(3, 0xb58c22, 0.95);
      border.strokeRoundedRect(
        -displayWidth / 2,
        -displayHeight / 2,
        displayWidth,
        displayHeight,
        20,
      );
      container.add(border);

      // 6. Bitmap Text Label with subtle shadow below the button (stays stationary during hover lift)
      const labelShadow = this.add.bitmapText(
        0,
        displayHeight / 2 + 47,
        "fairydust",
        data.labelText,
        40,
      );
      labelShadow.setOrigin(0.5);
      labelShadow.setTint(0x000000);
      labelShadow.setAlpha(0.8);
      container.add(labelShadow);

      // 7. Larger Bitmap Text Label placed below the button (stays stationary during hover lift)
      const label = this.add.bitmapText(
        0,
        displayHeight / 2 + 45, // Moved lower to support larger font size
        "fairydust",
        data.labelText,
        40, // Increased font size to be significantly larger
      );
      label.setOrigin(0.5);
      label.setTint(0xfffae0);
      label.setDropShadow(3, 3, 0x000000, 0.8);
      container.add(label);

      // 8. Render 'Coming Soon' ribbon if deactivated
      if (data.comingSoon) {
        btnImg.setTint(0x777777);
        shadow.setAlpha(0.2);
        border.setAlpha(0.3);

        const bannerGraphics = this.add.graphics();
        const bannerW = targetWidth * 0.65;
        const bannerH = 22;

        bannerGraphics.fillStyle(0x8b0000, 0.9); // Deep dark red background
        bannerGraphics.fillRoundedRect(
          -bannerW / 2,
          btnImg.displayHeight / 2 - 16,
          bannerW,
          bannerH,
          4,
        );

        bannerGraphics.lineStyle(1.5, 0xe9cd45, 0.85); // Gold outline
        bannerGraphics.strokeRoundedRect(
          -bannerW / 2,
          btnImg.displayHeight / 2 - 16,
          bannerW,
          bannerH,
          4,
        );

        const bannerText = this.add
          .text(0, btnImg.displayHeight / 2 - 5, "COMING SOON", {
            fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
            fontSize: "11px",
            fontStyle: "bold",
            color: "#e9cd45",
            stroke: "#000000",
            strokeThickness: 2,
          })
          .setOrigin(0.5);

        container.add(bannerGraphics);
        container.add(bannerText);
      }

      // 3D Lift & Elevation Hover Logic (NO hover sound, NO particle effects)
      btnImg.on("pointerover", () => {
        // Lift image and border, scaling up slightly
        this.tweens.add({
          targets: [btnImg, border],
          y: -15,
          scale: (target) => (target === btnImg ? targetScale * 1.08 : 1.08),
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Lift main image mask in world space
        this.tweens.add({
          targets: maskGfx,
          y: centerY - 15,
          scale: 1.08,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Soften and grow shadow
        this.tweens.add({
          targets: shadow,
          y: 5,
          scale: targetScale * 1.05,
          alpha: 0.25,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Lift shadow mask in world space
        this.tweens.add({
          targets: shadowMaskGfx,
          y: centerY + 5,
          scale: 1.05,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Fade in MTG Arena-style golden rays
        this.tweens.add({
          targets: [baseGlow, ray1, ray2],
          alpha: (target) => (target === baseGlow ? 0.5 : 0.7),
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Continuous rotating and pulsing tweens for the rays
        const tweenRay1 = this.tweens.add({
          targets: ray1,
          angle: 360,
          duration: 12000,
          repeat: -1,
        });

        const tweenRay2 = this.tweens.add({
          targets: ray2,
          angle: -360,
          duration: 18000,
          repeat: -1,
        });

        const tweenPulse = this.tweens.add({
          targets: [ray1, ray2],
          scaleX: (idx) => (idx === 0 ? rayScale : rayScale * 1.15) * 1.12,
          scaleY: (idx) => (idx === 0 ? rayScale : rayScale * 1.15) * 1.12,
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        container.setData("rayTweens", [tweenRay1, tweenRay2, tweenPulse]);
      });

      btnImg.on("pointerout", () => {
        // Restore image and border position and scale
        this.tweens.add({
          targets: [btnImg, border],
          y: 0,
          scale: (target) => (target === btnImg ? targetScale : 1.0),
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Restore main mask position and scale in world space
        this.tweens.add({
          targets: maskGfx,
          y: centerY,
          scale: 1.0,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Restore shadow position, scale, and alpha
        this.tweens.add({
          targets: shadow,
          y: 15,
          scale: targetScale,
          alpha: 0.45,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Restore shadow mask position and scale in world space
        this.tweens.add({
          targets: shadowMaskGfx,
          y: centerY,
          scale: 1.0,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Fade out golden rays
        this.tweens.add({
          targets: [baseGlow, ray1, ray2],
          alpha: 0,
          duration: 200,
          ease: "Cubic.easeOut",
        });

        // Stop active ray animation tweens
        const tweens = container.getData("rayTweens") as Phaser.Tweens.Tween[];
        if (tweens) {
          tweens.forEach((t) => t.stop());
        }
        ray1.setAngle(0);
        ray2.setAngle(0);
      });

      btnImg.on("pointerdown", data.action);

      this.buttons.push({ container });
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
