import Phaser from "phaser";
import { DEBUG } from "../../utils/logger";
import type { SettingsManager } from "../../managers/SettingsManager";
import type { CardUI } from "../CardUI";
import { PILE_ZONES } from "../../../../shared/zones";
import { SHADOW_CONFIG } from "./CardPhysicsEffects";
import { AssetManager } from "../managers/AssetManager";

const IMAGE_BASE_URL = "/assets/cards/";

/**
 * Steuert die visuellen Effekte einer einzelnen Karte (Glow, Paralyze, Noise).
 * Fungiert als Komponente der CardUI, nicht als globaler Manager.
 */
export class CardVisuals {
  private scene: Phaser.Scene;
  private cardUI: CardUI;

  // Core Visuals
  private cardFrontImage: Phaser.GameObjects.Image | null = null;
  private cardBackImage: Phaser.GameObjects.Image | null = null;
  private background: Phaser.GameObjects.Rectangle;
  private shadow: Phaser.GameObjects.NineSlice;
  private brightnessOverlay: Phaser.GameObjects.Rectangle;

  // Dual Card Badge
  private badgeImage: Phaser.GameObjects.Image | null = null;
  private badgeBg: Phaser.GameObjects.Graphics | null = null;

  // Glow / Spark Effect
  private glowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null =
    null;

  // Paralyze Effect
  private paralyzeEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private paralyzeMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  private paralyzeMask: Phaser.Display.Masks.GeometryMask | null = null;

  // Noise / Foil Effect
  private noiseGraphics: Phaser.GameObjects.Graphics | null = null;
  private noisePoints: {
    x: number;
    y: number;
    alpha: number;
    speedX: number;
    speedY: number;
    flicker: number;
  }[] = [];

  // Debugging
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, cardUI: CardUI) {
    this.scene = scene;
    this.cardUI = cardUI;

    // 1. Schatten (NineSlice) - Ganz nach hinten
    this.shadow = scene.add.nineslice(
      SHADOW_CONFIG.OFFSET_REST,
      SHADOW_CONFIG.OFFSET_REST,
      "drop_shadow",
      undefined,
      cardUI.width + SHADOW_CONFIG.PADDING,
      cardUI.height + SHADOW_CONFIG.PADDING,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
    );
    this.shadow
      .setAlpha(SHADOW_CONFIG.ALPHA_REST)
      .setTint(0x000000)
      .setOrigin(0.5);
    this.cardUI.add(this.shadow);

    // 2. Platzhalter-Hintergrund
    this.background = scene.add.rectangle(
      0,
      0,
      cardUI.width,
      cardUI.height,
      0x222222,
    );
    this.background.setStrokeStyle(2, 0xeeeeee);
    this.cardUI.add(this.background);

    // 3. Brightness Overlay (Additiv)
    this.brightnessOverlay = scene.add.rectangle(
      0,
      0,
      cardUI.width,
      cardUI.height,
      0xffffff,
    );
    this.brightnessOverlay
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.cardUI.add(this.brightnessOverlay);

    if (this.badgeBg) {
      this.badgeBg.setPosition(0, 0);
    }
    if (this.badgeImage) {
      this.badgeImage.setPosition(0, 0);
    }
  }

  /** Prüft globale Einstellungen. */
  private areEffectsEnabled(): boolean {
    const settings = this.scene.registry.get(
      "settingsManager",
    ) as SettingsManager;
    return settings ? settings.areAnimationsEnabled() : true;
  }

  /** Orchestriert das Laden der Bilder via AssetManager. */
  public loadImages(assetManager: AssetManager) {
    const { cardData } = this.cardUI;

    // Vorderseite
    const frontKey = `card-${cardData.ImageFile}`;
    const frontUrl = `${IMAGE_BASE_URL}${cardData.ImageFile}.jpg`;
    assetManager.loadCardImage(
      frontKey,
      frontUrl,
      (key) => {
        if (!this.scene || !this.cardUI.active) return;
        this.setFrontImage(key);
        this.finalizeImageSetup();
      },
      this.scene,
    );

    // Rückseite
    const backKey = "card-back";
    const backUrl = `${IMAGE_BASE_URL}cardback.jpg`;
    assetManager.loadCardImage(
      backKey,
      backUrl,
      (key) => {
        if (!this.scene || !this.cardUI.active) return;
        this.setBackImage(key);
        this.finalizeImageSetup();
      },
      this.scene,
    );
  }

  private finalizeImageSetup() {
    this.cardUI.bringToTop(this.brightnessOverlay);
    // @ts-ignore - Zugriff auf private Komponente für Re-Stacking
    this.cardUI.counterVisuals?.onUpdateSize();
    // ✨ FIX: Nutze den tatsächlichen Sperrstatus der Karte
    this.updateVisibility(
      this.cardUI.isCurrentlyFaceDown(),
      this.cardUI.isLocked,
    );
    this.onUpdateSize();
    this.updateBadge();
  }

  /** Setzt das Vorderseiten-Bild nach dem Laden. */
  public setFrontImage(key: string) {
    if (this.cardFrontImage) this.cardFrontImage.destroy();
    this.cardFrontImage = this.scene.add.image(0, 0, key);
    this.cardFrontImage.setDisplaySize(this.cardUI.width, this.cardUI.height);
    this.cardUI.add(this.cardFrontImage);
  }

  /** Setzt das Rückseiten-Bild nach dem Laden. */
  public setBackImage(key: string) {
    if (this.cardBackImage) this.cardBackImage.destroy();
    this.cardBackImage = this.scene.add.image(0, 0, key);
    this.cardBackImage.setDisplaySize(this.cardUI.width, this.cardUI.height);
    this.cardUI.add(this.cardBackImage);
  }

  /** Zentrale Steuerung der Sichtbarkeit aller Layer. */
  public updateVisibility(isFaceDown: boolean, isLockedHidden: boolean) {
    const hasFront = !!this.cardFrontImage;
    const hasBack = !!this.cardBackImage;

    // 1. Layer-Sichtbarkeit
    if (this.cardFrontImage) this.cardFrontImage.setVisible(!isFaceDown);
    if (this.cardBackImage) this.cardBackImage.setVisible(isFaceDown);

    // 2. Platzhalter zeigen, wenn das benötigte Bild fehlt
    const currentImageMissing = isFaceDown ? !hasBack : !hasFront;
    this.background.setVisible(currentImageMissing);

    // 3. Container-Sichtbarkeit (Sperre berücksichtigen)
    if (isLockedHidden) {
      this.cardUI.setVisible(false);
      return;
    }

    const shouldBeVisible =
      (this.cardFrontImage?.visible && this.cardFrontImage.active) ||
      (this.cardBackImage?.visible && this.cardBackImage.active) ||
      this.background.visible;

    this.cardUI.setVisible(shouldBeVisible);
    this.updateBadge();
  }

  /** Wendet Tint auf die Bilder an. */
  public setTint(color: number | undefined) {
    if (color === undefined) {
      this.cardFrontImage?.clearTint();
      this.cardBackImage?.clearTint();
    } else {
      this.cardFrontImage?.setTint(color);
      this.cardBackImage?.setTint(color);
    }
  }

  /** Steuert den Helligkeitseffekt. */
  public applyBrightnessEffect(
    isLight: boolean,
    alpha: number,
    tintColor?: number,
  ) {
    if (isLight) {
      this.setTint(undefined);
      this.brightnessOverlay.setVisible(true).setAlpha(alpha);
    } else if (tintColor !== undefined) {
      this.brightnessOverlay.setVisible(false);
      this.setTint(tintColor);
    }
  }

  // Hilfsmethode für das Badge-Icon
  private getIconForType(typeStr: string): string {
    if (!typeStr) return ""; 
    
    const typeUpper = typeStr.toUpperCase();
    if (typeUpper.includes("HERO")) return "Hero";
    if (typeUpper.includes("EVIL CHARACTER") || typeUpper === "EC") return "EC";
    if (typeUpper.includes("GOOD ENHANCEMENT") || typeUpper === "GE") return "GE";
    if (typeUpper.includes("EVIL ENHANCEMENT") || typeUpper === "EE") return "EE";
    if (typeUpper.includes("COVENANT")) return "Cov";
    if (typeUpper.includes("CURSE")) return "Curse";
    if (typeUpper.includes("ARTIFACT")) return "Art";
    if (typeUpper.includes("SITE")) return "Site";
    if (typeUpper.includes("GOOD DOMINANT")) return "GoodDom";
    if (typeUpper.includes("EVIL DOMINANT")) return "EvilDom";
    if (typeUpper.includes("GOOD FORTRESS") || typeUpper === "GOOD FORT") return "GoodFort";
    if (typeUpper.includes("EVIL FORTRESS") || typeUpper === "EVIL FORT") return "EvilFort";
    
    return ""; 
  }

  public syncBadgeRotation() {
    // ✨ FIX: Wenn der Container (cardUI) gedreht wird, 
    // drehen wir das Badge exakt entgegengesetzt, sodass es immer aufrecht bleibt!
    if (this.badgeBg) {
      this.badgeBg.setRotation(-this.cardUI.rotation);
    }
    if (this.badgeImage) {
      this.badgeImage.setRotation(-this.cardUI.rotation);
    }
  }

  public updateBadge() {
    const { cardData } = this.cardUI;
    const isDualCard = cardData.inGameType && cardData.inGameType !== cardData.Type;

    if (isDualCard && !this.cardUI.isCurrentlyFaceDown()) {
       const iconId = this.getIconForType(cardData.inGameType);
       if (iconId) {
         const textureKey = `${iconId}_small`;
         if (this.scene.textures.exists(textureKey)) {
             if (!this.badgeBg) {
               this.badgeBg = this.scene.add.graphics();
               // Zeichne einen runden Hintergrund (Farbe wie DeckEditor Buttonbars)
               this.badgeBg.fillStyle(0x1a1a2e, 0.9);
               this.badgeBg.fillCircle(0, 0, 24);
               this.badgeBg.lineStyle(2, 0x444466, 0.8);
               this.badgeBg.strokeCircle(0, 0, 24);
               
               this.badgeBg.setPosition(0, 0);
               this.cardUI.add(this.badgeBg);
             }
           
           if (!this.badgeImage) {
             this.badgeImage = this.scene.add.image(0, 0, textureKey);
             this.badgeImage.setOrigin(0.5);
             // ✨ Badge skalieren, passend zum Kreis (deutlich größer)
             this.badgeImage.setScale(1.8);
             this.cardUI.add(this.badgeImage);
           } else {
             this.badgeImage.setTexture(textureKey);
           }
           
           // Stelle sicher, dass Hintergrund und dann das Bild oben liegen
           this.cardUI.bringToTop(this.badgeBg);
           this.cardUI.bringToTop(this.badgeImage);
           return;
         }
       }
    }

    if (this.badgeBg) {
      this.badgeBg.destroy();
      this.badgeBg = null;
    }
    if (this.badgeImage) {
      this.badgeImage.destroy();
      this.badgeImage = null;
    }
  }

  /** Aktualisiert den Schattenzustand. */
  public updateShadowState(offset: number, alpha: number, scale: number) {
    const rad = -this.cardUI.rotation;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this.shadow.setPosition(
      offset * cos - offset * sin,
      offset * sin + offset * cos,
    );
    this.shadow.setAlpha(alpha).setScale(scale);
  }

  /** Setzt Drag-Effekte zurück. */
  public resetEffects() {
    this.brightnessOverlay.setVisible(false);
    this.setTint(undefined);
  }

  /** Startet den Glow-Effekt (z.B. bei Mouseover). */
  public startGlow(ignoreZoneCheck: boolean = false) {
    if (!this.areEffectsEnabled()) return;
    if (!ignoreZoneCheck && PILE_ZONES.includes(this.cardUI.currentZone))
      return;
    this.updateGlowZone(true, true);
  }

  /** Stoppt den Glow-Effekt. */
  public stopGlow() {
    if (this.glowEmitter) {
      this.glowEmitter.stop();
      this.glowEmitter.setVisible(false);
    }
  }

  /** Aktiviert oder deaktiviert den Paralyze-Effekt. */
  public updateParalyzeEffect(active: boolean) {
    if (active && this.areEffectsEnabled()) {
      if (this.paralyzeEmitters.length === 0) {
        this.createParalyzeEmitters();
      }
    } else {
      this.removeParalyzeEmitters();
    }
  }

  /** Wird bei Größenänderung der Karte aufgerufen. */
  public onUpdateSize() {
    const { width, height } = this.cardUI;
    this.background.setSize(width, height);
    this.brightnessOverlay.setSize(width, height);
    this.shadow.setSize(
      width + SHADOW_CONFIG.PADDING,
      height + SHADOW_CONFIG.PADDING,
    );
    this.cardFrontImage?.setDisplaySize(width, height);
    this.cardBackImage?.setDisplaySize(width, height);

    this.updateGlowZone();
    this.updateParalyzeZone();
    this.syncMaskState();
  }

  /** Wird jeden Frame aufgerufen (für Animationen). */
  public onUpdate() {
    this.syncMaskState();

    // Noise-Effekt Update
    if (this.noiseGraphics && this.areEffectsEnabled()) {
      this.noiseGraphics.clear();
      const w = this.cardUI.width;
      const h = this.cardUI.height;

      for (const pt of this.noisePoints) {
        pt.alpha += pt.flicker * (Math.random() > 0.5 ? 1 : -1);
        pt.alpha = Phaser.Math.Clamp(pt.alpha, 0.05, 0.12);
        pt.x += pt.speedX;
        pt.y += pt.speedY;

        if (pt.x < -w / 2) pt.x = w / 2;
        if (pt.x > w / 2) pt.x = -w / 2;
        if (pt.y < -h / 2) pt.y = h / 2;
        if (pt.y > h / 2) pt.y = -h / 2;

        this.noiseGraphics.fillStyle(0xffffff, pt.alpha);
        this.noiseGraphics.fillRect(pt.x, pt.y, 2, 2);
      }
    }
  }

  private updateGlowZone(
    createIfMissing: boolean = false,
    forceVisible?: boolean,
  ) {
    let w = this.cardUI.width;
    let h = this.cardUI.height;

    if (this.areEffectsEnabled()) {
      if (this.glowEmitter || createIfMissing) {
        let shouldBeVisible = true;
        if (forceVisible !== undefined) shouldBeVisible = forceVisible;
        else if (this.glowEmitter) shouldBeVisible = this.glowEmitter.visible;

        if (this.glowEmitter) this.glowEmitter.destroy();

        const shape = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
        this.glowEmitter = this.scene.add.particles(0, 0, "spark", {
          speedY: { min: -20, max: 20 },
          speedX: { min: -20, max: 20 },
          lifespan: { min: 10, max: 1200 },
          alpha: { start: 0.8, end: 0 },
          scale: { start: 0.1, end: 0 },
          quantity: 100,
          tint: [0xe0ffff, 0xc0c0c0, 0xffd700, 0xffffff],
          blendMode: "ADD",
          emitZone: { type: "edge", source: shape, quantity: 200 },
        });

        this.cardUI.add(this.glowEmitter);
        // ✨ FIX: Place above shadow (index 0) but below card contents
        this.cardUI.moveTo(this.glowEmitter, 1);

        if (shouldBeVisible) {
          this.glowEmitter.start();
          this.glowEmitter.setVisible(true);
        } else {
          this.glowEmitter.stop();
          this.glowEmitter.setVisible(false);
        }
      }
      this.createNoiseEffect(w, h);
    } else {
      if (this.glowEmitter) {
        this.glowEmitter.destroy();
        this.glowEmitter = null;
      }
      if (this.noiseGraphics) {
        this.noiseGraphics.destroy();
        this.noiseGraphics = null;
      }
    }

    if (DEBUG) {
      if (!this.debugGraphics) {
        this.debugGraphics = this.scene.add.graphics();
        this.cardUI.add(this.debugGraphics);
      }
      this.debugGraphics.clear();
      this.debugGraphics.lineStyle(2, 0x00ff00, 1);
      this.debugGraphics.strokeRectShape(
        new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      );
    } else if (this.debugGraphics) {
      this.debugGraphics.clear();
    }
  }

  private createNoiseEffect(width: number, height: number) {
    if (this.noiseGraphics) {
      this.noiseGraphics.destroy();
      this.noiseGraphics = null;
    }
    if (!this.areEffectsEnabled()) return;

    this.noiseGraphics = this.scene.add.graphics();
    this.cardUI.add(this.noiseGraphics);
    this.noiseGraphics.setBlendMode(Phaser.BlendModes.ADD);

    this.noisePoints = [];
    for (let i = 0; i < 200; i++) {
      this.noisePoints.push({
        x: Phaser.Math.Between(-width / 2, width / 2),
        y: Phaser.Math.Between(-height / 2, height / 2),
        alpha: Phaser.Math.FloatBetween(0.05, 0.12),
        speedX: Phaser.Math.FloatBetween(-0.05, 0.05),
        speedY: Phaser.Math.FloatBetween(0.05, 0.15),
        flicker: Phaser.Math.FloatBetween(0.005, 0.015),
      });
    }
  }

  private createParalyzeEmitters() {
    const w = this.cardUI.width;
    const h = this.cardUI.height;
    const scaleFactor = w / 303.2;
    const rect = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);

    const spark = this.scene.add.particles(0, 0, "blue_spark_small", {
      speedX: { min: -8, max: 8 },
      speedY: { min: -4, max: 4 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 800 },
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.7 * scaleFactor, end: 0.0 },
      quantity: 3,
      tint: [0x99ccff, 0xffffff],
      blendMode: "ADD",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });
    this.cardUI.add(spark);
    // ✨ FIX: Place above shadow (index 0)
    this.cardUI.moveTo(spark, 1);
    this.paralyzeEmitters.push(spark);

    const aura = this.scene.add.particles(0, 0, "blue_aura_small", {
      speedX: { min: -8, max: 8 },
      speedY: { min: -4, max: 4 },
      lifespan: { min: 1500, max: 3000 },
      alpha: { start: 0.3, end: 0 },
      scale: { start: 2.3 * scaleFactor, end: 3.3 * scaleFactor },
      quantity: 1,
      tint: [0x224466, 0x446688, 0x88aacc],
      blendMode: "SCREEN",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });
    this.cardUI.add(aura);
    // ✨ FIX: Place above shadow (index 0)
    this.cardUI.moveTo(aura, 1);
    this.paralyzeEmitters.push(aura);

    const lightning = this.scene.add.particles(0, 0, "blue_lightning", {
      lifespan: 500,
      alpha: { start: 0.8, end: 0.3 },
      scale: { start: 1.0 * scaleFactor, end: 0.8 * scaleFactor },
      quantity: 1,
      frequency: 150,
      tint: [0x99ccff, 0xccccff],
      blendMode: "ADD",
      emitZone: { type: "random", source: rect, quantity: 1 },
    });

    if (this.paralyzeMaskGraphics) this.paralyzeMaskGraphics.destroy();
    this.paralyzeMaskGraphics = this.scene.add.graphics().setVisible(false);
    this.paralyzeMaskGraphics.fillStyle(0xffffff);
    this.paralyzeMaskGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.paralyzeMask = this.paralyzeMaskGraphics.createGeometryMask();
    lightning.setMask(this.paralyzeMask);

    this.cardUI.add(lightning);
    this.cardUI.bringToTop(lightning);
    this.paralyzeEmitters.push(lightning);
  }

  private removeParalyzeEmitters() {
    this.paralyzeEmitters.forEach((e) => e.destroy());
    this.paralyzeEmitters = [];
    if (this.paralyzeMaskGraphics) {
      this.paralyzeMaskGraphics.destroy();
      this.paralyzeMaskGraphics = null;
    }
    this.paralyzeMask = null;
  }

  private updateParalyzeZone() {
    if (this.paralyzeEmitters.length > 0) {
      this.removeParalyzeEmitters();
      this.createParalyzeEmitters();
    }
  }

  private syncMaskState() {
    if (this.paralyzeMaskGraphics && this.cardUI.active) {
      this.paralyzeMaskGraphics.setPosition(this.cardUI.x, this.cardUI.y);
      this.paralyzeMaskGraphics.setRotation(this.cardUI.rotation);
      this.paralyzeMaskGraphics.setScale(
        this.cardUI.scaleX,
        this.cardUI.scaleY,
      );
    }
  }

  public destroy() {
    this.removeParalyzeEmitters();
    if (this.glowEmitter) this.glowEmitter.destroy();
    if (this.noiseGraphics) this.noiseGraphics.destroy();
    if (this.debugGraphics) this.debugGraphics.destroy();
  }
}
