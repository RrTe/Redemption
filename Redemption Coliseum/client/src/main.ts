import Phaser from "phaser";
import "./style.css";
import CardGameScene from "./scenes/CardGameScene";

import { UITestScene } from "./scenes/UITestScene";
import { SelectionDialogScene } from "./scenes/SelectionDialogScene";
import { LobbyScene } from "./scenes/LobbyScene"; // ✨ NEU
import { GameLoadingScene } from "./scenes/GameLoadingScene"; // ✨ NEU: Importieren
import { SettingsManager } from "./managers/SettingsManager"; // ✨ NEU
import { SoundManager } from "./managers/SoundManager"; // ✨ NEU
import { HubScene } from "./scenes/HubScene"; // ✨ NEU
import { DeckEditorScene } from "./scenes/deck-editor/DeckEditorScene"; // ✨ NEU
import { NotificationManager } from "./ui/notifications/NotificationManager";
import { ViewportManager } from "./ui/managers/ViewportManager"; // ✨ NEU: Responsives Layouting
import { cardData } from "./utils/CardService";
// DeckMetricsDialogScene has been replaced by an HTML DOM overlay - no longer a separate scene



// 🔍 Modus aus URL lesen
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");

window.addEventListener("DOMContentLoaded", () => {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "game",
    pixelArt: false, // Wichtig für pixelgenaue Darstellung
    antialias: true,
    roundPixels: false, // Kann weggelassen werden (ist standard), aber explizit gesetzt
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    // ✨ KORREKTUR: Wir übergeben hier keine Szenen, um den automatischen Start zu verhindern.
    // Die Szenen werden nach der Erstellung des Spiels manuell hinzugefügt.
    dom: {
      createContainer: true,
    },
    loader: {
      maxParallelDownloads: 24,
    },
  };

  const game = new Phaser.Game(config);

  // ✨ NEU: ViewportManager initialisieren für responsive UI
  ViewportManager.init(game);

  // ✨ NEU: Globale Manager erstellen und in der Registry speichern.
  // Diese sind dann in jeder Szene über `this.registry.get(...)` verfügbar.
  const settingsManager = new SettingsManager();
  game.registry.set('settingsManager', settingsManager);
  game.registry.set('cardDatabase', cardData);

  // SoundManager benötigt die 'game' Instanz, um sound-Operationen szenenübergreifend zu steuern.
  const soundManager = new SoundManager(game, settingsManager);
  game.registry.set('soundManager', soundManager);

  const notificationManager = new NotificationManager();
  game.registry.set('notificationManager', notificationManager);


  // ✨ NEU: Füge alle Szenen zum Scene Manager hinzu. Sie werden dadurch registriert, aber nicht gestartet.
  game.scene.add("CardGame", CardGameScene);
  game.scene.add("UITestScene", UITestScene);
  game.scene.add("SelectionDialogScene", SelectionDialogScene);
  game.scene.add("LobbyScene", LobbyScene); // ✨ NEU
  game.scene.add("GameLoadingScene", GameLoadingScene); // ✨ NEU: Registrieren
  game.scene.add("HubScene", HubScene); // ✨ NEU
  game.scene.add("DeckEditorScene", DeckEditorScene); // ✨ NEU
  // DeckMetricsDialogScene removed - replaced by HTML overlay in DeckEditorScene

  // ✨ NEU: Starte jetzt explizit die eine Szene, die wir basierend auf dem Modus benötigen.
  game.scene.start(mode === "ui" ? "UITestScene" : "HubScene"); // ✨ FIX: Start mit HubScene statt LobbyScene

  // ✨ KORREKTUR: Verhindert das Standard-Browser-Kontextmenü auf dem Canvas.
  // Das ist notwendig, damit wir den Rechtsklick für eigene Aktionen im Spiel nutzen können.
  game.canvas.oncontextmenu = (e) => e.preventDefault();
});
