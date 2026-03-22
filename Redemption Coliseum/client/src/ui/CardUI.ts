import Phaser from "phaser";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type { CardState } from "../../../shared/types";
import type { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Import für Typisierung
import { log, DEBUG } from "../utils/logger";
import { CardVisuals } from "./effects/CardVisuals"; // ✨ NEU
import { CardAttachVisuals } from "./effects/CardAttachVisuals"; // ✨ NEU

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
  public isBeingDragged: boolean = false; // ✨ NEU: Status für Drag-Vorgang
  // ✨ NEU: Zielkoordinaten für die Drag-Physik (Trägheit)
  public dragTargetX: number | null = null;
  public dragTargetY: number | null = null;
  // ✨ NEU: Noise/Glitter Effekt
  private visuals: CardVisuals; // ✨ NEU: Umbenannt
  private pulseTime: number = Math.random() * 100; // ✨ NEU: Zufälliger Startwert für organischen Look
  private brightnessOverlay: Phaser.GameObjects.Rectangle; // ✨ NEU: Overlay für Helligkeitseffekte
  private shadow: Phaser.GameObjects.NineSlice; // ✨ NEU: Schatten
  private attachVisuals: CardAttachVisuals; // ✨ NEU

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

    // ✨ NEU: Visuals Komponente erstellen
    this.visuals = new CardVisuals(scene, this);

    // ✨ NEU: Attach Visuals Komponente erstellen
    this.attachVisuals = new CardAttachVisuals(scene, this);

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
    this.visuals.onUpdateSize(); // ✨ FIX: Effekte aktualisieren
  }

  // ✨ NEU: Separate Methode für die Rückseite
  private displayBackImage(imageKey: string) {
    if (!this.scene || !this.active) return; // Sicherheitscheck
    this.cardBackImage = this.scene.add.image(0, 0, imageKey);
    this.cardBackImage.setDisplaySize(this.width, this.height);
    this.add(this.cardBackImage);

    this.bringToTop(this.brightnessOverlay); // ✨ FIX: Overlay muss über dem Bild liegen
    this.updateImageVisibility();
    this.visuals.onUpdateSize(); // ✨ FIX: Effekte aktualisieren
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
    // ✨ FIX: Wenn sich die Größe ändert, müssen wir auch die Emitter-Zone und das Debug-Rechteck anpassen.
    this.visuals.onUpdateSize();
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
    this.visuals.updateParalyzeEffect(paralyzeValue > 0);

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
    this.attachVisuals.showTargetGlow(show);
  }

  /**
   * ✨ NEU: Spielt die Attach-Animation ab (Icon fliegt).
   * Wird vom InputManager aufgerufen, wenn erfolgreich gedroppt wurde.
   */
  public playAttachAnimation() {
    this.attachVisuals.playAttachAnimation();
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
  public startGlow(ignoreZoneCheck: boolean = false) {
    this.visuals.startGlow(ignoreZoneCheck);
  }

  /**
   * ✨ NEU: Stoppt den Flammen-Effekt.
   */
  public stopGlow() {
    this.visuals.stopGlow();
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

    this.visuals.onUpdate(); // ✨ FIX: Effekte aktualisieren

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
    this.visuals.destroy(); // ✨ NEU: Aufräumen
    this.attachVisuals.destroy(); // ✨ NEU: Aufräumen
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
