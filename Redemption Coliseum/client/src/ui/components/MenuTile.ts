import Phaser from "phaser";

export interface MenuTileData {
  id: string;
  imageKey: string;
  labelText: string;
  enabled: boolean;
  comingSoon: boolean;
  action: () => void;
}

export class MenuTile {
  public container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    data: MenuTileData,
    targetWidth: number
  ) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    this.container.setData("id", data.id);

    this.ensureTextures();

    // Get original texture size to calculate scale
    const texture = scene.textures.get(data.imageKey).getSourceImage();
    const originalW = texture ? texture.width : 500;
    const targetScale = targetWidth / originalW;

    const displayWidth = targetWidth;
    const displayHeight = texture ? texture.height * targetScale : 300;

    // 1. MTG Arena-style Rotating Golden Ray Flares (behind shadow & image)
    const rayScale = (displayWidth * 1.5) / 512;

    // Base soft radial glow
    const baseGlow = scene.add.image(0, 0, "light_glow");
    baseGlow.setScale((displayWidth * 1.8) / 512);
    baseGlow.setTint(0xff8c00); // warm orange/gold
    baseGlow.setAlpha(0);
    baseGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(baseGlow);

    const ray1 = scene.add.image(0, 0, "gold_ray_burst");
    ray1.setScale(rayScale);
    ray1.setTint(0xffd700); // Yellow-gold
    ray1.setAlpha(0);
    ray1.setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(ray1);

    const ray2 = scene.add.image(0, 0, "gold_ray_burst");
    ray2.setScale(rayScale * 1.15);
    ray2.setTint(0xffa500); // Layered depth
    ray2.setAlpha(0);
    ray2.setBlendMode(Phaser.BlendModes.ADD);
    this.container.add(ray2);

    // 2. Offset Shadow for 3D elevation look
    const shadow = scene.add.image(15, 15, data.imageKey);
    shadow.setScale(targetScale);
    shadow.setTint(0x000000);
    shadow.setAlpha(0.45);
    this.container.add(shadow);

    // 3. Main Image Button
    const btnImg = scene.add.image(0, 0, data.imageKey);
    btnImg.setScale(targetScale);
    btnImg.setInteractive({ useHandCursor: true });
    this.container.add(btnImg);

    // 4. Rounded Corner Masks (using off-display-list graphics objects in world space so they render correctly)
    const maskGfx = scene.make.graphics({ x: x, y: y });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRoundedRect(
      -displayWidth / 2,
      -displayHeight / 2,
      displayWidth,
      displayHeight,
      20
    );

    const shadowMaskGfx = scene.make.graphics({ x: x, y: y });
    shadowMaskGfx.fillStyle(0xffffff);
    shadowMaskGfx.fillRoundedRect(
      -displayWidth / 2 + 15,
      -displayHeight / 2 + 15,
      displayWidth,
      displayHeight,
      20
    );

    // Apply geometry masks
    btnImg.setMask(maskGfx.createGeometryMask());
    shadow.setMask(shadowMaskGfx.createGeometryMask());

    // 5. Darker Gold/Bronze Rounded Border outlining the image
    const border = scene.add.graphics();
    border.lineStyle(3, 0xb58c22, 0.95);
    border.strokeRoundedRect(
      -displayWidth / 2,
      -displayHeight / 2,
      displayWidth,
      displayHeight,
      20
    );
    this.container.add(border);

    // 6. Bitmap Text Label with subtle shadow below the button
    const labelShadow = scene.add.bitmapText(
      0,
      displayHeight / 2 + 47,
      "fairydust",
      data.labelText,
      40
    );
    labelShadow.setOrigin(0.5);
    labelShadow.setTint(0x000000);
    labelShadow.setAlpha(0.8);
    this.container.add(labelShadow);

    // 7. Larger Bitmap Text Label placed below the button
    const label = scene.add.bitmapText(
      0,
      displayHeight / 2 + 45,
      "fairydust",
      data.labelText,
      40
    );
    label.setOrigin(0.5);
    label.setTint(0xfffae0);
    label.setDropShadow(3, 3, 0x000000, 0.8);
    this.container.add(label);

    // 8. Render 'Coming Soon' ribbon if deactivated
    if (data.comingSoon) {
      btnImg.setTint(0x777777);
      shadow.setAlpha(0.2);
      border.setAlpha(0.3);

      const bannerGraphics = scene.add.graphics();
      const bannerW = targetWidth * 0.65;
      const bannerH = 22;

      bannerGraphics.fillStyle(0x8b0000, 0.9); // Deep dark red background
      bannerGraphics.fillRoundedRect(
        -bannerW / 2,
        btnImg.displayHeight / 2 - 16,
        bannerW,
        bannerH,
        4
      );

      bannerGraphics.lineStyle(1.5, 0xe9cd45, 0.85); // Gold outline
      bannerGraphics.strokeRoundedRect(
        -bannerW / 2,
        btnImg.displayHeight / 2 - 16,
        bannerW,
        bannerH,
        4
      );

      const bannerText = scene.add
        .text(0, btnImg.displayHeight / 2 - 5, "COMING SOON", {
          fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#e9cd45",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5);

      this.container.add(bannerGraphics);
      this.container.add(bannerText);
    }

    // 3D Lift & Elevation Hover Logic
    btnImg.on("pointerover", () => {
      scene.tweens.add({
        targets: [btnImg, border],
        y: -15,
        scale: (target) => (target === btnImg ? targetScale * 1.08 : 1.08),
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: maskGfx,
        y: y - 15,
        scale: 1.08,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: shadow,
        y: 5,
        scale: targetScale * 1.05,
        alpha: 0.25,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: shadowMaskGfx,
        y: y + 5,
        scale: 1.05,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: [baseGlow, ray1, ray2],
        alpha: (target) => (target === baseGlow ? 0.5 : 0.7),
        duration: 200,
        ease: "Cubic.easeOut",
      });

      const tweenRay1 = scene.tweens.add({
        targets: ray1,
        angle: 360,
        duration: 12000,
        repeat: -1,
      });

      const tweenRay2 = scene.tweens.add({
        targets: ray2,
        angle: -360,
        duration: 18000,
        repeat: -1,
      });

      const tweenPulse = scene.tweens.add({
        targets: [ray1, ray2],
        scaleX: (idx) => (idx === 0 ? rayScale : rayScale * 1.15) * 1.12,
        scaleY: (idx) => (idx === 0 ? rayScale : rayScale * 1.15) * 1.12,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.container.setData("rayTweens", [tweenRay1, tweenRay2, tweenPulse]);
    });

    btnImg.on("pointerout", () => {
      scene.tweens.add({
        targets: [btnImg, border],
        y: 0,
        scale: (target) => (target === btnImg ? targetScale : 1.0),
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: maskGfx,
        y: y,
        scale: 1.0,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: shadow,
        y: 15,
        scale: targetScale,
        alpha: 0.45,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: shadowMaskGfx,
        y: y,
        scale: 1.0,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      scene.tweens.add({
        targets: [baseGlow, ray1, ray2],
        alpha: 0,
        duration: 200,
        ease: "Cubic.easeOut",
      });

      const tweens = this.container.getData("rayTweens") as Phaser.Tweens.Tween[];
      if (tweens) {
        tweens.forEach((t) => t.stop());
      }
      ray1.setAngle(0);
      ray2.setAngle(0);
    });

    btnImg.on("pointerdown", data.action);
  }

  private ensureTextures() {
    if (!this.scene.textures.exists("gold_ray_burst")) {
      const size = 512;
      const rt = this.scene.make.graphics({ x: 0, y: 0 });

      const centerX = size / 2;
      const centerY = size / 2;
      const rayCount = 36;
      const outerRadius = size / 2;

      for (let r = outerRadius; r > 10; r -= 4) {
        const alpha = Math.pow(1 - r / outerRadius, 2.8) * 0.15;
        rt.fillStyle(0xffffff, alpha);
        rt.fillCircle(centerX, centerY, r);
      }

      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const length = outerRadius * (0.6 + 0.4 * Math.sin(i * 3.5));

        rt.lineStyle(1.8, 0xffffff, 0.04);
        rt.beginPath();
        rt.moveTo(centerX, centerY);
        rt.lineTo(
          centerX + Math.cos(angle) * length,
          centerY + Math.sin(angle) * length
        );
        rt.strokePath();
      }

      rt.generateTexture("gold_ray_burst", size, size);
      rt.destroy();
    }
  }

  public destroy() {
    const tweens = this.container.getData("rayTweens") as Phaser.Tweens.Tween[];
    if (tweens) {
      tweens.forEach((t) => t.stop());
    }
    this.container.destroy();
  }

  // Allow repositioning which updates the world coordinates of the masks
  public setPosition(x: number, y: number) {
    this.container.setPosition(x, y);
  }
}
