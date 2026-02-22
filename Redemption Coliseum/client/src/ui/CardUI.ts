import Phaser from "phaser";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type { CardState } from "../../../shared/types";
import type { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Import für Typisierung
import { log, DEBUG } from "../utils/logger";

// ✨ Die Basis-URL, unter der die Kartenbilder zu finden sind.
const IMAGE_BASE_URL = "/assets/cards/";

// ✨ NEU: Zentrale Konfiguration für Schatten-Werte
// Hier kannst du alles an einer Stelle ändern!
const SHADOW_CONFIG = {
  OFFSET_REST: 10, // Versatz im Ruhezustand (x, y)
  OFFSET_DRAG: 25, // Versatz beim Ziehen (simulierte Höhe)
  ALPHA_REST: 0.4, // Transparenz im Ruhezustand (0-1)
  ALPHA_DRAG: 0.3, // Transparenz beim Ziehen (weicher)
  SCALE_DRAG: 1.1, // Skalierung beim Ziehen (wird größer)
  PADDING: 0, // Größenzuschlag für den Schatten (Breite/Höhe)
  SLICE: 6, // 9-Slice Randgröße (Ecken-Rundung)
};

// ✨ NEU: Farbe für den "Attach"-Rahmen (hier ändern!)
const ATTACH_BORDER_COLOR = 0xa4d4ff; // ✨ FIX: Frostiges Silberblau

// ✨ NEU: Skalierungsfaktoren für Attach-Icons (relativ zur Kartenbreite)
const ATTACH_ICON_SCALE_FEEDBACK = 0.5; // 50% der Kartenbreite für das Hover-Feedback
const ATTACH_ICON_SCALE_ANIMATION = 0.6; // 60% der Kartenbreite für die Erfolgs-Animation
// ✨ NEU: Verhältnis des beweglichen Icons zum Ziel-Icon (damit es nicht so wuchtig wirkt)
const ATTACH_MOVING_ICON_RATIO = 0.6; // Das fliegende Icon ist nur 60% so groß wie das Ziel

export class CardUI extends Phaser.GameObjects.Container {
  public cardData: CardState;
  private background: Phaser.GameObjects.Rectangle;
  private isFaceDown: boolean;
  public readonly instanceId: string; // ✨ NEU: Eindeutige ID für diese Instanz
  private cardFrontImage: Phaser.GameObjects.Image | null = null; // ✨ NEU: Explizit für die Vorderseite
  private cardBackImage: Phaser.GameObjects.Image | null = null; // ✨ NEU: Explizit für die Rückseite
  // ✨ FINALE LÖSUNG: Speichere die Zielposition direkt auf der Karte.
  public targetX: number = 0;
  public targetY: number = 0;
  public targetAngle: number = 0;
  private isLockedHidden: boolean = false; // ✨ NEU: Sperre für Sichtbarkeit
  public currentZone: Zone; // ✨ NEU: Eigener Speicher für die Zone, um Race Conditions zu vermeiden.
  private paralyzeText: Phaser.GameObjects.Text;
  private setasideText: Phaser.GameObjects.Text;
  private glowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null =
    null; // ✨ NEU: Der Partikel-Emitter
  public isBeingDragged: boolean = false; // ✨ NEU: Status für Drag-Vorgang
  private debugGraphics: Phaser.GameObjects.Graphics | null = null; // ✨ NEU: Debugging
  private paralyzeEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = []; // ✨ NEU: Emitter für Paralyze-Effekt
  private paralyzeMaskGraphics: Phaser.GameObjects.Graphics | null = null; // ✨ NEU: Maske für Blitze
  private paralyzeMask: Phaser.Display.Masks.GeometryMask | null = null; // ✨ NEU: Referenz auf die Maske selbst
  // ✨ NEU: Zielkoordinaten für die Drag-Physik (Trägheit)
  public dragTargetX: number | null = null;
  public dragTargetY: number | null = null;
  // ✨ NEU: Noise/Glitter Effekt
  private noiseGraphics: Phaser.GameObjects.Graphics | null = null;
  private noisePoints: {
    x: number;
    y: number;
    alpha: number;
    speedX: number;
    speedY: number;
    flicker: number;
  }[] = [];
  private pulseTime: number = Math.random() * 100; // ✨ NEU: Zufälliger Startwert für organischen Look
  private brightnessOverlay: Phaser.GameObjects.Rectangle; // ✨ NEU: Overlay für Helligkeitseffekte
  private shadow: Phaser.GameObjects.NineSlice; // ✨ NEU: Schatten
  private targetGlowGraphics: Phaser.GameObjects.Graphics | null = null; // ✨ NEU: Glow für Drop-Target
  private attachIcons: (
    | Phaser.GameObjects.Image
    | Phaser.GameObjects.Graphics
  )[] = []; // ✨ NEU: Icons & Backdrop
  private attachTween: Phaser.Tweens.Tween | null = null; // ✨ NEU: Tween für Attach-Animation

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cardData: CardState,
    width: number,
    height: number,
    isFaceDown: boolean = false, // ✨ NEU: Parameter, um die Karte verdeckt zu rendern
  ) {
    super(scene, x, y);
    this.cardData = cardData;
    this.isFaceDown = isFaceDown;
    this.currentZone = cardData.zone; // ✨ NEU: Initialisiere die Zone
    // ✨ NEU: Weise eine eindeutige, nicht veränderbare ID zu, um dieses Objekt zu verfolgen.
    this.instanceId = Phaser.Utils.String.UUID();

    this.setSize(width, height);

    // ✨ NEU: Schlagschatten (NineSlice)
    // Wir nutzen jetzt die zentrale SHADOW_CONFIG
    this.shadow = scene.add.nineslice(
      SHADOW_CONFIG.OFFSET_REST,
      SHADOW_CONFIG.OFFSET_REST,
      "drop_shadow",
      undefined,
      width + SHADOW_CONFIG.PADDING,
      height + SHADOW_CONFIG.PADDING,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
      SHADOW_CONFIG.SLICE,
    );
    this.shadow.setAlpha(SHADOW_CONFIG.ALPHA_REST);
    this.shadow.setTint(0x000000); // Sicherstellen, dass der Schatten schwarz ist
    this.shadow.setOrigin(0.5);
    this.add(this.shadow);
    // WICHTIG: Schatten ganz nach hinten schieben, aber vor eventuelle Partikel, die "hinter" der Karte sein sollen.
    // Da wir hier im Constructor sind, ist er das erste Kind -> ganz hinten.

    // Erstelle einen einfachen Hintergrund als Platzhalter, während das Bild lädt
    this.background = scene.add.rectangle(0, 0, width, height, 0x222222);
    this.background.setStrokeStyle(2, 0xeeeeee);
    this.add(this.background);

    // ✨ NEU: Overlay für Helligkeitseffekte (Additiv)
    this.brightnessOverlay = scene.add.rectangle(0, 0, width, height, 0xffffff);
    this.brightnessOverlay.setBlendMode(Phaser.BlendModes.ADD);
    this.brightnessOverlay.setVisible(false);
    this.add(this.brightnessOverlay);

    // ✨ DEIN PLAN: Lade BEIDE Kartenbilder (Vorder- und Rückseite) sofort.
    this.loadCardImages();

    // ✨ NEU: Counter-Texte erstellen
    const textStyle = {
      fontSize: `${Math.round(height * 0.15)}px`,
      color: "#ffff00",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 5,
    };

    this.paralyzeText = scene.add
      .text(0, -height / 2 + 5, "", textStyle)
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.setasideText = scene.add
      .text(0, height / 2 - 5, "", textStyle)
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.add([this.paralyzeText, this.setasideText]);

    // ✨ DEIN PLAN: Zeige initial das korrekte Bild an.
    this.updateImageVisibility();

    // ✨ FINALE LÖSUNG: Die Karte ist für ihre eigene Sichtbarkeit verantwortlich.
    // Wenn das benötigte Bild beim Erstellen noch nicht geladen ist,
    // startet die Karte unsichtbar und macht sich selbst sichtbar, sobald das Bild da ist.
    // Dies erzeugt den "Pop-in"-Effekt und verhindert graue Kästen.
    const imageIsReady = isFaceDown
      ? !!this.cardBackImage
      : !!this.cardFrontImage;
    if (!imageIsReady) {
      this.setVisible(false);
    }

    // Initialen Zustand der Counter setzen
    this.updateCounters();

    // Füge den Container zur Szene hinzu
    scene.add.existing(this);

    // Mache die Karte interaktiv (für Klicks, Drag & Drop etc.)
    // ✨ FIX: Setze explizite HitArea, damit Klicks auf Container zuverlässig funktionieren.
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
      draggable: true,
    });

    // ✨ NEU: Lausche auf Einstellungsänderungen, um Effekte live an-/abschalten zu können.
    this.scene.events.on("settings-changed", this.onSettingsChanged, this);

    // ✨ NEU: Permanente Update-Schleife für Physik und Masken-Sync
    this.scene.events.on("update", this.onSceneUpdate, this);
  }

  // ✨ DEIN PLAN: Überarbeitete Methode, die beide Bilder lädt.
  private loadCardImages() {
    // --- Lade die Kartenvorderseite ---
    const frontImageKey = `card-${this.cardData.ImageFile}`;
    const frontImageUrl = `${IMAGE_BASE_URL}${this.cardData.ImageFile}.jpg`;
    if (this.scene.textures.exists(frontImageKey)) {
      this.displayFrontImage(frontImageKey);
    } else {
      this.scene.load.once(`filecomplete-image-${frontImageKey}`, () => {
        this.displayFrontImage(frontImageKey);
      });
      // ✨ NEU: Mipmaps aktivieren
      this.scene.load.image({
        key: frontImageKey,
        url: frontImageUrl,
        config: { mipmaps: true },
      } as any); // ✨ FIX: Cast zu 'any'
    }

    // --- Lade die Kartenrückseite ---
    const backImageKey = "card-back";
    const backImageUrl = `${IMAGE_BASE_URL}cardback.jpg`;
    if (this.scene.textures.exists(backImageKey)) {
      this.displayBackImage(backImageKey);
    } else {
      this.scene.load.once(`filecomplete-image-${backImageKey}`, () => {
        this.displayBackImage(backImageKey);
      });
      // ✨ NEU: Mipmaps aktivieren
      this.scene.load.image({
        key: backImageKey,
        url: backImageUrl,
        config: { mipmaps: true },
      } as any); // ✨ FIX: Cast zu 'any'
    }

    this.scene.load.start();
  }

  // ✨ NEU: Separate Methode für die Vorderseite
  private displayFrontImage(imageKey: string) {
    if (!this.scene || !this.active) return; // Verhindere Fehler, wenn das Objekt zerstört wurde
    this.cardFrontImage = this.scene.add.image(0, 0, imageKey);
    this.cardFrontImage.setDisplaySize(this.width, this.height);
    this.add(this.cardFrontImage);

    this.bringToTop(this.brightnessOverlay); // ✨ FIX: Overlay muss über dem Bild liegen
    this.updateImageVisibility();
    this.updateGlowZone(); // ✨ NEU: Zone aktualisieren, sobald das Bild geladen und angezeigt wird.
    this.updateParalyzeZone(); // ✨ NEU: Auch Paralyze-Zone aktualisieren
  }

  // ✨ NEU: Separate Methode für die Rückseite
  private displayBackImage(imageKey: string) {
    if (!this.scene || !this.active) return; // Sicherheitscheck
    this.cardBackImage = this.scene.add.image(0, 0, imageKey);
    this.cardBackImage.setDisplaySize(this.width, this.height);
    this.add(this.cardBackImage);

    this.bringToTop(this.brightnessOverlay); // ✨ FIX: Overlay muss über dem Bild liegen
    this.updateImageVisibility();
    this.updateGlowZone(); // ✨ NEU: Zone aktualisieren, sobald das Bild geladen und angezeigt wird.
    this.updateParalyzeZone(); // ✨ NEU: Auch Paralyze-Zone aktualisieren
  }

  public updateSize(width: number, height: number) {
    // ✨ OPTIMIERUNG: Nur aktualisieren, wenn sich die Größe wirklich geändert hat.
    if (this.width === width && this.height === height) return;

    this.setSize(width, height);
    this.background.setSize(width, height);
    // ✨ KORREKTUR: Skaliere BEIDE Bilder, falls sie existieren.
    this.cardFrontImage?.setDisplaySize(width, height);
    this.cardBackImage?.setDisplaySize(width, height);
    this.brightnessOverlay.setSize(width, height); // ✨ NEU: Overlay anpassen
    this.shadow.setSize(
      width + SHADOW_CONFIG.PADDING,
      height + SHADOW_CONFIG.PADDING,
    ); // ✨ FIX: Konsistente Größe

    // ✨ NEU: Counter-Texte neu positionieren und skalieren
    const fontSize = `${Math.round(height * 0.15)}px`;
    this.paralyzeText.setFontSize(fontSize).setY(-height / 2 + 5);
    this.setasideText.setFontSize(fontSize).setY(height / 2 - 5);
    if (this.paralyzeText) this.bringToTop(this.paralyzeText);
    if (this.setasideText) this.bringToTop(this.setasideText);

    // ✨ ENTSCHEIDENDE KORREKTUR: Stelle sicher, dass die Karte interaktiv UND ziehbar bleibt.
    // Ein setInteractive()-Aufruf ohne draggable:true würde die Drag-Fähigkeit entfernen.
    // ✨ FIX: Aktualisiere das existierende HitArea-Objekt, statt ein neues zu setzen.
    if (this.input && this.input.hitArea instanceof Phaser.Geom.Rectangle) {
      this.input.hitArea.setTo(0, 0, width, height);
    } else {
      this.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
        draggable: true,
      });
    }

    // ✨ FIX: Maske sofort initial positionieren, damit sie beim ersten Render-Frame stimmt.
    this.syncMaskState();

    // ✨ FIX: Wenn sich die Größe ändert, müssen wir auch die Emitter-Zone und das Debug-Rechteck anpassen.
    // Das behebt das Problem, dass der grüne Rahmen nach dem Ausspielen kurzzeitig zu groß bleibt.
    this.updateGlowZone();
    this.updateParalyzeZone();
  }

  /** ✨ NEU: Wendet einen Tint-Effekt auf die Karte an. */
  public setTint(color: number) {
    // ✨ FIX: Tint auf beide Seiten anwenden, damit es auch verdeckt funktioniert
    this.cardFrontImage?.setTint(color);
    this.cardBackImage?.setTint(color);
  }

  /** ✨ NEU: Entfernt alle Tint-Effekte von der Karte. */
  public clearTint() {
    this.cardFrontImage?.clearTint();
    this.cardBackImage?.clearTint();
  }

  /** ✨ NEU: Aktualisiert den Face-Down-Status und lädt das Bild bei Bedarf neu. */
  public updateFaceDownStatus(isFaceDown: boolean) {
    // Wenn sich der Status não geändert hat, ist nichts zu tun.
    if (this.isFaceDown === isFaceDown) {
      return;
    }

    this.isFaceDown = isFaceDown;
    // ✨ DEIN PLAN: Ändere nur die Sichtbarkeit der bereits geladenen Bilder.
    this.updateImageVisibility();
  }

  /** ✨ NEU: Aktualisiert die Anzeige der Paralyze- und Set-Aside-Counter. */
  public updateCounters() {
    if (!this.cardData || !this.cardData.counters) return;

    const paralyzeValue = this.getCounter("paralyze");
    if (paralyzeValue > 0) {
      this.paralyzeText.setText(`P: ${paralyzeValue}`).setVisible(true);
    } else {
      this.paralyzeText.setVisible(false);
    }

    const setasideValue = this.getCounter("setaside");
    if (setasideValue > 0) {
      this.setasideText.setText(`SA: ${setasideValue}`).setVisible(true);
    } else {
      this.setasideText.setVisible(false);
    }

    // ✨ NEU: Paralyze-Effekt aktivieren/deaktivieren
    this.updateParalyzeEffect(paralyzeValue > 0);

    if (this.paralyzeText) this.bringToTop(this.paralyzeText);
    if (this.setasideText) this.bringToTop(this.setasideText);
  }

  /** ✨ NEU: Gibt zurück, ob die Karte aktuell verdeckt ist. */
  public isCurrentlyFaceDown(): boolean {
    return this.isFaceDown;
  }

  /**
   * ✨ NEU: Gibt zurück, ob die Karte paralysiert ist (Counter > 0).
   */
  public get isParalyzed(): boolean {
    return this.getCounter("paralyze") > 0;
  }

  /**
   * ✨ NEU: Gibt zurück, ob die Karte "Set Aside" ist (Counter > 0).
   */
  public get isSetAside(): boolean {
    return this.getCounter("setaside") > 0;
  }

  /** ✨ NEU: Steuert, ob die Karte zwangsweise versteckt bleiben soll (z.B. während Animationen). */
  public setLockedVisibility(locked: boolean) {
    this.isLockedHidden = locked;
    if (locked) {
      this.setVisible(false);
    } else {
      this.updateImageVisibility(); // Prüfe, ob wir uns jetzt zeigen dürfen
    }
  }

  /**
   * ✨ NEU: Setzt alle visuellen Effekte zurück, die während des Drags aktiv waren.
   */
  public resetDragEffects() {
    this.setRotation(0);
    this.setScale(1);
    this.clearTint();
    this.brightnessOverlay.setVisible(false);
  }

  /**
   * ✨ NEU: Setzt die Transparenz der Karte (für den "Geist"-Effekt beim Draggen über ein Ziel).
   */
  public setTransparent(isTransparent: boolean) {
    const alpha = isTransparent ? 0.5 : 1;
    // Wir setzen Alpha auf den Container, das wirkt auf alle Kinder (Bilder, Texte).
    this.setAlpha(alpha);
  }

  /**
   * ✨ NEU: Zeigt oder versteckt den "Ziel-Glow" (pulsierender Rahmen), wenn eine Karte darüber gehalten wird.
   */
  public showTargetGlow(show: boolean) {
    if (show) {
      if (!this.targetGlowGraphics) {
        this.targetGlowGraphics = this.scene.add.graphics();
        this.add(this.targetGlowGraphics);
        // Nach hinten schieben (aber vor den Schatten)
        this.sendToBack(this.targetGlowGraphics);
        if (this.shadow) this.sendToBack(this.shadow);
      }

      this.targetGlowGraphics.clear();
      this.targetGlowGraphics.lineStyle(4, ATTACH_BORDER_COLOR, 1); // ✨ FIX: Nutze Konstante
      // Etwas größer als die Karte zeichnen
      const w = this.width + 10;
      const h = this.height + 10;
      this.targetGlowGraphics.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

      // Pulsieren
      this.scene.tweens.add({
        targets: this.targetGlowGraphics,
        alpha: { from: 0.5, to: 1 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });

      // ✨ NEU: Zeige die Attach-Icons an
      this.showAttachFeedback(true);
    } else {
      if (this.targetGlowGraphics) {
        this.scene.tweens.killTweensOf(this.targetGlowGraphics);
        this.targetGlowGraphics.destroy();
        this.targetGlowGraphics = null;
      }
      // ✨ NEU: Verstecke die Attach-Icons
      this.showAttachFeedback(false);
    }
  }

  /**
   * ✨ NEU: Zeigt die animierten Icons an, die das "Anheften" symbolisieren.
   * Ein Icon ist statisch, das andere gleitet von rechts oben darüber.
   */
  private showAttachFeedback(show: boolean) {
    if (show) {
      if (this.attachIcons.length > 0) return; // Bereits aktiv

      // ✨ FIX: Größe relativ zur Karte berechnen (z.B. 50% der Kartenbreite)
      // Das macht uns unabhängig von der Auflösung der Quelldatei (64px vs 512px).
      const iconSize = this.width * ATTACH_ICON_SCALE_FEEDBACK;

      // ✨ NEU: Backdrop (Hintergrund-Kreis) für besseren Kontrast
      const backdrop = this.scene.add.graphics();
      backdrop.fillStyle(0x000000, 0.7); // Schwarz, 70% Deckkraft
      const radius = (iconSize / 2) * 1.25; // Etwas größer als das Icon (25% Puffer)
      backdrop.fillCircle(0, 0, radius);
      backdrop.setPosition(this.x, this.y);
      backdrop.setDepth(2999); // ✨ FIX: Unter den Icons (3000), aber über allem anderen
      this.attachIcons.push(backdrop);

      // Icon 1: Statisch (Basis) - Symbolisiert das Ziel
      // ✨ FIX: Zur Szene hinzufügen (statt Container), damit es über der Drag-Karte liegt (z-index)
      const icon1 = this.scene.add.image(this.x, this.y, "icon_attach_target");
      // ✨ FIX: Skaliere proportional zur Breite, um Verzerrung zu vermeiden (Seitenverhältnis beibehalten)
      icon1.displayWidth = iconSize;
      icon1.scaleY = icon1.scaleX;
      icon1.setAlpha(0.8);
      icon1.setDepth(3000); // ✨ FIX: Ganz nach oben (über Drag-Layer 1000)
      this.attachIcons.push(icon1);

      // Icon 2: Animiert (Slide) - Symbolisiert die Karte, die angeheftet wird
      // Startet rechts oben (relativ zur Mitte) und gleitet zur Mitte
      const startX = this.width * 0.25; // ✨ FIX: Relativer Startpunkt (25% der Breite nach rechts)
      const startY = -this.height * 0.25; // ✨ FIX: Relativer Startpunkt (25% der Höhe nach oben)

      // ✨ FIX: Position relativ zur Welt-Position der Karte berechnen
      const icon2 = this.scene.add.image(
        this.x + startX,
        this.y + startY,
        "icon_attach",
      );
      // ✨ FIX: Skaliere proportional zur Breite
      icon2.displayWidth = iconSize * ATTACH_MOVING_ICON_RATIO; // ✨ FIX: Dynamisch kleiner als das Ziel
      icon2.scaleY = icon2.scaleX;
      icon2.setAlpha(0); // Startet unsichtbar
      icon2.setDepth(3000); // ✨ FIX: Ganz nach oben
      this.attachIcons.push(icon2);

      // Animation: Einblenden und zur Mitte gleiten
      this.attachTween = this.scene.tweens.add({
        targets: icon2,
        x: this.x, // ✨ FIX: Ziel ist die Welt-Position der Karte
        y: this.y,
        alpha: { from: 0, to: 1, yoyo: true, hold: 200 }, // Pulsieren
        duration: 1000,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.attachIcons.forEach((icon) => icon.destroy());
      this.attachIcons = [];
      if (this.attachTween) {
        this.attachTween.stop();
        this.attachTween = null;
      }
    }
  }

  /**
   * ✨ NEU: Spielt die Attach-Animation ab (Icon fliegt).
   * Wird vom InputManager aufgerufen, wenn erfolgreich gedroppt wurde.
   */
  public playAttachAnimation() {
    // ✨ FIX: Auch hier relative Größen verwenden
    const targetSize = this.width * ATTACH_ICON_SCALE_ANIMATION;

    // ✨ FIX: Nutze das neue Success-Icon und füge es der Szene hinzu (Top Z-Index)
    const icon = this.scene.add.image(this.x, this.y, "icon_attach_success");
    icon.setDepth(3000); // ✨ FIX: Ganz oben

    // ✨ FIX: Skaliere proportional zur Breite, um Verzerrung zu vermeiden
    icon.displayWidth = targetSize;
    icon.scaleY = icon.scaleX;
    const targetScale = icon.scaleX; // Den berechneten (uniformen) Skalierungsfaktor merken

    icon.setScale(0); // Start bei 0
    icon.setAlpha(0);

    this.scene.tweens.add({
      targets: icon,
      scale: targetScale * 1.5, // ✨ FIX: Pop-Effekt auf 150% der Zielgröße
      alpha: 1,
      duration: 300,
      ease: "Back.out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: icon,
          scale: targetScale * 2, // ✨ FIX: Fade-Out wird noch größer
          alpha: 0,
          duration: 200,
          onComplete: () => icon.destroy(),
        });
      },
    });
  }

  // ✨ NEU: Zentrale Methode zur Steuerung der Sichtbarkeit
  private updateImageVisibility() {
    // Zeige das korrekte Bild an
    this.cardFrontImage?.setVisible(!this.isFaceDown);
    this.cardBackImage?.setVisible(this.isFaceDown);

    // ✨ FINALE KORREKTUR: Zeige den Hintergrund, wenn das AKTUELL benötigte Bild fehlt.
    // Vorher wurde der Hintergrund ausgeblendet, sobald IRGENDEIN Bild da war.
    // Das führte dazu, dass beim Aufdecken (Flip) die Karte unsichtbar wurde,
    // wenn die Vorderseite noch nicht geladen war, aber die Rückseite schon da war.
    const currentImageMissing = this.isFaceDown
      ? !this.cardBackImage
      : !this.cardFrontImage;
    this.background.setVisible(currentImageMissing);

    // ✨ KORREKTUR: Respektiere die Sperre.
    if (this.isLockedHidden) {
      return;
    }

    // ✨ LOGIK: Zeige die Karte NUR, wenn das Bild da ist. Verstecke sie, wenn es fehlt.
    // Das verhindert graue Kästen (Issue 2) und respektiert die Sperre (Issue 1).
    if (currentImageMissing) {
      this.setVisible(false);
    } else {
      this.setVisible(true);
    }
  }

  // ✨ DEBUGGING: Überschreibe setVisible, um Änderungen zu loggen.
  public setVisible(value: boolean): this {
    if (this.visible !== value) {
      // log("CardUI", `${this.cardData.id.slice(-4)} setVisible(${value})`);
    }
    super.setVisible(value);
    return this;
  }

  /** ✨ NEU: Lädt das Bild für eine Karte vor, ohne sie anzuzeigen. */
  public static preloadContent(scene: Phaser.Scene, cardData: CardState) {
    if (!cardData.ImageFile) return;

    const frontImageKey = `card-${cardData.ImageFile}`;
    const frontImageUrl = `${IMAGE_BASE_URL}${cardData.ImageFile}.jpg`;

    if (!scene.textures.exists(frontImageKey)) {
      // ✨ NEU: Mipmaps auch beim Preload aktivieren
      scene.load.image({
        key: frontImageKey,
        url: frontImageUrl,
        config: { mipmaps: true },
      } as any); // ✨ FIX: Cast zu 'any'
    }
  }

  /**
   * ✨ NEU: Erstellt den Partikel-Emitter für den Flammen-Effekt.
   * Ausgelagert, um ihn bei Größenänderungen neu erstellen zu können.
   * @param width Die Breite der Emitter-Zone
   * @param height Die Höhe der Emitter-Zone
   */
  private createGlowEmitter(width: number, height: number) {
    // ✨ FIX: Zurück zum einfachen Rechteck, da das Polygon Grafikfehler verursachte.
    // Die abgerundeten Ecken sind bei dem Glow-Effekt visuell kaum wahrnehmbar,
    // aber die Artefakte des Polygons waren störend.
    const shape = new Phaser.Geom.Rectangle(
      -width / 2,
      -height / 2,
      width,
      height,
    );

    this.glowEmitter = this.scene.add.particles(0, 0, "spark", {
      speedY: { min: -20, max: 20 }, // nach oben „aufsteigen“
      speedX: { min: -20, max: 20 }, // etwas flackern seitlich
      lifespan: { min: 10, max: 1200 },
      alpha: { start: 0.8, end: 0 },
      scale: { start: 0.1, end: 0 },
      quantity: 100,
      tint: [0xe0ffff, 0xc0c0c0, 0xffd700, 0xffffff], // Mix: Eisblau, Silber, Gold & Weiß
      blendMode: "ADD",
      emitZone: {
        type: "edge",
        source: shape,
        quantity: 200,
      },
    });

    this.add(this.glowEmitter);
    this.sendToBack(this.glowEmitter); // ✨ FIX: Wieder nach hinten, wie gewünscht.

    // ✨ FIX: Schatten muss UNTER dem Glow liegen, damit der Glow nicht abgedunkelt wird.
    this.sendToBack(this.shadow);
  }

  /**
   * ✨ NEU: Startet den Flammen-Effekt (DigiPolish).
   * Konfiguration 1:1 aus dem HTML-Prototyp übernommen.
   * @param ignoreZoneCheck Wenn true, wird der Effekt auch für Karten in Stapeln (z.B. im Suchdialog) angezeigt.
   */
  public startGlow(ignoreZoneCheck: boolean = false) {
    // ✨ NEU: Prüfen, ob visuelle Effekte aktiviert sind
    if (!this.areEffectsEnabled()) return;

    // Nicht für Karten in Stapeln (Deck, Discard etc.) anzeigen
    // ✨ NEU: Prüfung kann für Spezialfälle (Dialoge) übersprungen werden.
    if (!ignoreZoneCheck && PILE_ZONES.includes(this.currentZone)) return;
    // ✨ FIX: Nutze updateGlowZone mit force=true, um den Emitter korrekt zu erstellen und zu starten.
    this.updateGlowZone(true, true);
  }

  /**
   * ✨ NEU: Stoppt den Flammen-Effekt.
   */
  public stopGlow() {
    if (this.glowEmitter) {
      this.glowEmitter.stop();
      this.glowEmitter.setVisible(false); // ✨ FIX: Explizit unsichtbar machen, damit updateGlowZone ihn nicht neu startet.
    }
  }

  /**
   * ✨ NEU: Erstellt den Noise/Glitter-Effekt (Foil-Look).
   */
  private createNoiseEffect(width: number, height: number) {
    // Aufräumen, falls bereits vorhanden
    if (this.noiseGraphics) {
      this.noiseGraphics.destroy();
      this.noiseGraphics = null;
    }

    // Nur erstellen, wenn Effekte aktiviert sind
    if (!this.areEffectsEnabled()) return;

    this.noiseGraphics = this.scene.add.graphics();
    this.add(this.noiseGraphics);
    this.noiseGraphics.setBlendMode(Phaser.BlendModes.ADD);

    // Partikel initialisieren
    const noiseDensity = 200; // Anzahl der Glitzer-Partikel
    this.noisePoints = [];
    for (let i = 0; i < noiseDensity; i++) {
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

  /**
   * ✨ NEU: Hilfsmethode zum Aktualisieren der Emitter-Zone basierend auf der aktuellen Größe.
   * @param createIfMissing Falls true, wird der Emitter erstellt, auch wenn er noch nicht existiert.
   * @param forceVisible Falls definiert, erzwingt dies den Sichtbarkeitsstatus.
   */
  private updateGlowZone(
    createIfMissing: boolean = false,
    forceVisible?: boolean,
  ) {
    // ✨ FINALE KORREKTUR: Wir nutzen die tatsächlichen Dimensionen des sichtbaren Bildes.
    // Das ist die verlässlichste Quelle für die visuelle Größe, genau wie du gesagt hast.
    let w = this.width;
    let h = this.height;
    if (this.cardFrontImage && this.cardFrontImage.visible) {
      w = this.cardFrontImage.displayWidth;
      h = this.cardFrontImage.displayHeight;
    } else if (this.cardBackImage && this.cardBackImage.visible) {
      w = this.cardBackImage.displayWidth;
      h = this.cardBackImage.displayHeight;
    }

    // --- 1. Partikel-Effekt Logik (Nur wenn Effekte an sind) ---
    if (this.areEffectsEnabled()) {
      // Nur aktualisieren, wenn ein Emitter existiert oder erzwungen wird
      if (this.glowEmitter || createIfMissing) {
        // ✨ FIX: Bestimme den Ziel-Status.
        let shouldBeVisible = true;
        if (forceVisible !== undefined) {
          shouldBeVisible = forceVisible;
        } else if (this.glowEmitter) {
          shouldBeVisible = this.glowEmitter.visible;
        }

        // Alten Emitter zerstören, um Größe sauber neu zu setzen
        if (this.glowEmitter) {
          this.glowEmitter.destroy();
        }

        // Neuen Emitter mit korrekten Maßen erstellen
        this.createGlowEmitter(w, h);

        if (this.glowEmitter) {
          if (shouldBeVisible) {
            this.glowEmitter.start();
            this.glowEmitter.setVisible(true);
          } else {
            // ✨ FIX: Wenn der Emitter vorher aus war, müssen wir den NEUEN Emitter
            // explizit stoppen, da Phaser-Emitter standardmäßig aktiv starten.
            this.glowEmitter.stop();
            this.glowEmitter.setVisible(false);
          }
        }
      }

      // ✨ NEU: Noise-Effekt initialisieren/aktualisieren
      this.createNoiseEffect(w, h);
    } else {
      // Wenn Effekte aus sind, Emitter aufräumen
      if (this.glowEmitter) {
        this.glowEmitter.destroy();
        this.glowEmitter = null;
      }
      // ✨ NEU: Noise aufräumen
      if (this.noiseGraphics) {
        this.noiseGraphics.destroy();
        this.noiseGraphics = null;
      }
    }

    // --- 2. Debug-Rahmen Logik (Immer ausführen, wenn DEBUG an ist) ---
    if (DEBUG) {
      if (!this.debugGraphics) {
        this.debugGraphics = this.scene.add.graphics();
        this.add(this.debugGraphics);
      }
      this.debugGraphics.clear();
      this.debugGraphics.lineStyle(2, 0x00ff00, 1);
      const shape = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
      this.debugGraphics.strokeRectShape(shape);
    } else if (this.debugGraphics) {
      this.debugGraphics.clear(); // Falls Debug deaktiviert wurde, Rahmen entfernen
    }
  }

  /**
   * ✨ NEU: Steuert den Paralyze-Effekt (Blitze & Aura).
   */
  private updateParalyzeEffect(active: boolean) {
    if (active && this.areEffectsEnabled()) {
      // ✨ NEU: Check settings
      if (this.paralyzeEmitters.length === 0) {
        this.createParalyzeEmitters();
      }
    } else {
      this.removeParalyzeEmitters();
    }
  }

  /**
   * ✨ NEU: Erstellt die 3 Emitter für den Paralyze-Effekt.
   * Basiert auf dem HTML-Prototyp, skaliert aber dynamisch mit der Kartengröße.
   */
  private createParalyzeEmitters() {
    // ✨ KORREKTUR: Nutze die Container-Größe als Basis. Das ist stabiler.
    const w = this.width;
    const h = this.height;

    // ✨ SKALIERUNG: Der PoC verwendet eine Karte mit 379px Breite, die auf 0.8 skaliert wird.
    // Die Referenzbreite ist also 379px * 0.8 = 303.2px.
    // Wir berechnen einen Faktor, um die Partikelgrößen anzupassen.
    const referenceWidth = 303.2;
    const scaleFactor = w / referenceWidth;

    const rect = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);

    // 2. Randblitze / Funken (Hinter der Karte, aber vor der Aura)
    // ✨ FIX: Nutze explizit die kleine Version für Paralyze
    const spark = this.scene.add.particles(0, 0, "blue_spark_small", {
      speedX: { min: -8, max: 8 }, // ✨ FIX: Kein scaleFactor bei Speed
      speedY: { min: -4, max: 4 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 800 },
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.7 * scaleFactor, end: 0.0 }, // Größe skaliert weiterhin
      quantity: 3,
      tint: [0x99ccff, 0xffffff],
      blendMode: "ADD",
      emitZone: {
        type: "random",
        source: rect,
        quantity: 1,
      },
    });
    this.add(spark);
    this.sendToBack(spark); // Wird Index 0
    this.paralyzeEmitters.push(spark);

    // 1. Schleier-Aura (Ganz hinten)
    // ✨ FIX: Nutze explizit die kleine Version für Paralyze
    const aura = this.scene.add.particles(0, 0, "blue_aura_small", {
      speedX: { min: -8, max: 8 }, // ✨ FIX: Kein scaleFactor bei Speed
      speedY: { min: -4, max: 4 },
      accelerationX: { min: -5, max: 5 },
      accelerationY: { min: -5, max: 5 },
      lifespan: { min: 1500, max: 3000 },
      alpha: { start: 0.3, end: 0 },
      scale: { start: 2.3 * scaleFactor, end: 3.3 * scaleFactor }, // Größe skaliert weiterhin
      quantity: 1,
      tint: [0x224466, 0x446688, 0x88aacc],
      blendMode: "SCREEN",
      emitZone: {
        type: "random",
        source: rect,
        quantity: 1,
      },
    });
    this.add(aura);
    this.sendToBack(aura); // Wird Index 0, schiebt Spark auf 1. Korrekt: Aura < Spark.
    this.paralyzeEmitters.push(aura);

    // 3. Blitzgitter (Über der Karte)
    const lightning = this.scene.add.particles(0, 0, "blue_lightning", {
      speedX: 0,
      speedY: 0,
      lifespan: 500,
      alpha: { start: 0.8, end: 0.3 },
      // ✨ FIX: Skalierung etwas erhöht, damit sie sichtbar sind (PoC war 1.0 -> 0.8)
      scale: { start: 1.0 * scaleFactor, end: 0.8 * scaleFactor },
      quantity: 1,
      frequency: 150,
      tint: [0x99ccff, 0xccccff],
      blendMode: "ADD",
      emitZone: {
        type: "random",
        source: rect,
        quantity: 1,
      },
    });

    // ✨ WORKAROUND: Maske global in der Szene erstellen und manuell synchronisieren.
    // Dies umgeht die Probleme mit Masken innerhalb von Containern.
    if (this.paralyzeMaskGraphics) this.paralyzeMaskGraphics.destroy();
    this.paralyzeMaskGraphics = this.scene.add.graphics();
    this.paralyzeMaskGraphics.setVisible(false); // Zuerst unsichtbar machen

    this.paralyzeMaskGraphics.clear();
    this.paralyzeMaskGraphics.fillStyle(0xffffff);
    this.paralyzeMaskGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);

    const mask = this.paralyzeMaskGraphics.createGeometryMask();
    this.paralyzeMask = mask;

    // Maske anwenden
    lightning.setMask(mask);

    // Emitter in den Container
    this.add(lightning);
    this.bringToTop(lightning);
    this.paralyzeEmitters.push(lightning);

    // WICHTIG: Masken-Grafik NICHT in den Container legen!

    // Texte müssen über dem Blitzgitter liegen
    if (this.paralyzeText) this.bringToTop(this.paralyzeText);
    if (this.setasideText) this.bringToTop(this.setasideText);
  }

  private removeParalyzeEmitters() {
    this.paralyzeEmitters.forEach((e) => e.destroy());
    this.paralyzeEmitters = [];
    // ✨ NEU: Maske aufräumen
    if (this.paralyzeMaskGraphics) {
      this.paralyzeMaskGraphics.destroy();
      this.paralyzeMaskGraphics = null;
    }
    // ✨ NEU: Masken-Referenz aufräumen
    if (this.paralyzeMask) {
      this.paralyzeMask = null;
    }
  }

  private updateParalyzeZone() {
    if (this.paralyzeEmitters.length > 0) {
      this.removeParalyzeEmitters();
      this.createParalyzeEmitters();
    }
  }

  /**
   * ✨ NEU: Berechnet die Position des Schattens basierend auf der Rotation der Karte.
   * Dadurch bleibt der Schatten immer "unten rechts" vom Betrachter aus gesehen (Lichtquelle oben links),
   * egal wie die Karte gedreht ist (z.B. beim Gegner um 180 Grad).
   */
  private updateShadowPosition(offset: number) {
    const rad = -this.rotation; // Gegenrotation
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const x = offset * cos - offset * sin;
    const y = offset * sin + offset * cos;

    this.shadow.setPosition(x, y);
  }

  /**
   * ✨ NEU: Zentrale Update-Methode für Physik und Synchronisation.
   * Ersetzt updateMaskTransform und fügt Drag-Physik hinzu.
   */
  private onSceneUpdate(time: number, delta: number) {
    // ✨ FIX: Sicherheitscheck. Wenn das Objekt zerstört oder inaktiv ist, nichts tun.
    if (!this.scene || !this.active) return;

    this.syncMaskState();

    // 2. Drag & Tilt Physik (Trägheit)
    if (
      this.isBeingDragged &&
      this.dragTargetX !== null &&
      this.dragTargetY !== null
    ) {
      const lerpFactor = 0.12; // ✨ TWEAK: Etwas mehr Trägheit (war 0.15) für deutlicheres Nachziehen

      // Interpoliere zur Zielposition
      const newX = Phaser.Math.Linear(this.x, this.dragTargetX, lerpFactor);
      const newY = Phaser.Math.Linear(this.y, this.dragTargetY, lerpFactor);

      // Berechne Geschwindigkeit
      const vx = newX - this.x;
      const vy = newY - this.y;

      this.x = newX;
      this.y = newY;

      // ✨ NEU: Stärkerer Tilt und Skew für den "Papier-Effekt"

      // ✨ NEU: Schatten-Dynamik beim Ziehen (Lift-Effekt)
      // Wenn die Karte gezogen wird, entfernen wir den Schatten weiter (simulierte Höhe)
      // und machen ihn etwas weicher/transparenter.
      this.updateShadowPosition(SHADOW_CONFIG.OFFSET_DRAG);
      this.shadow.setAlpha(SHADOW_CONFIG.ALPHA_DRAG);
      this.shadow.setScale(SHADOW_CONFIG.SCALE_DRAG);

      // Rotation (Wedeln): Reagiert stark auf horizontale Bewegung
      const rot = Phaser.Math.Clamp(vx * 0.05, -0.4, 0.4); // Bis zu ~20 Grad Neigung
      this.setRotation(rot);

      // ✨ NEU: 3D-Tiefe durch Stauchung (Perspective Tilt)
      // Wir simulieren, dass die Karte beim Ziehen "angehoben" ist (Basis-Scale 1.1).
      const dragBaseScale = 1.1;
      const squashFactor = 0.015; // Wie stark die Karte kippt (Empfindlichkeit)
      const maxSquash = 0.25; // Maximale Stauchung (25%)

      // ✨ NEU: Pulsieren (Herzschlag) während des Drags
      // Wir nutzen delta für framerate-unabhängige Geschwindigkeit
      this.pulseTime += 0.003 * delta;
      const wave = Math.sin(this.pulseTime);
      const pulse = 0.008 * wave; // Subtile Amplitude (+/- 0.8%)

      // Horizontaler Speed staucht die Breite (Rotation um Y-Achse)
      const squashX = Phaser.Math.Clamp(
        Math.abs(vx) * squashFactor,
        0,
        maxSquash,
      );
      // Vertikaler Speed staucht die Höhe (Rotation um X-Achse)
      const squashY = Phaser.Math.Clamp(
        Math.abs(vy) * squashFactor,
        0,
        maxSquash,
      );

      // Kombiniere Basis-Größe, Stauchung (Squash) und Pulsieren
      this.setScale(
        dragBaseScale * (1 - squashX) + pulse,
        dragBaseScale * (1 - squashY) + pulse,
      );

      // ✨ NEU: Helligkeit synchron zum Pulsieren (Herzschlag)
      // Wave 1 (Groß) -> Hell (Overlay an)
      // Wave -1 (Klein) -> Dunkel (Tint an)
      const brightnessIntensity = 0.05; // Stärke des Effekts (25%)

      if (wave > 0) {
        // Aufhellen (Overlay)
        this.clearTint(); // Sicherstellen, dass kein Dark-Tint aktiv ist
        this.brightnessOverlay.setVisible(true);
        this.brightnessOverlay.setAlpha(wave * brightnessIntensity);
      } else {
        // Abdunkeln (Tint)
        this.brightnessOverlay.setVisible(false);
        const darkFactor = Math.abs(wave) * brightnessIntensity;
        const val = Math.floor(255 * (1 - darkFactor));
        const color = Phaser.Display.Color.GetColor(val, val, val);
        this.setTint(color);
      }
    } else {
      // ✨ NEU: Reset Schatten wenn nicht gezogen
      this.updateShadowPosition(SHADOW_CONFIG.OFFSET_REST);
      this.shadow.setAlpha(SHADOW_CONFIG.ALPHA_REST);
      this.shadow.setScale(1);
    }

    // 3. ✨ NEU: Noise-Effekt Update (Glitzern)
    if (this.noiseGraphics && this.areEffectsEnabled()) {
      this.noiseGraphics.clear();
      const w = this.width;
      const h = this.height;

      for (const pt of this.noisePoints) {
        // Flimmern
        pt.alpha += pt.flicker * (Math.random() > 0.5 ? 1 : -1);
        pt.alpha = Phaser.Math.Clamp(pt.alpha, 0.05, 0.12);

        // Bewegung
        pt.x += pt.speedX;
        pt.y += pt.speedY;

        // Wrap-Around (Endlos-Schleife innerhalb der Karte)
        if (pt.x < -w / 2) pt.x = w / 2;
        if (pt.x > w / 2) pt.x = -w / 2;
        if (pt.y < -h / 2) pt.y = h / 2;
        if (pt.y > h / 2) pt.y = -h / 2;

        this.noiseGraphics.fillStyle(0xffffff, pt.alpha);
        this.noiseGraphics.fillRect(pt.x, pt.y, 2, 2);
      }
    }
  }

  /**
   * ✨ NEU: Synchronisiert die Masken-Grafiken mit der aktuellen Position der Karte.
   * Wird in onSceneUpdate und updateSize aufgerufen.
   */
  private syncMaskState() {
    // 1. Masken-Synchronisation (wie bisher)
    if (this.paralyzeMaskGraphics && this.active) {
      this.paralyzeMaskGraphics.setPosition(this.x, this.y);
      this.paralyzeMaskGraphics.setRotation(this.rotation);
      this.paralyzeMaskGraphics.setScale(this.scaleX, this.scaleY);
    }
  }

  /**
   * ✨ NEU: Override destroy, um sicherzustellen, dass der Update-Listener entfernt wird.
   */
  destroy(fromScene?: boolean) {
    // ✨ FIX: Prüfen, ob die Scene noch existiert. Falls das Objekt bereits durch
    // den Shutdown der Scene zerstört wurde, ist this.scene hier undefined.
    if (this.scene) {
      this.scene.events.off("update", this.onSceneUpdate, this);
      this.scene.events.off("settings-changed", this.onSettingsChanged, this);
    }
    super.destroy(fromScene);
  }

  /**
   * ✨ NEU: Hilfsmethode zum Prüfen der globalen Einstellungen.
   */
  private areEffectsEnabled(): boolean {
    const settings = this.scene.registry.get(
      "settingsManager",
    ) as SettingsManager;
    // Falls Settings noch nicht geladen sind (z.B. im Ladebildschirm), Standard: true
    return settings ? settings.areAnimationsEnabled() : true;
  }

  /**
   * ✨ NEU: Reagiert auf Änderungen in den Einstellungen.
   */
  private onSettingsChanged() {
    this.updateCounters(); // Aktualisiert Paralyze/SetAside (schaltet sie ab, wenn Effekte aus sind)
    if (!this.areEffectsEnabled()) {
      this.stopGlow(); // Stoppt den Hover-Glow sofort
    }
  }

  /**
   * ✨ NEU: Hilfsmethode zum sicheren Abrufen von Counter-Werten.
   * Kapselt die Logik für MapSchema (Colyseus) vs. JSON-Objekte.
   * Macht den Code deutlich lesbarer und wartbarer.
   */
  public getCounter(key: string): number {
    if (!this.cardData || !this.cardData.counters) return 0;
    const counters: any = this.cardData.counters;
    if (typeof counters.get === "function") {
      return counters.get(key) || 0;
    }
    return counters[key] || 0;
  }
}
