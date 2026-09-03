import Phaser from "phaser";
import { connectToRoom, getStateCallbacks } from "../network/connection"; // ✨ NEU: getStateCallbacks importieren
import { GameUI, type StateCallback, type TypedRoom } from "../ui/gameUI"; // ✨ NEU: StateCallback importieren
import { calculateLayout } from "../ui/layout.js";
import type { RoomState } from "../../../shared/types";
import { QuantitySelectionDialogScene } from "./QuantitySelectionDialogScene";
import {
  SelectionDialogScene,
  type SelectionDialogData,
} from "./SelectionDialogScene"; // ✨ NEU
import { ErrorDialogScene } from "./ErrorDialogScene";
import { ConfirmationDialogScene } from "./ConfirmationDialogScene";
import { WaitingDialogScene } from "./WaitingDialogScene";
import { SettingsDialogScene } from "./SettingsDialogScene"; // ✨ NEU
import type { GameBackground } from "../ui/backgrounds/GameBackground";
import { TempleBackground } from "../ui/backgrounds/TempleBackground";
import { GardenBackground } from "../ui/backgrounds/GardenBackground";
import { PlaceBackground } from "../ui/backgrounds/PlaceBackground";

import { ZONES } from "../../../shared/zones"; // ✨ NEU: Import für Zonen-Konstanten
import { log, error } from "../utils/logger"; // ✨ NEU: Logger importieren

export default class CardGameScene extends Phaser.Scene {
  private room!: TypedRoom;
  private ui!: GameUI;
  private currentBackground: GameBackground | null = null; // ✨ NEU

  constructor() {
    super("CardGame");
  }

  init(data: { room?: TypedRoom }) {
    // ✨ NEU: Wenn ein Raum von der Lobby übergeben wurde, nutzen wir ihn.
    if (data && data.room) {
      this.room = data.room;
    }
  }

  preload() {
    // ✨ FIX: Assets werden jetzt zentral in der GameLoadingScene geladen,
    // um den "Black Screen" beim Start zu vermeiden.
    // Wir laden hier nur noch die JSON-Daten in den Cache (synchron).
    // ✨ FIX: Lade die importierten Daten direkt in den Cache.
    // Das funktioniert, weil wir die Datei oben importiert haben (Build-Time vs Run-Time).
    const cardDatabase = this.registry.get("cardDatabase");
    this.cache.json.add("carddata", cardDatabase);
  }

  async create() {
    try {
      // ✨ FIX: Nuclear Option - Entferne alle existierenden Kinder der Szene.
      // Das stellt sicher, dass keine "Geister-Objekte" aus vorherigen Runs übrig bleiben.
      this.children.removeAll();

      // ✨ NEU: Registriere die Dialog-Szene dynamisch, damit sie verfügbar ist.
      if (!this.scene.get("QuantitySelectionDialogScene")) {
        this.scene.add(
          "QuantitySelectionDialogScene",
          QuantitySelectionDialogScene,
          false,
        );
      }
      
      if (!this.scene.get("ErrorDialogScene")) {
        this.scene.add("ErrorDialogScene", ErrorDialogScene, false);
      }

      if (!this.scene.get("ConfirmationDialogScene")) {
        this.scene.add("ConfirmationDialogScene", ConfirmationDialogScene, false);
      }

      if (!this.scene.get("WaitingDialogScene")) {
        this.scene.add("WaitingDialogScene", WaitingDialogScene, false);
      }

      // SelectionDialogScene ist bereits global in main.ts registriert.

      // ✨ NEU: Registriere die Settings-Szene
      if (!this.scene.get("SettingsDialogScene")) {
        this.scene.add("SettingsDialogScene", SettingsDialogScene, false);
      }

      // ✨ NEU: Deaktiviere das Browser-Kontextmenü, um Rechtsklicks für Spielaktionen zu nutzen.
      this.input.mouse?.disableContextMenu();

      // ✨ FIX: Verhindert, dass minimale Mausbewegungen als Drag-Aktion gewertet werden, was Klicks blockiert.
      this.input.dragDistanceThreshold = 5;

      // ✨ NEU: Nur verbinden, wenn wir nicht schon verbunden sind (durch die Lobby)
      if (!this.room) {
        this.room = await connectToRoom();
      }

      // ✨ FINALE LÖSUNG: Erstelle den Callback-Handler, wie in der Doku beschrieben.
      // Dies ist der korrekte Weg, um auf State-Änderungen zu lauschen.
      const $ = getStateCallbacks<RoomState>(this.room);

      // UI mit dem Raum und dem Callback-Handler initialisieren.
      this.ui = new GameUI(this, this.room, $);
      this.ui.initializeScene();

      // ✨ FINALE LÖSUNG: Rufe die Registrierung der Raum-Handler explizit auf, NACHDEM die UI initialisiert wurde.
      this.ui.registerRoomHandlers();

      // ✨ FIX: Hintergrund erst initialisieren, wenn UI und SettingsManager bereit sind.
      this.initializeBackground();

      // ✨ FIX: Resize-Handler speichern, um ihn beim Shutdown sauber zu entfernen.
      // Das verhindert, dass 'repositionUI' auf einer zerstörten Szene aufgerufen wird.
      const onResize = (gameSize: Phaser.Structs.Size) => {
        if (
          isNaN(gameSize.width) ||
          isNaN(gameSize.height) ||
          gameSize.width <= 0 ||
          gameSize.height <= 0
        ) {
          return;
        }
        // Die repositionUI-Methode benötigt kein Argument mehr.
        if (this.ui) this.ui.repositionUI();
        // ✨ NEU: Hintergrund anpassen
        this.currentBackground?.resize(gameSize.width, gameSize.height);
      };

      this.scale.on("resize", onResize);

      // ✨ NEU: Cleanup beim Beenden der Szene
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          this.scale.off("resize", onResize); // WICHTIG: Globalen Listener entfernen!
          if (this.ui) {
              this.ui.destroy();
          }
      });

      // Initiales UI-Layout anwenden
      // Sie berechnet das Layout intern basierend auf der aktuellen Phase.
      this.ui.repositionUI();
      this.ui.setStatus("Connected ✅", "#0f0");

      // Keybindings und den allgemeinen State-Change-Handler registrieren
      this.room.onStateChange((state: RoomState) => {
        this.ui.render(state, this.room.sessionId);
      });

      // ✨ FIX: Initiales Rendern erzwingen, damit Spieler 2 nicht auf den ersten State-Change warten muss.
      this.ui.render(this.room.state, this.room.sessionId);

      // ✨ NEU: Lausche auf Settings-Änderungen für den Hintergrund
      // ✨ FIX: Lausche auf dem globalen Game-Bus, da der SettingsDialog dort sendet.
      this.game.events.on("settings-changed", () => {
        const enabled = this.ui.settingsManager.areBackgroundEffectsEnabled();
        this.currentBackground?.onSettingsChanged(enabled);
        
        // ✨ FIX: Leite das globale Event an die lokalen UI-Elemente der Szene (wie CardUI) weiter
        this.events.emit("settings-changed");

        // ✨ NEU: UI neu rendern, z. B. um das Handkarten-Layout (Fan vs Gerade) sofort anzuwenden
        if (this.room && this.room.state) {
          this.ui.render(this.room.state, this.room.sessionId);
        }
      });
    } catch (err) {
      error("CardGame", "Connection failed:", err); // ✨ FIX: Logger nutzen
      this.add
        .text(
          this.scale.width / 2,
          this.scale.height / 2,
          "Connection failed!",
          { color: "#f66", fontSize: "24px" },
        )
        .setOrigin(0.5);
    }
  }

  /** ✨ NEU: Wählt und initialisiert einen Hintergrund. */
  private initializeBackground() {
    const rnd = Phaser.Math.Between(1, 3);
    const settings = this.ui.settingsManager;

    switch (rnd) {
      case 1:
        this.currentBackground = new TempleBackground(this, settings);
        break;
      case 2:
        this.currentBackground = new GardenBackground(this, settings);
        break;
      case 3:
        this.currentBackground = new PlaceBackground(this, settings);
        break;
    }

    this.currentBackground?.create();
  }
}
