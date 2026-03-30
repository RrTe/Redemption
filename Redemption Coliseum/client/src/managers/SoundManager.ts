import Phaser from "phaser";
import { SettingsManager } from "./SettingsManager";
import { AUDIO_CONFIG, type SoundLayer } from "../config/AudioConfig";
import { log, DEBUG } from "../utils/logger";


/**
 * Manages playing all sound effects in the game.
 * It reads from a central AudioConfig to play layered and configured sounds.
 */
export class SoundManager {
  private game: Phaser.Game; // ✨ FIX: Referenz auf das Spiel statt einer spezifischen Szene
  private settingsManager: SettingsManager;

  // ✨ NEU: Speichert aktive Ambience-Sounds, um sie später zu stoppen
  private activeAmbienceSounds: Phaser.Sound.BaseSound[] = [];
  // ✨ NEU: Speichert Timer für zufällige Sounds (z.B. Eule), um sie zu stoppen
  private activeAmbienceTimers: Phaser.Time.TimerEvent[] = [];
  // ✨ NEU: Speichert alle loopenden SFX, die nicht Ambience sind
  private activeSFXLoops: Phaser.Sound.BaseSound[] = [];

  private currentAmbienceKey: string | null = null;
  private currentMusic: Phaser.Sound.BaseSound | null = null; // ✨ NEU: Aktuelle Musik

  constructor(game: Phaser.Game, settingsManager: SettingsManager) {
    this.game = game;
    this.settingsManager = settingsManager;

    // Listen for global playSound events, which is the primary way to trigger sounds.
    this.game.events.on("playSound", this.playSound, this);
    this.game.events.on("playAmbience", this.playAmbience, this); // ✨ NEU
    this.game.events.on("settings-changed", () => this.updateVolumes());
    log("SoundManager", "SoundManager initialized and listening for 'playSound' events.");
  }

  /** ✨ NEU: Hilfsmethode, um die aktuell aktive Szene zu bekommen */
  private getActiveScene(): Phaser.Scene | undefined {
      // 1. Versuche, eine offiziell "aktive" Szene zu finden
      let scene: Phaser.Scene | undefined = this.game.scene.getScenes(true)[0];
      
      // 2. Fallback: Wenn keine Szene als "active" markiert ist (z.B. während kritischer Ladephasen),
      // suchen wir nach einer Szene, die zumindest den Status "RUNNING" oder "CREATING" hat.
      if (!scene) {
          scene = this.game.scene.scenes.find(s => 
            s.sys.settings.status === Phaser.Scenes.RUNNING ||
            s.sys.settings.status === Phaser.Scenes.CREATING
          );
      }
      return scene;
  }

  /**
   * Plays a sound effect defined in the AudioConfig.
   * This now supports layered sounds.
   * @param soundKey The key of the sound effect in AUDIO_CONFIG (e.g., "CARD_PLAY").
   * @param options Optional additional parameters, e.g. for pitch shifting. Not currently used but here for future expansion.
   */
  public playSound(soundKey: string, options?: any) {
    const sfxConfig = AUDIO_CONFIG[soundKey];

    if (!sfxConfig) {
      log(
        "SoundManager", `WARN: Sound key "${soundKey}" not found in AUDIO_CONFIG.`,
      );
      return;
    }

    // Get the master and SFX volume from settings
    const masterVolume = this.settingsManager.get("masterVolume");
    const sfxVolume = this.settingsManager.get("sfxVolume");

    const scene = this.getActiveScene();
    if (!scene) return;

    // Play each layer defined in the config
    sfxConfig.layers.forEach((layer: SoundLayer) => {
      this.playLayer(scene, layer, masterVolume * sfxVolume, false);
    });
  }

  /**
   * ✨ NEU: Startet eine Hintergrund-Atmosphäre (Ambience).
   * Stoppt vorherige Ambience sanft.
   */
  public playAmbience(key: string, scene?: Phaser.Scene) { // ✨ FIX: Scene-Parameter hinzugefügt
    if (this.currentAmbienceKey === key) return; // Läuft schon

    // 1. Alte Ambience aufräumen
    this.stopAmbience();

    this.currentAmbienceKey = key;
    const config = AUDIO_CONFIG[key];

    if (!config) {
      log("SoundManager", `WARN: Ambience config not found for key: ${key}`);
      return;
    }

    const masterVol = this.settingsManager.get("masterVolume");
    const musicVol = this.settingsManager.get("musicVolume"); // Wir nutzen Music-Volume für Ambience Loops

    if (masterVol <= 0 || musicVol <= 0) return;

    // ✨ FIX: Nutze übergebene Szene oder suche aktive
    const targetScene = scene || this.getActiveScene();
    if (!targetScene) {
        log("SoundManager", "WARN: No active scene found to play ambience.");
        return;
    }

    log("SoundManager", `Playing ambience: ${key} on scene: ${targetScene.sys.settings.key}`);

    // 2. Neue Layer starten
    config.layers.forEach((layer) => {
      if (layer.loop) {
        // Loop sofort starten
        const sound = this.playLayer(targetScene, layer, masterVol * musicVol, true); // ✨ FIX: targetScene
        if (sound) {
          // Fade In für sanften Übergang
          targetScene.tweens.add({ // ✨ FIX: targetScene
            targets: sound,
            volume: { from: 0, to: (sound as any).volume }, // Ziel-Volume wurde in playLayer berechnet
            duration: 2000,
          });
          this.activeAmbienceSounds.push(sound);
        }
      } else if (layer.repeatInterval) {
        // ✨ FIX: Spiele den Sound beim Starten der Ambience einmal zeitnah ab (1-3s Verzögerung),
        // damit der Spieler Feedback bekommt, und plane DANN die langen Intervalle.
        // Im PoC wurde der Sound sofort gespielt.
        this.scheduleRandomSound(targetScene, layer, 1000, 3000); // ✨ FIX: targetScene
      }
    });
  }

  /**
   * ✨ NEU: Stoppt die aktuelle Ambience (Fade Out).
   */
  public stopAmbience() {
    const scene = this.getActiveScene();
    if (!scene) return;

    // Timer löschen
    this.activeAmbienceTimers.forEach((t) => t.remove());
    this.activeAmbienceTimers = [];

    // Laufende Sounds ausfaden und stoppen
    this.activeAmbienceSounds.forEach((sound) => {
      if (
        sound instanceof Phaser.Sound.WebAudioSound ||
        sound instanceof Phaser.Sound.HTML5AudioSound
      ) {
        scene.tweens.add({
          targets: sound,
          volume: 0,
          duration: 1500,
          onComplete: () => {
            sound.stop();
            sound.destroy();
          },
        });
      }
    });
    this.activeAmbienceSounds = [];
    this.currentAmbienceKey = null;
  }

  /**
   * ✨ NEU: Interne Methode zum Abspielen eines einzelnen Layers.
   */
  private playLayer(
    scene: Phaser.Scene,
    layer: SoundLayer,
    volumeScale: number,
    isAmbienceLoop: boolean,
  ): Phaser.Sound.BaseSound | null {
    if (!scene.cache.audio.exists(layer.key)) return null;

    // Zufällige Variationen berechnen
    let detune = 0;
    if (layer.detuneRange) {
      detune = Phaser.Math.Between(-layer.detuneRange, layer.detuneRange);
    }

    // Lautstärke berechnen
    const layerBaseVol = layer.vol ?? 1.0; // ✨ NEU: Basis-Lautstärke merken
    let vol = layerBaseVol * volumeScale;
    if (layer.volRange) {
      // Zufällige Schwankung +/- volRange
      const variation = Phaser.Math.FloatBetween(
        -layer.volRange,
        layer.volRange,
      );
      vol = Phaser.Math.Clamp(vol + variation, 0, 1);
    }

    const soundConfig: Phaser.Types.Sound.SoundConfig = {
      volume: vol,
      detune: detune,
      rate: layer.rate ?? 1.0,
      loop: layer.loop ?? false,
    };

    // Verzögerung (nur für One-Shots relevant, Loops starten wir direkt und faden ein)
    if (layer.delay && !isAmbienceLoop) {
      scene.time.delayedCall(layer.delay, () => {
        const sound = scene.sound.add(layer.key, soundConfig);
        if (layer.panRange) {
          const pan = Phaser.Math.FloatBetween(-layer.panRange, layer.panRange);
          (sound as any).setPan(pan);
        }
        sound.play();
      });
      return null; // Kein direktes Sound-Objekt zurückgeben bei Delay
    } else {
      const sound = scene.sound.add(layer.key, soundConfig);
      // ✨ NEU: Speichere die Basis-Lautstärke im Sound-Objekt für spätere Updates
      (sound as any)._baseConfigVol = layerBaseVol;
      if (layer.panRange) {
        const pan = Phaser.Math.FloatBetween(-layer.panRange, layer.panRange);
        (sound as any).setPan(pan);
      }
      sound.play();

      // ✨ NEU: Tracke loopende SFX, damit wir sie stoppen können
      if (soundConfig.loop && !isAmbienceLoop) {
          this.activeSFXLoops.push(sound);
      }
      return sound;
    }
  }

  /**
   * ✨ NEU: Plant rekursiv zufällige Sounds (z.B. Eule).
   * @param customMin Optional: Überschreibt das Minimum für diesen einen Aufruf
   * @param customMax Optional: Überschreibt das Maximum für diesen einen Aufruf
   */
  private scheduleRandomSound(scene: Phaser.Scene, layer: SoundLayer, customMin?: number, customMax?: number) {
    if (!layer.repeatInterval) return;

    const delay = Phaser.Math.Between(
      customMin ?? layer.repeatInterval.min,
      customMax ?? layer.repeatInterval.max,
    );

    const timer = scene.time.delayedCall(delay, () => {
      // Sound abspielen (als SFX behandeln, da One-Shot)
      const masterVol = this.settingsManager.get("masterVolume");
      const sfxVol = this.settingsManager.get("sfxVolume");

      if (masterVol > 0 && sfxVol > 0) {
        this.playLayer(scene, layer, masterVol * sfxVol, false);
      }

      // Nächsten Aufruf planen (Rekursion)
      this.scheduleRandomSound(scene, layer);
    });

    this.activeAmbienceTimers.push(timer);
  }

  /**
   * ✨ NEU: Aktualisiert laufende Loops, wenn Settings geändert werden.
   */
  private updateVolumes() {
    const masterVol = this.settingsManager.get("masterVolume");
    const musicVol = this.settingsManager.get("musicVolume");

    // Aktualisiere laufende Ambience Loops
    this.activeAmbienceSounds.forEach((sound) => {
      if (sound.isPlaying) {
        // ✨ FIX: Berechne die Lautstärke basierend auf der gespeicherten Basis-Lautstärke neu.
        const baseVol = (sound as any)._baseConfigVol ?? 1.0;
        const newVol = baseVol * masterVol * musicVol;
        (sound as any).setVolume(newVol);
      }
    });

    // Aktualisiere laufende Hintergrundmusik
    if (this.currentMusic && this.currentMusic.isPlaying) {
      const baseVol = (this.currentMusic as any)._baseConfigVol ?? 1.0;
      const newMusicVol = baseVol * masterVol * musicVol;
      (this.currentMusic as any).setVolume(newMusicVol);
    }
  }

  /**
   * Cleans up event listeners when the manager is destroyed.
   */
  public destroy() {
    if (this.game) {
      this.game.events.off("playSound", this.playSound, this);
      this.game.events.off("playAmbience", this.playAmbience, this); // ✨ NEU
      this.game.events.off("settings-changed", this.updateVolumes, this); // ✨ FIX: Cleanup korrigiert
    }
  }

  /** ✨ NEU: Stoppt alle loopenden SFX (Sicherheitsnetz). */
  public stopAllSFXLoops() {
    this.activeSFXLoops.forEach((sound) => {
        if (sound.isPlaying) {
            sound.stop();
            sound.destroy();
        }
    });
    this.activeSFXLoops = [];
  }

  /** 
   * ✨ NEU: Die "Notbremse". Stoppt ALLES. 
   * Sollte nur beim expliziten Verlassen des Spiels (Button Click) gerufen werden,
   * NICHT beim automatischen Szenenwechsel (destroy), da es sonst die Lobby stummschaltet.
   */
  public stopEverything() {
      this.stopMusic();
      this.stopAmbience();
      this.stopAllSFXLoops();
      this.game.sound.stopAll(); // Doppelte Sicherheit für untrackbare Sounds
  }

  /**
   * ✨ NEU: Spielt eine Musikdatei ab, die vom Server gesendet wurde.
   * Lädt die Datei bei Bedarf on-the-fly.
   */
  public playMusicTrack(path: string, name: string, onComplete: () => void) {
      const scene = this.getActiveScene();
      if (!scene) return;

      // Stoppe aktuelle Musik
      if (this.currentMusic) {
          this.currentMusic.stop();
          this.currentMusic.destroy();
          this.currentMusic = null;
      }

      const key = `music_${name}`;
      const masterVol = this.settingsManager.get("masterVolume");
      const musicVol = this.settingsManager.get("musicVolume");

      const play = () => {
          if (masterVol <= 0 || musicVol <= 0) {
              // Wenn stumm, trotzdem "abspielen" simulieren für den Flow, oder warten?
              // Wir warten einfach kurz und feuern onComplete, damit die Playlist weiterläuft.
              setTimeout(onComplete, 5000); 
              return;
          }

          // ✨ FIX: Nutze game.sound statt scene.sound, damit die Musik beim Szenenwechsel nicht zerstört wird.
          const finalVol = masterVol * musicVol;
          this.currentMusic = this.game.sound.add(key, { volume: finalVol });
          // Speichere Basis-Lautstärke für dynamische Updates (Settings)
          (this.currentMusic as any)._baseConfigVol = 1.0; 
          this.currentMusic.once('complete', onComplete);
          this.currentMusic.play();
          log("SoundManager", `Playing music: ${name}`);
      };

      if (scene.cache.audio.exists(key)) {
          play();
      } else {
          log("SoundManager", `Loading music track: ${path}`);
          scene.load.audio(key, path);
          scene.load.once(`filecomplete-audio-${key}`, play);
          scene.load.start();
      }
  }

  /**
   * ✨ NEU: Stoppt die aktuelle Musik (optional mit Fade-Out).
   * Gibt ein Promise zurück, das aufgelöst wird, wenn die Musik gestoppt ist.
   * @param scene Optional: Die Szene, die den Fade-Tween ausführen soll.
   */
  public stopMusic(fadeOutDuration: number = 0, scene?: Phaser.Scene): Promise<void> {
    return new Promise((resolve) => {
        if (!this.currentMusic) {
            resolve();
            return;
        }

        // ✨ FIX: Nutze die übergebene Szene oder suche eine aktive als Fallback.
        const targetScene = scene || this.getActiveScene();

        if (fadeOutDuration > 0 && targetScene) {
            // Wir vertrauen darauf, dass das Sound-Objekt eine 'volume'-Eigenschaft hat (Phaser Standard).
            targetScene.tweens.add({
                    targets: this.currentMusic,
                    volume: 0,
                    duration: fadeOutDuration,
                    onComplete: () => {
                        if (this.currentMusic) {
                            this.currentMusic.stop();
                            this.currentMusic.destroy();
                            this.currentMusic = null;
                        }
                        resolve();
                    }
                });
                return;
        }

        // Sofort stoppen, wenn kein Fade gewünscht oder möglich ist
        this.currentMusic.stop();
        this.currentMusic.destroy();
        this.currentMusic = null;
        resolve();
    });
  }
}
