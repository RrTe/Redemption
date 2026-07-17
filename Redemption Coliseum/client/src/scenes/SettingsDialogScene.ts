import Phaser from "phaser";
import { SettingsManager } from "../managers/SettingsManager";
import { SoundManager } from "../managers/SoundManager";

// ✨ NEU: Angepasste Farbpalette
const COLOR_ACTIVE = 0xebce4c; // ✨ NEU: Satteres Gold/Gelb wie gewünscht
const COLOR_INACTIVE = 0xbf7d41; // Helles Braun/Orange
const COLOR_KNOB = 0xf5e6c4; // Pergament (für Knöpfe)

// ✨ NEU: Zentrale Layout-Konstanten für einfache Anpassungen
const LAYOUT = {
  START_Y: -160,
  GAP_Y: 85,
  ICON_X: -75,
  CONTROL_X: -45,
  SLIDER_WIDTH: 130,
  SLIDER_HEIGHT: 12,
  TOGGLE_WIDTH: 60,
  TOGGLE_HEIGHT: 24,
};

// ✨ NEU: Zentrale Stil-Konstanten
const STYLE = {
  ICON_FONT_SIZE: "28px",
  ICON_COLOR: "#26140c", // ✨ NEU: Viel dunkleres Braun (fast Schwarz) für besseren Kontrast
  ICON_SHADOW_COLOR: "rgba(0,0,0,0.6)", // ✨ NEU: Stärkerer Schatten
};

/**
 * Eine modale Szene für die Spieleinstellungen.
 * Design: Schriftrolle, Icons statt Text, Slide-In Animation.
 */
export class SettingsDialogScene extends Phaser.Scene {
  private settingsManager!: SettingsManager;
  private soundManager!: SoundManager;
  private container!: Phaser.GameObjects.Container;
  private backgroundOverlay!: Phaser.GameObjects.Rectangle;
  private parentSceneKey: string = "CardGame"; // ✨ NEU: Standard-Elternszene

  constructor() {
    super("SettingsDialogScene");
  }

  init(data?: { parentScene?: string }) {
    // ✨ NEU: Übernehme die aufrufende Szene, falls übergeben
    if (data?.parentScene) {
      this.parentSceneKey = data.parentScene;
    }
    // Zugriff auf den globalen SettingsManager via Registry (wurde in CardGameScene gesetzt)
    this.settingsManager = this.registry.get(
      "settingsManager",
    ) as SettingsManager;
    this.soundManager = this.registry.get("soundManager") as SoundManager;
  }

  preload() {
    this.load.image("icon_handcards", "assets/ui/icons/cardfan_small.png");
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    // 1. Abdunkeln des Hintergrunds (Overlay)
    this.backgroundOverlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setInteractive(); // Blockiert Klicks auf das Spiel darunter

    // Fade-In für das Overlay
    this.tweens.add({
      targets: this.backgroundOverlay,
      fillAlpha: 0.6,
      duration: 300,
    });

    // 2. Container für den Dialog (für die Slide-In Animation)
    this.container = this.add.container(width + 400, height / 2); // Startet außerhalb rechts

    // --- Schriftrollen-Optik ---
    /*
    const scrollWidth = 350;
    const scrollHeight = 500;
    const paperColor = 0xf5e6c4; // Pergament-Farbe
    const woodColor = 0x5c3a21; // Holz-Farbe für die Rollen

    const scrollGraphics = this.add.graphics();

    // Papier (Körper)
    scrollGraphics.fillStyle(paperColor, 0.95); // Leicht transparent
    scrollGraphics.fillRoundedRect(
      -scrollWidth / 2,
      -scrollHeight / 2,
      scrollWidth,
      scrollHeight,
      10
    );

    // Papier (Schatten/Tiefe am Rand)
    scrollGraphics.lineStyle(4, 0xdcbfa6, 0.5);
    scrollGraphics.strokeRoundedRect(
      -scrollWidth / 2,
      -scrollHeight / 2,
      scrollWidth,
      scrollHeight,
      10
    );

    // Holzrollen (Oben und Unten) - stilisiert
    scrollGraphics.fillStyle(woodColor, 1);
    // Oben
    scrollGraphics.fillRoundedRect(
      -scrollWidth / 2 - 20,
      -scrollHeight / 2 - 25,
      scrollWidth + 40,
      30,
      15
    );
    // Unten
    scrollGraphics.fillRoundedRect(
      -scrollWidth / 2 - 20,
      scrollHeight / 2 - 5,
      scrollWidth + 40,
      30,
      15
    );

    // Goldene Verzierungen an den Rollenenden
    scrollGraphics.fillStyle(0xffd700, 1);
    scrollGraphics.fillCircle(-scrollWidth / 2 - 15, -scrollHeight / 2 - 10, 8);
    scrollGraphics.fillCircle(scrollWidth / 2 + 15, -scrollHeight / 2 - 10, 8);
    scrollGraphics.fillCircle(-scrollWidth / 2 - 15, scrollHeight / 2 + 10, 8);
    scrollGraphics.fillCircle(scrollWidth / 2 + 15, scrollHeight / 2 + 10, 8);

    this.container.add(scrollGraphics);
    */

    // --- Schriftrollen-Optik (Bild) ---
    const scrollBg = this.add.image(0, 0, "scroll_bg");
    // ✨ NEU: Schriftrolle vertikal etwas strecken, damit alle 5 Optionen und der Schließen-Button Platz haben
    scrollBg.setDisplaySize(scrollBg.width, scrollBg.height + 90);
    this.container.add(scrollBg);

    const scrollHeight = scrollBg.displayHeight; // Für die Positionierung der Elemente nutzen
    const scrollWidth = scrollBg.displayWidth;
    
    // ✨ NEU: Auf Mobile-Screens (Landscape) herunterskalieren, wenn es zu groß ist
    const availableHeight = height * 0.9;
    if (scrollHeight > availableHeight) {
      const scaleFactor = availableHeight / scrollHeight;
      this.container.setScale(scaleFactor);
    }

    // --- Inhalt ---

    // Titel (Optional, falls Icons nicht reichen)
    // const title = this.add.text(0, -scrollHeight/2 + 40, "SETTINGS", { font: "bold 24px Arial", color: "#5c3a21" }).setOrigin(0.5);
    // this.container.add(title);

    let currentY = LAYOUT.START_Y;
    const gapY = LAYOUT.GAP_Y;

    // (Master Volume entfernt, wie gewünscht)
    // 2. Music Volume
    this.createSlider(0, currentY, "🎵", "musicVolume"); // Note
    currentY += gapY;

    // 3. SFX Volume
    this.createSlider(0, currentY, "🔊", "sfxVolume"); // Lautsprecher
    currentY += gapY;

    // 4. Animations Toggle
    this.createToggle(0, currentY, "✨", "animationsEnabled"); // Sterne
    currentY += gapY;

    // 5. Background Effects Toggle (Neu)
    this.createToggle(0, currentY, "🌄", "backgroundEffectsEnabled"); // Nebel/Atmosphäre
    currentY += gapY;

    // 6. Hand Cards Fanned Toggle (Neu)
    this.createToggle(0, currentY, "icon_handcards", "handCardsFanned", true);
    currentY += gapY;

    // 5. Close Button (Unten)
    const closeBtn = this.add
      .text(0, scrollHeight / 2 - 35, "✖", {
        fontSize: "40px",
        color: "#8b0000",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    closeBtn.on("pointerdown", () => {
      this.soundManager.playSound("MENU_SELECT");
      this.close();
    });
    this.container.add(closeBtn);

    // --- Slide-In Animation ---
    // Zielposition: Rechtsbündig unter dem Button (ungefähr)
    // Wir zentrieren es vertikal, aber schieben es nach rechts.
    const targetX = width - (scrollWidth * this.container.scale) / 2 - 50 * this.container.scale;

    this.tweens.add({
      targets: this.container,
      x: targetX,
      duration: 400,
      ease: "Back.Out",
    });
  }

  /**
   * Erstellt einen Slider mit Icon.
   */
  private createSlider(
    x: number,
    y: number,
    iconChar: string,
    settingKey: string,
  ) {
    // ✨ NEU: Kompakteres Layout und mittige Ausrichtung
    const width = LAYOUT.SLIDER_WIDTH;
    const iconX = LAYOUT.ICON_X;
    const sliderX = LAYOUT.CONTROL_X;
    const height = LAYOUT.SLIDER_HEIGHT;

    // Icon
    const icon = this.add
      .text(iconX, y, iconChar, {
        fontSize: STYLE.ICON_FONT_SIZE,
        color: STYLE.ICON_COLOR,
      })
      .setOrigin(0.5)
      .setShadow(2, 2, STYLE.ICON_SHADOW_COLOR, 2); // ✨ NEU: Schatten für bessere Lesbarkeit
    this.container.add(icon);

    // ✨ NEU: Durchstreich-Linie (Mute)
    const muteLine = this.add.graphics();
    muteLine.lineStyle(4, 0x8b0000); // Dunkelrot
    muteLine.lineBetween(-12, 12, 12, -12);
    muteLine.setPosition(iconX, y);
    muteLine.setVisible(false);
    this.container.add(muteLine);

    // ✨ NEU: Slider Hintergrund (Track) mit Rounded Corners & Schatten
    const track = this.add.graphics();
    // Schatten
    track.fillStyle(0x000000, 0.4); // ✨ NEU: Stärkerer Schatten
    track.fillRoundedRect(
      sliderX + 3,
      y - height / 2 + 3,
      width,
      height,
      height / 2,
    );
    // Hauptspur
    track.fillStyle(COLOR_INACTIVE, 1);
    track.fillRoundedRect(sliderX, y - height / 2, width, height, height / 2);
    this.container.add(track);

    // ✨ NEU: Slider Füllung (Fill) - Dynamisch via Graphics
    const fill = this.add.graphics();
    this.container.add(fill);

    // ✨ NEU: 3D-Griff (Handle) als Container
    const handle = this.add.container(sliderX, y);

    // Schatten des Griffs
    const handleShadow = this.add.circle(3, 3, 10, 0x000000, 0.4); // ✨ NEU: Stärkerer 3D-Effekt
    // Haupt-Knopf
    const handleKnob = this.add.circle(0, 0, 10, COLOR_KNOB);
    handleKnob.setStrokeStyle(1, 0x8b6b00);
    // Glanzlicht (Highlight) für 3D-Effekt
    const handleHighlight = this.add.circle(-3, -3, 3, 0xffffff, 0.5);

    handle.add([handleShadow, handleKnob, handleHighlight]);

    // Interaktionsbereich auf den Knopf legen
    handleKnob.setInteractive({ draggable: true, useHandCursor: true });

    this.container.add(handle);

    // Initialen Wert setzen
    const initialValue = (this.settingsManager as any).get(
      settingKey,
    ) as number; // 0.0 bis 1.0

    // Funktion zum Aktualisieren der Optik
    const updateVisuals = (val: number) => {
      handle.x = sliderX + val * width;

      // Füllung neu zeichnen
      fill.clear();
      fill.fillStyle(COLOR_ACTIVE, 1);
      // Nur zeichnen, wenn Wert > 0, um Grafikfehler bei Radius zu vermeiden
      if (val > 0)
        fill.fillRoundedRect(
          sliderX,
          y - height / 2,
          val * width,
          height,
          height / 2,
        );

      // ✨ NEU: Mute-Logik
      muteLine.setVisible(val === 0);
      icon.setAlpha(val === 0 ? 0.85 : 1); // Icon etwas ausblenden wenn stumm
    };

    updateVisuals(initialValue);

    // Drag-Logik
    handleKnob.on("drag", (pointer: any, dragX: number, dragY: number) => {
      // Clamping
      const newX = Phaser.Math.Clamp(dragX, sliderX, sliderX + width);

      // Wert berechnen (0 bis 1)
      const value = (newX - sliderX) / width;

      updateVisuals(value);

      // Setting speichern
      this.updateSetting(settingKey, value);
    });
  }

  /**
   * Erstellt einen Toggle-Switch mit Icon.
   */
  private createToggle(
    x: number,
    y: number,
    iconChar: string,
    settingKey: string,
    isImage: boolean = false
  ) {
    // ✨ NEU: Gleiche Ausrichtung und Maße wie Slider
    const iconX = LAYOUT.ICON_X;
    const toggleX = LAYOUT.CONTROL_X;
    const toggleWidth = LAYOUT.TOGGLE_WIDTH;
    const height = LAYOUT.TOGGLE_HEIGHT;

    // Icon
    let icon;
    if (isImage) {
      icon = this.add.image(iconX, y, iconChar).setOrigin(0.5);
      // ✨ FIX: Icon deutlich größer skalieren (zuvor 30, jetzt 55)
      const scale = 55 / Math.max(icon.width, icon.height);
      icon.setScale(scale);
    } else {
      icon = this.add
        .text(iconX, y, iconChar, {
          fontSize: STYLE.ICON_FONT_SIZE,
          color: STYLE.ICON_COLOR,
        })
        .setOrigin(0.5)
        .setShadow(2, 2, STYLE.ICON_SHADOW_COLOR, 2); // ✨ NEU: Schatten
    }
    this.container.add(icon);

    // ✨ NEU: Toggle Hintergrund (Graphics für Rounded Corners)
    const toggleBg = this.add.graphics();
    // Hit-Area für Klicks (unsichtbar darüber)
    const hitArea = this.add
      .rectangle(toggleX + toggleWidth / 2, y, toggleWidth, height, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    this.container.add(toggleBg);
    this.container.add(hitArea);

    // ✨ NEU: 3D-Knopf als Container
    const toggleKnob = this.add.container(toggleX + 12, y);
    const knobShadow = this.add.circle(3, 3, 10, 0x000000, 0.4); // ✨ NEU: Stärkerer 3D-Effekt
    const knobMain = this.add.circle(0, 0, 10, COLOR_KNOB);
    knobMain.setStrokeStyle(1, 0x8b6b00);
    const knobHighlight = this.add.circle(-3, -3, 3, 0xffffff, 0.5);

    toggleKnob.add([knobShadow, knobMain, knobHighlight]);
    this.container.add(toggleKnob);

    // Status aktualisieren Funktion
    const updateVisuals = (enabled: boolean) => {
      toggleBg.clear();

      // Schatten für Hintergrund
      toggleBg.fillStyle(0x000000, 0.4); // ✨ NEU: Stärkerer Schatten
      toggleBg.fillRoundedRect(
        toggleX + 3,
        y - height / 2 + 3,
        toggleWidth,
        height,
        height / 2,
      );

      if (enabled) {
        // Aktiv Hintergrund
        toggleBg.fillStyle(COLOR_ACTIVE, 1);
        toggleBg.fillRoundedRect(
          toggleX,
          y - height / 2,
          toggleWidth,
          height,
          height / 2,
        );

        this.tweens.add({
          targets: toggleKnob,
          x: toggleX + toggleWidth - 12,
          duration: 100,
        });
        icon.setAlpha(1);
      } else {
        // Inaktiv Hintergrund
        toggleBg.fillStyle(COLOR_INACTIVE, 1);
        toggleBg.fillRoundedRect(
          toggleX,
          y - height / 2,
          toggleWidth,
          height,
          height / 2,
        );

        this.tweens.add({
          targets: toggleKnob,
          x: toggleX + 12,
          duration: 100,
        });
        icon.setAlpha(0.85);
      }
    };

    // Initialen Wert setzen
    let currentValue = (this.settingsManager as any).get(settingKey) as boolean;
    // Sofort setzen ohne Tween beim Start
    if (currentValue) toggleKnob.x = toggleX + toggleWidth - 12;
    else toggleKnob.x = toggleX + 12;
    updateVisuals(currentValue);

    // Klick-Logik
    hitArea.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE"); // ✨ NEU: Sound abspielen
      currentValue = !currentValue;
      updateVisuals(currentValue);
      this.updateSetting(settingKey, currentValue);
    });
  }

  private updateSetting(key: string, value: any) {
    // ✨ FIX: Saubere API nutzen statt 'any'-Hack
    this.settingsManager.set(key as any, value);

    // ✨ FIX: Benachrichtige die Spielszene bei ALLEN relevanten Änderungen.
    // Das ist notwendig, damit der SoundManager (für laufende Musik) und die Hintergründe (für Effekte) reagieren können.
    if (
      key === "animationsEnabled" ||
      key === "backgroundEffectsEnabled" ||
      key === "handCardsFanned" ||
      key === "musicVolume" ||
      key === "sfxVolume"
    ) {
      // ✨ FIX: Sende das Event global an das Spiel, damit SoundManager (global) UND Szenen (lokal) es hören können.
      this.game.events.emit("settings-changed");
    }
  }

  private close() {
    // Slide-Out Animation
    this.tweens.add({
      targets: this.container,
      x: this.scale.width + 400,
      duration: 300,
      ease: "Back.In",
      onComplete: () => {
        this.scene.resume(this.parentSceneKey); // ✨ FIX: Dynamische Elternszene fortsetzen
        this.scene.stop(); // Diese Szene beenden
      },
    });

    // Overlay ausblenden
    this.tweens.add({
      targets: this.backgroundOverlay,
      fillAlpha: 0,
      duration: 300,
    });
  }
}
