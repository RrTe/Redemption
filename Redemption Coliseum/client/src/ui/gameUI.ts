import Phaser from "phaser";
import { type Room } from "colyseus.js";
import {
  type SelectionDialogData,
  type SelectionAction,
} from "../scenes/SelectionDialogScene";
import { SelectionDialogScene } from "../scenes/SelectionDialogScene";
import { getStateCallbacks } from "../network/connection";
import { CARD_TYPES } from "../../../shared/card-constants"; // Dieser Import ist jetzt korrekt
import { calculateLayout, type GameLayout } from "../ui/layout";
import { CardUI } from "./CardUI"; // ✨ Importiere die neue CardUI-Klasse
import { ElementManager } from "./ElementManager.js";
import { CardRenderer } from "./CardRenderer.js";
import { InputManager } from "./InputManager.js";
import { PileUI } from "./PileUI"; // ✨ Importiere die neue PileUI-Klasse
import { NetworkManager } from "../network/NetworkManager"; // ✨ NEU (SCHRITT 3)
import { PhaseManager } from "../managers/PhaseManager"; // ✨ NEU
import { SettingsManager } from "../managers/SettingsManager"; // ✨ NEU: Schritt 1.1
import { SoundManager } from "../managers/SoundManager"; // ✨ NEU: Schritt 1.2
import { AnimationManager } from "./AnimationManager.js";
import { PreviewManager } from "./PreviewManager.js"; // ✨ NEU
import { ChatManager } from "../managers/ChatManager"; // ✨ NEU
import type {
  GameRoomMessages,
  MoveCardMessage,
} from "../../../shared/messages";
import { PHASES } from "../../../shared/phases.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones";
import type { CardState, PlayerState, RoomState } from "../../../shared/types";
import { log, DEBUG } from "../utils/logger";

// ✨ NEU: Zentrale Konfiguration für den Phasen-Indikator (Glow)
const PHASE_INDICATOR_STYLE = {
  ACTIVE_COLOR: 0xffd700, // Gold für aktiven Spieler
  INACTIVE_COLOR: 0xaaaaaa, // Silber/Grau für inaktiven Spieler
  GLOW_STEPS: 6, // Anzahl der Schichten für den weichen Verlauf
  BASE_ALPHA_ACTIVE: 0.3, // Start-Transparenz (aktiv)
  BASE_ALPHA_INACTIVE: 0.15, // Start-Transparenz (inaktiv)
  CORNER_RADIUS: 10, // Eckenrundung des Glows
  PADDING: 6, // Abstand zum Icon
};

// 🆕 Typisiertes Room-Interface
export type TypedRoom = Room & {
  send<K extends keyof GameRoomMessages>(
    type: K,
    payload: GameRoomMessages[K],
  ): void;
};
// ✨ KORREKTUR: Leite den Typ für den Callback-Handler direkt von der Funktion ab.
export type StateCallback = ReturnType<typeof getStateCallbacks<RoomState>>;

/**
 * ✨ REFACTORING STUFE 2 & 3: Die gesamte UI-Logik ist jetzt in einer Klasse gekapselt.
 * Sie verwaltet ihre eigenen Elemente, das Layout und die Zustände.
 */
export class GameUI {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private $: StateCallback; // ✨ NEU: Den Callback-Handler speichern
  private opponentIdSet: boolean = false; // ✨ NEU: Flag, um zu verhindern, dass die Gegner-ID mehrmals gesetzt wird.
  private layout: GameLayout;
  private elementManager: ElementManager;
  private inputManager: InputManager;
  private networkManager: NetworkManager;
  private cardRenderer: CardRenderer;
  private phaseManager: PhaseManager; // ✨ NEU
  public settingsManager: SettingsManager; // ✨ NEU: Öffentlich gemacht für Zugriff via Scene Registry
  public soundManager: SoundManager; // ✨ NEU: Öffentlich für Zugriff aus der Scene
  private animationManager: AnimationManager; // ✨ NEU
  private previewManager: PreviewManager; // ✨ NEU
  private dragBounds: Phaser.Geom.Rectangle;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;
  private deckPreloaded: boolean = false; // ✨ NEU: Flag für Preloading
  private waitingOverlay: Phaser.GameObjects.Container | null = null; // ✨ NEU: Overlay für Wartezustand
  private chatManager: ChatManager; // ✨ NEU
  private gameOverOverlay: Phaser.GameObjects.Container | null = null; // ✨ NEU: Game Over Overlay

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    stateCallback: StateCallback,
  ) {
    this.scene = scene;
    this.room = room; // ✨ FIX: Zuweisung nach oben verschoben
    this.$ = stateCallback; // ✨ FIX: Zuweisung nach oben verschoben

    // ✨ NEU: Globale Manager aus der Registry holen.
    this.settingsManager = this.scene.registry.get("settingsManager");

    // ✨ NEU: SoundManager aus der Registry holen.
    this.soundManager = this.scene.registry.get("soundManager");

    // ✨ NEU: Erstelle den AnimationManager.
    this.animationManager = new AnimationManager(
      this.scene,
      this.settingsManager,
    );

    // ✨ NEU: Erstelle den PreviewManager.
    this.previewManager = new PreviewManager(this.scene);

    // ✨ NEU: Erstelle den ChatManager.
    this.chatManager = new ChatManager(this.scene, this.room);

    log(
      "UI",
      "[SETUP] Initializing GameUI..." + "Config Width:",
      scene.sys.game.config.width as number,
      "Config Height:",
      scene.sys.game.config.height as number,
    );
    log(
      "UI",
      "[SETUP] Initializing GameUI..." + "Scale Width:",
      this.scene.scale.width,
      "Scale Height:",
      this.scene.scale.height,
    );
    // ✨ KORREKTUR: Initiales Layout mit den tatsächlichen Pixelwerten des Scale Managers berechnen.
    // scene.sys.game.config.width/height können Strings wie "100%" sein, calculateLayout benötigt Zahlen.
    this.layout = calculateLayout(
      this.scene.scale.width,
      this.scene.scale.height,
      this.room.state.currentPhase, // ✨ NEU: Übergebe die initiale Phase
    );

    // ✨ REFACTORING: Erstelle die Manager-Instanzen.
    this.elementManager = new ElementManager(
      this.scene,
      this.room,
      this.layout,
    );
    this.elementManager.createAllElements();

    // Drag-Grenzen definieren
    this.dragBounds = new Phaser.Geom.Rectangle(
      0,
      0,
      this.layout.GAME_WIDTH,
      this.layout.GAME_HEIGHT,
    );

    // ✨ NEU (SCHRITT 3): Erstelle den NetworkManager.
    this.networkManager = new NetworkManager(
      this.scene,
      this.room,
      this,
      this.$,
    );

    // ✨ KORREKTUR: Erstelle den InputManager NACH dem NetworkManager und übergebe ihn.
    this.inputManager = new InputManager(
      this.scene,
      this.room,
      this.networkManager,
      this.animationManager, // ✨ NEU: Übergebe den AnimationManager
      this.previewManager, // ✨ NEU: Übergebe den PreviewManager
      this.dragBounds,
      this.elementManager // ✨ NEU: Übergebe ElementManager für Highlights
    );

    this.cardRenderer = new CardRenderer(
      this.scene,
      this.room,
      this.layout,
      this.elementManager,
      this.animationManager,
      this.dragBounds,
    );

    // ✨ NEU: Erstelle den PhaseManager.
    this.phaseManager = new PhaseManager(
      this.scene,
      this.room,
      this,
      this.elementManager,
      this.networkManager,
    );
    this.phaseManager.initialize();

    // Debug-Grafikobjekt erstellen, wenn DEBUG aktiv ist
    if (DEBUG) {
      this.debugGraphics = this.scene.add.graphics().setDepth(99);
    }

    // ✨ NEU: Mache die resolveSearch-Methode global für Debugging-Zwecke verfügbar.
    // @ts-ignore
    window.resolveSearch = (cardIds: string[], toZone: string) => {
      this.resolveSearch(cardIds, toZone);
    };

    // ✨ NEU: Mache die lookAtCards-Methode global für Debugging-Zwecke verfügbar.
    // @ts-ignore
    window.lookAtCards = (
      zone: Zone,
      count: number,
      position: "top" | "bottom" = "top",
    ) => {
      this.lookAtCards(zone, count, position);
    };

    // ✨ NEU: Mache die revealCards-Methode global für Debugging-Zwecke verfügbar.
    // @ts-ignore
    window.revealCards = (
      zone: Zone,
      count: number,
      position: "top" | "bottom" = "top",
    ) => {
      this.revealCards(zone, count, position);
    };

    // ✨ NEU: Globaler Hook für Save Game (für SettingsDialog)
    // @ts-ignore
    window.saveGame = () => this.saveGame();
  }

  // ✨ KORREKTUR: Die Initialisierung der Handler wird jetzt von der Scene gesteuert.
  public initializeScene() {
    // ✨ REFACTORING: Delegiere die Registrierung an den InputManager.
    this.inputManager.registerInputHandlers();

    // ✨ NEU: Settings-Button Handler
    this.elementManager.staticElements.settingsButton.on("pointerdown", () => {
      this.scene.scene.pause("CardGame"); // Spiel pausieren
      this.scene.scene.launch("SettingsDialogScene", {
        parentScene: "CardGame",
      }); // ✨ FIX: Elternszene übergeben
      this.scene.game.events.emit("playSound", "page_flip"); // ✨ FIX: Globaler Event-Bus
    });

    // ✨ NEU: Save-Button Handler
    this.elementManager.staticElements.saveButton.on("pointerdown", () => {
      this.scene.game.events.emit("playSound", "UI_TOGGLE");
      this.saveGame();
    });

    // ✨ NEU: Concede-Button Handler
    this.elementManager.staticElements.concedeButton.on("pointerdown", () => {
      // Sound abspielen (gleicher wie Next Phase / UI Toggle)
      this.scene.game.events.emit("playSound", "UI_TOGGLE");

      // Einfache Bestätigung (Browser-Native ist am sichersten für den Anfang)
      if (window.confirm("Are you sure you want to concede the game?")) {
        this.room.send("concede", {});
      }
    });

    // ✨ NEU: Melde dem Server, dass wir bereit sind (Assets geladen, UI erstellt).
    this.networkManager.sendPlayerReady();
  }
  /** ✨ DEIN PLAN: Merkt Karten für die Zieh-Animation vor. */
  private markCardsForDrawAnimation(cardIds: string[]) {
    log(
      "UI",
      `[DEBUG] [3/3] 'markCardsForDrawAnimation' triggered. Marking cards for animation:`,
      cardIds,
    );

    // ✨ FINALE KORREKTUR: Markiere ALLE Karten SOFORT als pending.
    // Das verhindert, dass sie im nächsten Render-Zyklus als "normale" Handkarten (sichtbar) gerendert werden.
    cardIds.forEach((cardId) => {
      this.animationManager.pendingDrawAnimations.add(cardId);
    });
    // Stoße EINMALIG ein Re-Rendering an. Der CardRenderer kümmert sich um den Rest.
    this.render(this.room.state, this.room.sessionId);
  }

  /** Registriert Handler für Colyseus-Raum-Events. */
  public registerRoomHandlers() {
    // ✨ NEU: Detailliertes Logging wiederhergestellt.
    log(
      "UI",
      `[registerRoomHandlers] Registering handlers using the '$' proxy. Current room.sessionId: '${this.room.sessionId}'`,
    );

    // ✨ NEU (SCHRITT 3): Delegiere die Registrierung der Nachrichten-Handler.
    this.networkManager.registerHandlers();

    // ✨ NEU: Delegiere die Registrierung der Phasen-Handler.
    this.phaseManager.registerHandlers();

    // ✨ NEU: Lausche auf das lokale Event, um die Zieh-Animation zu starten.
    // ... (bestehender Code)

    // ✨ NEU: Handler für Save Game Daten vom Server
    this.room.onMessage("saveGameData", (data: any) => {
      this.downloadSaveFile(data);
    });

    this.scene.events.on("playDrawAnimation", (data: { cardIds: string[] }) => {
      // ✨ ARCHITEKTUR-FIX: Sound immer hier abspielen (Feedback auf Event).
      // Das entkoppelt den Sound von der visuellen Animation.
      this.scene.game.events.emit("playSound", "CARD_DRAW"); // ✨ FIX: Globaler Event-Bus

      // ✨ Wenn Animationen deaktiviert sind, ignoriere dieses Event.
      // Der reguläre State-Patch wird die Karten rendern, was die Race Condition vermeidet.
      if (!this.settingsManager.areAnimationsEnabled()) {
        return;
      }
      log(
        "UI",
        `[DEBUG] [2/3] 'playDrawAnimation' event received by GameUI. Triggering handler.`,
      );
      this.markCardsForDrawAnimation(data.cardIds);
    });

    // ✨ NEU: Handler für Karten-Interaktionen (Drehen/Wenden per Maus)
    this.scene.events.on(
      "request-card-action",
      (data: { cardId: string; action: string; currentValue: boolean }) => {
        let updates = {};

        if (data.action === "toggle-flip") {
          updates = { isFlipped: !data.currentValue };
        } else if (data.action === "toggle-face-down") {
          updates = { isFaceDown: !data.currentValue };
        }

        if (Object.keys(updates).length > 0) {
          this.room.send("updateCardState", {
            cardId: data.cardId,
            updates,
          });
        }
      },
    );

    // ✨ DEIN PLAN: Logge bei JEDER Zustandsänderung die Deckgrößen.
    this.room.onStateChange((state) => {
      log(
        "UI",
        `[onStateChange] State changed. Player deck size: ${
          state.players.get(this.room.sessionId)?.deck.length
        }, Opponent deck size: ${
          state.players.get(this.findOpponentId(state))?.deck.length
        }`,
      );
    });
  }

  /** ✨ NEU: Fordert den Server auf, das Spiel zu speichern */
  public saveGame() {
    log("UI", "Requesting save game from server...");
    this.room.send("requestSaveGame", {});
  }

  /** ✨ NEU: Lädt die JSON-Datei herunter */
  private downloadSaveFile(data: any) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.download = `redemption_save_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log("UI", "Save game downloaded.");
  }

  /** ✨ NEU: Erstellt einen Button im Pergament-Stil, kopiert aus LobbyScene für Konsistenz */
  private createStyledButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
    width: number = 300,
    height: number = 60,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.image(0, 0, "button_parchment");
    bg.setDisplaySize(width, height);

    const fontSize = Math.min(32, height * 0.6);
    const yOffset = fontSize * -0.25;
    const text = this.scene.add
      .bitmapText(0, yOffset, "fairydust", label, fontSize)
      .setOrigin(0.5)
      .setTint(0xf4f6e1)
      .setDropShadow(2, 2, 0x000000, 0.7);

    container.add([bg, text]);
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => bg.setTint(0xdddddd));
    container.on("pointerout", () => bg.clearTint());

    container.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      callback();
    });

    return container;
  }

  /** ✨ NEU: Zeigt das Game-Over-Overlay an. */
  public showGameOverOverlay(isWinner: boolean) {
    if (this.gameOverOverlay) return; // Verhindert doppeltes Erstellen

    log(
      "UI",
      `Showing Game Over overlay. Player has ${isWinner ? "won" : "lost"}.`,
    );

    const { width, height } = this.scene.scale;
    this.gameOverOverlay = this.scene.add.container(0, 0).setDepth(11000); // Höchster Z-Index

    const bg = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0)
      .setInteractive();

    const titleText = isWinner ? "Victory!" : "Defeat";
    const titleColor = isWinner ? 0xffd700 : 0xaaaaaa;

    const title = this.scene.add
      .bitmapText(width / 2, height / 2 - 100, "fairydust", titleText, 96)
      .setOrigin(0.5)
      .setTint(titleColor)
      .setDropShadow(4, 4, 0x000000, 0.9);

    const backButton = this.createStyledButton(
      width / 2,
      height / 2 + 80,
      "Back to Lobby",
      () => {
        this.room.leave();
        localStorage.removeItem("reconnectionToken");
        this.scene.scene.start("LobbyScene");
      },
    );

    this.gameOverOverlay.add([bg, title, backButton]);
    this.gameOverOverlay.setAlpha(0);

    this.scene.tweens.add({
      targets: this.gameOverOverlay,
      alpha: 1,
      duration: 1000,
      ease: "Power1",
    });
  }

  /** ✨ NEU: Öffnet den Dialog für aufgedeckte Karten. Wird vom NetworkManager aufgerufen. */
  public showRevealDialog() {
    if (this.room.state.revealedCards.length === 0) return;

    const actionTakerId = this.room.state.actionTakerId;
    const isMyAction = actionTakerId === this.room.sessionId;

    log(
      "UI",
      `[REVEAL DIALOG] Starting dialog. actionTakerId on state: '${actionTakerId}', mySessionId: '${this.room.sessionId}', isMyAction: ${isMyAction}`,
    );

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("SelectionDialogScene", {
      title: "Aufgedeckte Karten",
      cards: [...this.room.state.revealedCards],
      room: this.room,
      showCloseButton: isMyAction,
      isInteractive: false,
      onComplete: () => {},
      onCancel: () => {
        // ✨ KORREKTUR: Delegiere an den NetworkManager.
        if (isMyAction) this.networkManager.sendResolveReveal();
      },
    } as SelectionDialogData);
    log("UI", "Launched SelectionDialogScene for revealed cards.");
  }

  /** ✨ NEU: Eine Hilfsmethode, um den Dialog sicher zu schließen. */
  public closeSelectionDialog() {
    const dialog = this.scene.scene.get("SelectionDialogScene");
    if (dialog && dialog.scene.isActive()) {
      // ✨ KORREKTUR: Der Cast ist sicher, da wir wissen, dass es unsere Szene ist.
      // `closeDialog` ist eine public Methode auf `SelectionDialogScene`.
      (dialog as SelectionDialogScene).closeDialog();
    }
  }

  /** Positioniert alle UI-Elemente neu, z.B. bei einer Fenstergrößen-Änderung. */
  public repositionUI() {
    // ✨ FINALE KORREKTUR: Berechne das Layout IMMER neu basierend auf dem aktuellen Zustand.
    // Dies stellt sicher, dass bei einer Fenstergrößenänderung die aktuelle Phase
    // (z.B. 'battle') korrekt berücksichtigt wird und das Layout nicht zurückgesetzt wird.
    const newLayout = calculateLayout(
      this.scene.scale.width,
      this.scene.scale.height,
      this.room.state.currentPhase,
    );
    this.layout = newLayout;
    this.elementManager.layout = newLayout;
    this.cardRenderer.layout = newLayout;

    // ✨ REFACTORING: Delegiere die Neupositionierung an den ElementManager.
    this.elementManager.repositionUI(newLayout);

    // ✨ NEU: Chat-Button positionieren
    this.chatManager.reposition(newLayout);

    // Drag-Grenzen aktualisieren
    this.dragBounds.setSize(this.layout.GAME_WIDTH, this.layout.GAME_HEIGHT);

    // === Visuelles Debugging (nur wenn DEBUG aktiv ist) ===
    // ✨ KORREKTUR: Das Zeichnen der Debug-Linien erfolgt jetzt NACH der Neupositionierung.
    if (this.debugGraphics) {
      this.debugGraphics.clear();
      // ✨ NEU: Positioniere die Status- und Phasentexte neu, um Platz für die Gegnerhand zu machen.
      const drawDebug = (zone: Phaser.GameObjects.Zone, color: number) => {
        // Wichtig: getBounds() liefert die globalen Koordinaten der Zone nach der Positionierung.
        this.debugGraphics
          ?.lineStyle(2, color, 0.8)
          .strokeRectShape(zone.getBounds());
      };
      drawDebug(this.elementManager.zoneElements.playerTerritoryZone, 0x0000ff);
      drawDebug(
        this.elementManager.zoneElements.playerLandOfBondageZone,
        0x800080,
      ); // Lila
      drawDebug(
        this.elementManager.zoneElements.opponentTerritoryZone,
        0xff0000,
      );
      drawDebug(
        this.elementManager.zoneElements.opponentLandOfBondageZone,
        0xffa500,
      ); // Orange
      drawDebug(this.elementManager.zoneElements.playerHandZone, 0x00ff00);
      // ✨ KORREKTUR: Die Gegner-Handzone wird jetzt auch im Debug-Modus gezeichnet.
      drawDebug(this.elementManager.zoneElements.opponentHandZone, 0x00ffff); // Cyan für Gegner-Hand

      // ✨ DEIN WUNSCH: Zeichne die Battlefield-Dropzone in Gelb, wenn sie sichtbar ist.
      const battlefieldZone = this.elementManager.zoneElements.battlefieldZone;
      if (battlefieldZone.getBounds().height > 0) {
        drawDebug(battlefieldZone, 0xffff00); // Gelb
      }
    }

    // Ein erneutes Rendering der Karten anstoßen, da sich ihre Zielpositionen geändert haben
    if (this.room?.state?.players) {
      this.render(this.room.state, this.room.sessionId);
    }
  }

  /** ✨ NEU: Startet die Animation für den Phasenwechsel. Wird vom PhaseManager aufgerufen. */
  public startPhaseChangeAnimation(endLayout: GameLayout) {
    this.scene.tweens.add({
      targets: { value: 0 },
      value: 1,
      duration: 400,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.getValue();
        if (progress === null) return;

        const interpolatedLayout = this.interpolateLayout(
          this.layout,
          endLayout,
          progress,
        );
        this.elementManager.repositionUI(interpolatedLayout);
      },
      onComplete: () => {
        this.repositionUI();
      },
    });
  }
  /**
   * Öffentliche Haupt-Render-Methode.
   * Koordiniert das Rendern der verschiedenen UI-Teile.
   */
  public render(state: RoomState, mySessionId: string) {
    if (!state) return;

    const player = state.players.get(mySessionId);
    let opponent: PlayerState | undefined;
    if (state.players.size > 1) {
      for (const [sessionId, playerState] of state.players.entries()) {
        if (sessionId !== mySessionId) {
          opponent = playerState;
          break;
        }
      }
    }

    log(
      "UI",
      `[render] Rendering with player deck size: ${player?.deck.length}`,
    );

    this.updateGameStateUI(state, mySessionId, opponent);

    if (!player) {
      // ✨ REFACTORING: Delegiere das Aufräumen an den Renderer.
      this.cardRenderer.cleanupAllCards();
      // Piles für den Spieler zurücksetzen, falls er das Spiel verlässt
      this.updatePileCounts(null, opponent);
      return;
    }

    this.updatePileCounts(player, opponent);
    // ✨ REFACTORING: Delegiere das Rendern der Karten an den Renderer.
    this.cardRenderer.renderAllCards(player, opponent);

    // ✨ NEU: Bilder des Decks vorladen, um graue Karten beim Ziehen zu vermeiden.
    // Wir machen das nur einmalig, sobald das Deck verfügbar ist.
    if (!this.deckPreloaded && player && player.deck.length > 0) {
      // ✨ FINALE LÖSUNG: Sequentielles Laden per Event ("Queue Empty").
      // Fall 1: Es laufen Animationen (z.B. Starthand). Wir warten auf das Event.
      if (this.animationManager.activeDrawTweens.size > 0) {
        log(
          "UI",
          "[PRELOAD] Animations active. Waiting for completion to preload deck.",
        );
        this.scene.events.once("all-draw-animations-complete", () => {
          this.preloadDeck(player);
        });
      }
      // Fall 2: Keine Animationen (z.B. Reconnect). Wir laden sofort.
      else {
        this.preloadDeck(player);
      }
    }
  }

  /** ✨ NEU: Lädt die Bilder für das gesamte Deck vor. */
  private preloadDeck(player: PlayerState) {
    if (this.deckPreloaded || !player || player.deck.length === 0) return;

    this.deckPreloaded = true;
    log(
      "UI",
      `[PRELOAD] Preloading images for ${player.deck.length} cards in deck.`,
    );
    player.deck.forEach((card) => {
      CardUI.preloadContent(this.scene, card);
    });
    this.scene.load.start();
  }

  /** Aktualisiert statische UI-Elemente wie Texte und Buttons. */
  private updateGameStateUI(
    state: RoomState,
    mySessionId: string,
    opponent: PlayerState | undefined,
  ) {
    if (DEBUG) {
      log(
        "UI",
        `[UI UPDATE] Updating GameState UI. Current Phase: ${state.currentPhase}`,
      );
    }

    const isActive = state.activePlayer === mySessionId;

    // ✨ NEU: Phasen-Icons aktualisieren
    // ✨ FIX: Nutze die korrekten Phasen-Konstanten, um die Icons zu aktualisieren.
    const phasesToShow = [
      PHASES.DRAW,
      PHASES.UPKEEP,
      PHASES.PREP,
      PHASES.BATTLE,
      PHASES.DISCARD,
    ];
    const currentPhase = state.currentPhase;

    // Verstecke den Indikator standardmäßig (wird aktiviert, wenn wir das aktive Icon finden)
    this.elementManager.staticElements.phaseIndicator.setVisible(false);

    phasesToShow.forEach((phase) => {
      const icon = this.elementManager.staticElements.phaseIcons[phase];
      if (!icon) return;

      const isCurrentPhase = phase === currentPhase;

      // ✨ FIX: Hole die Größe aus den Layout-Daten für dieses spezifische Icon.
      // Vorher wurde auf 'this.layout.phaseIconSize' zugegriffen, was undefined war -> Icons unsichtbar.
      const layoutData = this.layout.phaseIcons[phase];
      const baseSize = layoutData ? layoutData.size : 32; // Fallback, falls Layout fehlt

      // ✨ FIX: Speichere den Skalierungsfaktor, damit repositionUI ihn respektiert.
      const scaleFactor = isCurrentPhase ? 1.2 : 0.9;
      icon.setData("scaleFactor", scaleFactor);

      const targetSize = baseSize * scaleFactor;
      icon.setDisplaySize(targetSize, targetSize);

      // Debug Log für das erste Icon, um sicherzugehen
      if (DEBUG && phase === PHASES.DRAW) {
        log(
          "UI",
          `[UI UPDATE] Icon 'draw': baseSize=${baseSize}, targetSize=${targetSize}, visible=${icon.visible}, x=${icon.x}, y=${icon.y}`,
        );
      }

      // ✨ NEU: Positioniere und zeichne den Indikator hinter dem aktiven Icon
      if (isCurrentPhase) {
        const indicator = this.elementManager.staticElements.phaseIndicator;
        indicator.clear();

        // Farbe: Gold (Satt) für aktiven Spieler, Silber/Grau für inaktiven
        const color = isActive
          ? PHASE_INDICATOR_STYLE.ACTIVE_COLOR
          : PHASE_INDICATOR_STYLE.INACTIVE_COLOR;

        // ✨ NEU: Rounded Rectangle mit Glow-Effekt (mehrere Schichten)
        const steps = PHASE_INDICATOR_STYLE.GLOW_STEPS;
        const baseAlpha = isActive
          ? PHASE_INDICATOR_STYLE.BASE_ALPHA_ACTIVE
          : PHASE_INDICATOR_STYLE.BASE_ALPHA_INACTIVE;
        const basePadding = PHASE_INDICATOR_STYLE.PADDING;
        const cornerRadius = PHASE_INDICATOR_STYLE.CORNER_RADIUS;

        for (let i = 0; i < steps; i++) {
          // Alpha nimmt nach außen hin ab
          const alpha = baseAlpha / (i + 1);
          const expansion = i * 2; // Jede Schicht wird etwas größer

          const w = targetSize + basePadding + expansion * 2;
          const h = targetSize + basePadding + expansion * 2;

          indicator.fillStyle(color, alpha);
          // Zeichne zentriertes Rounded Rectangle
          indicator.fillRoundedRect(-w / 2, -h / 2, w, h, cornerRadius + i);
        }

        indicator.setPosition(icon.x, icon.y);
        indicator.setVisible(true);
      }

      // Transparenz/Farbe:
      // Aktiver Spieler + Aktuelle Phase: Normal (Alpha 1)
      // Sonst: Leicht ausgegraut (Alpha 0.5)
      const targetAlpha = isActive && isCurrentPhase ? 1.0 : 0.5;
      icon.setAlpha(targetAlpha);
    });

    // ✨ NEU: Spieler-Infos aktualisieren
    // Wir greifen auf die im PlayerState gespeicherten Namen zu.
    if (state.players.has(mySessionId)) {
      const me = state.players.get(mySessionId);
      this.elementManager.staticElements.playerInfoText.setText(
        `Player: ${me?.name || "Unknown"}\nDeck: ${me?.deckName || "Unknown"}`,
      );
    }

    if (opponent) {
      this.elementManager.staticElements.opponentInfoText.setText(
        `Player: ${opponent.name}\nDeck: ${opponent.deckName}`,
      );
    } else {
      this.elementManager.staticElements.opponentInfoText.setText(
        "Waiting for opponent...",
      );
    }
  }

  /** ✨ NEU: Berechnet ein Zwischen-Layout für die Animations-Updates. */
  private interpolateLayout(
    start: GameLayout,
    end: GameLayout,
    t: number,
  ): GameLayout {
    const interpolated = { ...end }; // Beginne mit der Endstruktur

    // Gehe durch alle Rechtecke im Layout und interpoliere ihre Werte.
    // ✨ KORREKTUR 2 & 3: Sage TypeScript, dass 'key' ein gültiger Schlüssel von GameLayout ist.
    for (const key in start) {
      const typedKey = key as keyof GameLayout;
      if (start[typedKey] instanceof Phaser.Geom.Rectangle) {
        const startRect = start[typedKey] as Phaser.Geom.Rectangle;
        const endRect = end[typedKey] as Phaser.Geom.Rectangle;
        (interpolated as any)[typedKey] = new Phaser.Geom.Rectangle(
          Phaser.Math.Linear(startRect.x, endRect.x, t),
          Phaser.Math.Linear(startRect.y, endRect.y, t),
          Phaser.Math.Linear(startRect.width, endRect.width, t),
          Phaser.Math.Linear(startRect.height, endRect.height, t),
        );
      }
    }
    return interpolated as GameLayout;
  }

  /** Aktualisiert die Zähler auf den Kartenstapeln. */
  private updatePileCounts(
    player: PlayerState | null,
    opponent: PlayerState | undefined,
  ) {
    const deckCount = player?.deck.length ?? 0;
    log(
      "UI",
      `[updatePileCounts] Updating player deck count UI with value: ${deckCount}`,
    );
    this.elementManager.zoneElements.playerDeckPile.updateCount(deckCount);
    this.elementManager.zoneElements.playerDiscardPile.updateCount(
      player?.discard.length ?? 0,
    );
    this.elementManager.zoneElements.opponentDeckPile.updateCount(
      opponent?.deck.length ?? 0,
    );
    this.elementManager.zoneElements.opponentDiscardPile.updateCount(
      opponent?.discard.length ?? 0,
    );
    // ✨ NEU (PHASE 2): Aktualisiere die Zähler der neuen Piles
    this.elementManager.zoneElements.playerReservePile.updateCount(
      player?.reserve.length ?? 0,
    );
    this.elementManager.zoneElements.opponentReservePile.updateCount(
      opponent?.reserve.length ?? 0,
    );
    this.elementManager.zoneElements.playerLandOfRedemptionPile.updateCount(
      player?.land_of_redemption.length ?? 0,
    );
    this.elementManager.zoneElements.opponentLandOfRedemptionPile.updateCount(
      opponent?.land_of_redemption.length ?? 0,
    );
    this.elementManager.zoneElements.playerBanishPile.updateCount(
      player?.banish.length ?? 0,
    );
    this.elementManager.zoneElements.opponentBanishPile.updateCount(
      opponent?.banish.length ?? 0,
    );
  }

  /** Setzt den Text der Statusanzeige. */
  public setStatus(text: string, color = "#fff") {
    // ✨ FIX: Status-Text wurde entfernt. Wir könnten hier später eine Toast-Nachricht einbauen.
  }

  /** Zerstört alle UI-Elemente. */
  public destroy() {
    // ✨ REFACTORING: Delegiere das Aufräumen an den Renderer.
    this.cardRenderer.cleanupAllCards();

    // Zerstöre das Debug-Grafikobjekt, falls es existiert
    if (this.debugGraphics) {
      this.debugGraphics.destroy();
    }
  }

  /** ✨ NEU: Sendet die Auswahl des Spielers an den Server, um die Suche abzuschließen. */
  private resolveSearch(
    selectedCardIds: string[],
    toZone: Zone,
    coords?: MoveCardMessage["coords"],
  ) {
    // ✨ NEU (SCHRITT 3): Delegiere an den NetworkManager.
    this.networkManager.sendResolveSearch(selectedCardIds, toZone, coords);
    // Setze den Status zurück, damit der Spieler weiterspielen kann
    this.setStatus("Resolving search...");
  }

  /** ✨ NEU: Sendet eine Anfrage an den Server, um die obersten/untersten Karten eines Stapels anzusehen. */
  public lookAtCards(zone: Zone, count: number, position: "top" | "bottom") {
    this.networkManager.sendLookAtCards(zone, count, position);
    this.setStatus(`Looking at cards...`);
  }

  /** ✨ NEU: Sendet eine Anfrage an den Server, um Karten öffentlich aufzudecken. */
  public revealCards(zone: Zone, count: number, position: "top" | "bottom") {
    this.networkManager.sendRevealCards(zone, count, position);
    this.setStatus(`Revealing cards...`);
  }
  /** ✨ NEU: Richtet die UI für einen beigetretenen Gegner ein. Wird vom NetworkManager aufgerufen. */
  public setupOpponentUI(opponentId: string) {
    this.elementManager.zoneElements.opponentLandOfBondageZone.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentTerritoryZone.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentDeckPile?.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentDiscardPile?.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentReservePile?.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentLandOfRedemptionPile?.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentBanishPile?.setData(
      "ownerId",
      opponentId,
    );
    this.elementManager.zoneElements.opponentHandZone.setData(
      "ownerId",
      opponentId,
    );
    log(
      "UI",
      `[SETUP] Opponent joined. Set ownerId to '${opponentId}' on opponent zones.`,
    );
  }

  /** Hilfsmethode, um die ID des Gegners zu finden. */
  public findOpponentId(state: RoomState): string | undefined {
    for (const sessionId of state.players.keys()) {
      if (sessionId !== this.room.sessionId) {
        return sessionId;
      }
    }
    return undefined;
  }

  /** ✨ NEU: Prüft den Spielerstatus und zeigt/versteckt das Warte-Overlay. */
  public updateWaitingStatus() {
    const playerCount = this.room.state.players.size;

    // ✨ NEU: Prüfe auf getrennten Gegner
    const opponentId = this.findOpponentId(this.room.state);
    const opponent = opponentId
      ? this.room.state.players.get(opponentId)
      : undefined;

    // ✨ FIX: Overlay erst entfernen, wenn das Spiel wirklich gestartet ist (activePlayer ist gesetzt).
    // Das passiert erst, nachdem beide Spieler "Ready" gemeldet haben.
    // ✨ FIX: Prüfe auch, ob der Gegner "ready" ist (Ladeszene beendet).
    if (
      playerCount < 2 ||
      !this.room.state.activePlayer ||
      (opponent && !opponent.ready)
    ) {
      this.showWaitingOverlay("Waiting for Opponent...");
    } else if (opponent && !opponent.connected) {
      this.showWaitingOverlay("Opponent disconnected. Waiting..."); // ✨ NEU: Spezifische Nachricht
    } else {
      this.hideWaitingOverlay();
    }
  }

  private showWaitingOverlay(message: string) {
    const { width, height } = this.scene.scale;

    if (this.waitingOverlay) {
      // ✨ NEU: Text aktualisieren, falls Overlay schon da ist
      const textObj = this.waitingOverlay.getByName(
        "waitingText",
      ) as Phaser.GameObjects.BitmapText;
      if (textObj) textObj.setText(message);
      return;
    }

    this.waitingOverlay = this.scene.add.container(0, 0).setDepth(10000); // Ganz oben

    // Hintergrund (blockiert Input)
    const bg = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();

    const text = this.scene.add
      .bitmapText(
        width / 2,
        height / 2,
        "fairydust",
        message, // ✨ NEU: Dynamischer Text
        48,
      )
      .setOrigin(0.5)
      .setTint(0xffd700)
      .setDropShadow(4, 4, 0x000000, 0.8)
      .setName("waitingText"); // ✨ NEU: Name für Zugriff

    this.scene.tweens.add({
      targets: text,
      alpha: 0.6,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    this.waitingOverlay.add([bg, text]);
  }

  private hideWaitingOverlay() {
    if (this.waitingOverlay) {
      this.waitingOverlay.destroy();
      this.waitingOverlay = null;
    }
  }
}
