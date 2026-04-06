import Phaser from "phaser";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type { CardState } from "../../../shared/types";
import type { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Import für Typisierung
import { log, DEBUG } from "../utils/logger";
import { CardVisuals } from "./effects/CardVisuals"; // ✨ NEU
import { CardAttachVisuals } from "./effects/CardAttachVisuals"; // ✨ NEU
import {
  CardPhysicsEffects, // ✨ FIX: Klasse heißt jetzt CardPhysicsEffects (laut deiner Info)
  SHADOW_CONFIG,
} from "./effects/CardPhysicsEffects.js"; // ✨ NEU
import { AssetManager } from "./managers/AssetManager"; // ✨ NEU: Import AssetManager
import { CardCounterVisuals } from "./effects/CardCounterVisuals"; // ✨ NEU

// ✨ Die Basis-URL, unter der die Kartenbilder zu finden sind.
const IMAGE_BASE_URL = "/assets/cards/";

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
  public isBeingDragged: boolean = false; // ✨ NEU: Status für Drag-Vorgang
  // ✨ NEU: Zielkoordinaten für die Drag-Physik (Trägheit)
  public dragTargetX: number | null = null;
  public dragTargetY: number | null = null;
  // ✨ NEU: Noise/Glitter Effekt
  private visuals: CardVisuals; // ✨ NEU: Umbenannt
  private brightnessOverlay: Phaser.GameObjects.Rectangle; // ✨ NEU: Overlay für Helligkeitseffekte
  private shadow: Phaser.GameObjects.NineSlice; // ✨ NEU: Schatten
  private attachVisuals: CardAttachVisuals; // ✨ NEU
  private physicsHandler: CardPhysicsEffects; // ✨ FIX: Typ aktualisiert
  private counterVisuals: CardCounterVisuals; // ✨ NEU
  private assetManager: AssetManager; // ✨ NEU: AssetManager Instanz

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
    this.assetManager = scene.registry.get("assetManager"); // ✨ NEU: AssetManager aus Registry holen
    
    if (!this.assetManager) {
      log("CardUI", "ERROR: AssetManager not found in registry! Creating fallback.");
      this.assetManager = new AssetManager(scene);
    }

    // ✨ NEU: Weise eine eindeutige, nicht veränderbare ID zu, um dieses Objekt zu verfolgen.
    this.instanceId = Phaser.Utils.String.UUID();

    // ✨ NEU: Visuals Komponente erstellen
    this.visuals = new CardVisuals(scene, this);

    // ✨ NEU: Attach Visuals Komponente erstellen
    this.attachVisuals = new CardAttachVisuals(scene, this);

    // ✨ NEU: Physics Handler erstellen
    this.physicsHandler = new CardPhysicsEffects(this);

    // ✨ NEU: Counter Visuals erstellen
    this.counterVisuals = new CardCounterVisuals(scene, this, this.visuals);

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
    this.loadAndDisplayCardImages(); // ✨ NEU: Methode umbenannt

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

  /** ✨ NEU: Überarbeitete Methode, die beide Bilder über den AssetManager lädt. */
  private loadAndDisplayCardImages() {
    // --- Lade die Kartenvorderseite ---
    const frontImageKey = `card-${this.cardData.ImageFile}`;
    const frontImageUrl = `${IMAGE_BASE_URL}${this.cardData.ImageFile}.jpg`;
    this.assetManager.loadCardImage(frontImageKey, frontImageUrl, (key) => {
      if (!this.scene || !this.active) return;
      this.cardFrontImage = this.scene.add.image(0, 0, key);
      this.cardFrontImage.setDisplaySize(this.width, this.height);
      this.add(this.cardFrontImage);
      this.bringToTop(this.brightnessOverlay);
      this.updateImageVisibility();
      this.visuals.onUpdateSize();
    });

    // --- Lade die Kartenrückseite ---
    const backImageKey = "card-back";
    const backImageUrl = `${IMAGE_BASE_URL}cardback.jpg`;
    this.assetManager.loadCardImage(backImageKey, backImageUrl, (key) => {
      if (!this.scene || !this.active) return;
      this.cardBackImage = this.scene.add.image(0, 0, key);
      this.cardBackImage.setDisplaySize(this.width, this.height);
      this.add(this.cardBackImage);
      this.bringToTop(this.brightnessOverlay);
      this.updateImageVisibility();
      this.visuals.onUpdateSize();
    });
  }

  public updateSize(width: number, height: number) {
    // ✨ OPTIMIERUNG: Nur aktualisieren, wenn sich die Größe wirklich geändert hat.
    if (this.width === width && this.height === height) return;

    // Update internal size properties
    this.width = width;
    this.height = height;

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

    // ✨ NEU: Counter-Texte anpassen via Sub-Komponente
    this.counterVisuals.onUpdateSize();

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
    this.counterVisuals.update();
  }

  /** ✨ NEU: Gibt zurück, ob die Karte aktuell verdeckt ist. */
  public isCurrentlyFaceDown(): boolean {
    return this.isFaceDown;
  }

  /**
   * ✨ NEU: Gibt zurück, ob die Karte paralysiert ist (Counter > 0).
   */
  public get isParalyzed(): boolean {
    return this.counterVisuals.getCounter("paralyze") > 0;
  }

  /**
   * ✨ NEU: Gibt zurück, ob die Karte "Set Aside" ist (Counter > 0).
   */
  public get isSetAside(): boolean {
    return this.counterVisuals.getCounter("setaside") > 0;
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
   * ✨ NEU: Aktualisiert den Zustand des Schattens (Position, Alpha, Scale).
   * Wird vom PhysicsHandler verwendet.
   * Dadurch bleibt der Schatten immer "unten rechts" vom Betrachter aus gesehen (Lichtquelle oben links),
   * egal wie die Karte gedreht ist (z.B. beim Gegner um 180 Grad).
   */
  public updateShadowState(offset: number, alpha: number, scale: number) {
    const rad = -this.rotation; // Gegenrotation
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const x = offset * cos - offset * sin;
    const y = offset * sin + offset * cos;

    this.shadow.setPosition(x, y);
    this.shadow.setAlpha(alpha);
    this.shadow.setScale(scale);
  }

  /**
   * ✨ NEU: Steuert den Helligkeitseffekt (Pulsieren).
   * Wird vom PhysicsHandler verwendet.
   */
  public applyBrightnessEffect(
    isLight: boolean,
    alpha: number,
    tintColor?: number,
  ) {
    if (isLight) {
      this.clearTint();
      this.brightnessOverlay.setVisible(true);
      this.brightnessOverlay.setAlpha(alpha);
    } else if (tintColor !== undefined) {
      this.brightnessOverlay.setVisible(false);
      this.setTint(tintColor);
    }
  }

  /**
   * ✨ NEU: Zentrale Update-Methode für Physik und Synchronisation.
   * Ersetzt updateMaskTransform und fügt Drag-Physik hinzu.
   */
  private onSceneUpdate(time: number, delta: number) {
    // ✨ FIX: Sicherheitscheck. Wenn das Objekt zerstört oder inaktiv ist, nichts tun.
    if (!this.scene || !this.active) return;

    this.visuals.onUpdate(); // ✨ FIX: Effekte aktualisieren

    // ✨ NEU: Physik-Update an Handler delegieren
    this.physicsHandler.update(delta);
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
}
