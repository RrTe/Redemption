import Phaser from "phaser";
import { connectToRoom, getStateCallbacks } from "../network/connection"; // ✨ NEU: getStateCallbacks importieren
import { GameUI, type StateCallback, type TypedRoom } from "../ui/gameUI"; // ✨ NEU: StateCallback importieren
import { MapSchema } from "@colyseus/schema";
import { calculateLayout } from "../ui/layout.js";
import type { CardState, RoomState } from "../../../shared/types";
import { QuantitySelectionDialogScene } from "./QuantitySelectionDialogScene";
import {
  SelectionDialogScene,
  type SelectionAction, // ✨ NEU: Importieren
  type SelectionDialogData,
} from "./SelectionDialogScene"; // ✨ NEU
import { SettingsDialogScene } from "./SettingsDialogScene"; // ✨ NEU
import type { GameBackground } from "../ui/backgrounds/GameBackground";
import { TempleBackground } from "../ui/backgrounds/TempleBackground";
import { GardenBackground } from "../ui/backgrounds/GardenBackground";
import { PlaceBackground } from "../ui/backgrounds/PlaceBackground";
import cardData from "../../../shared/carddata.json"; // ✨ NEU: JSON direkt importieren
import { ZONES } from "../../../shared/zones"; // ✨ NEU: Import für Zonen-Konstanten
import { log, error } from "../utils/logger"; // ✨ NEU: Logger importieren

export default class CardGameScene extends Phaser.Scene {
  private room!: TypedRoom;
  private ui!: GameUI;
  private currentBackground: GameBackground | null = null; // ✨ NEU

  // ✨ Tastenbelegungen als private, statische und schreibgeschützte Eigenschaft definieren.
  //    Das räumt die create-Methode auf und bündelt die Konfiguration an einer Stelle.
  private static readonly KEY_BINDINGS = [
    // 'T' entfernt, da wir es für Tokens nutzen und Tappen in Redemption nicht brauchen.
    {
      key: "R", // R für "Reveal" / "Turn"
      action: (card: CardState) => ({ isFaceDown: !card.isFaceDown }),
    },
    {
      key: "F", // F für "Flip"
      action: (card: CardState) => ({ isFlipped: !card.isFlipped }),
    },
    {
      key: "C",
      action: (card: CardState) => {
        const currentCounter = card.counters.get("+1") || 0;
        return { counters: { "+1": currentCounter + 1 } };
      },
    },
  ];

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
    this.cache.json.add("carddata", cardData);
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
      this.registerKeybindings();
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

  private registerKeybindings() {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      log(
        "CardGame",
        "WARN: Keyboard plugin not available. Cannot register test keybindings.",
      );
      return;
    }

    log("Input", "Registering keybindings...");

    // ✨ NEU: Taste 'T' für Token-Auswahl
    // ✨ FIX: Nutze addKey statt Event-Listener, um die Taste vom Browser abzufangen (verhindert Suchleiste).
    const keyT = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);

    keyT.on("down", () => {
      log("Input", "T key pressed"); // ✨ FIX: Logger nutzen
      const cardData = this.cache.json.get("carddata");
      if (!cardData || !cardData.cards) {
        log(
          "CardGame",
          "WARN: Kartendaten 'carddata' nicht im Cache gefunden. Prüfe 'assets/data/carddata.json'.",
        );
        return;
      }

      // 1. Filtern nach Typ "Token"
      const allTokens = cardData.cards.filter(
        (c: any) => c.Type && c.Type.includes("Token"),
      );

      // 2. Umwandeln in temporäre Objekte für den Dialog
      // Wir erstellen Objekte, die dem CardState Interface genügen (für die UI-Anzeige)
      const tokenPreviews = allTokens.map((tokenDef: any, index: number) => {
        return {
          id: `token_preview_${index}`,
          cardId: tokenDef.Name, // Wichtig für Image-Lookup
          Name: tokenDef.Name,
          Type: tokenDef.Type,
          ImageFile: tokenDef.ImageFile,
          // Dummy-Werte für den Rest
          controllerId: this.room.sessionId,
          originalOwnerId: this.room.sessionId,
          zone: "selection",
          faceUp: true,
          isFlipped: false,
          isTapped: false,
          x: 0,
          y: 0,
          lastMoved: 0,
          counters: new MapSchema(),
          attachedTo: null,
        } as unknown as CardState;
      });

      // ✨ NEU: Definiere die erlaubten Aktionen (Buttons) im Dialog.
      // Nur Territory und Land of Bondage für beide Spieler sind erlaubt.
      const possibleActions: SelectionAction[] = [
        {
          label: "My Territory",
          actionId: "my_territory",
          toZone: ZONES.TERRITORY,
          target: "me",
        },
        {
          label: "My LoB",
          actionId: "my_lob",
          toZone: ZONES.LAND_OF_BONDAGE,
          target: "me",
        },
        {
          label: "Opp Territory",
          actionId: "opp_territory",
          toZone: ZONES.TERRITORY,
          target: "opponent",
        },
        {
          label: "Opp LoB",
          actionId: "opp_lob",
          toZone: ZONES.LAND_OF_BONDAGE,
          target: "opponent",
        },
      ];

      // 3. Dialog öffnen
      this.scene.pause("CardGame");
      this.scene.launch("SelectionDialogScene", {
        title: "Select a Token",
        cards: tokenPreviews,
        room: this.room,
        showCloseButton: true,
        isInteractive: true, // Wichtig, damit Buttons angezeigt werden
        selectionRules: { min: 1, max: 99 }, // ✨ FIX: Limit praktisch aufgehoben
        possibleActions: possibleActions, // ✨ NEU: Übergebe die Buttons
        onComplete: (result: any) => {
          // Wir brauchen eine Kartenauswahl UND eine Aktion (Button-Klick)
          if (result.selectedCardIds.length > 0 && result.actionId) {
            // 1. Schließe den Auswahl-Dialog
            this.ui.closeSelectionDialog();

            // 2. Öffne den Mengen-Dialog (Vorschaltdialog)
            this.scene.pause("CardGame"); // Sicherstellen, dass das Spiel pausiert bleibt
            this.scene.launch("QuantitySelectionDialogScene", {
              title: "How many Tokens?",
              maxCount: 20, // Sinnvolles Limit für Tokens auf einmal
              minCount: 1,
              enablePositionSelection: false, // ✨ WICHTIG: Keine "Top/Bottom" Auswahl
              onConfirm: (count: number) => {
                // 3. Erstelle die Tokens in der gewünschten Anzahl
                result.selectedCardIds.forEach((selectedId: string) => {
                  const selectedToken = tokenPreviews.find(
                    (t: any) => t.id === selectedId,
                  );
                  if (selectedToken) {
                    let targetZone = ZONES.TERRITORY;
                    let targetOwnerId = this.room.sessionId;
                    const opponentId = this.ui.findOpponentId(this.room.state);

                    // Mapping der Action-IDs zu Zone und Owner
                    switch (result.actionId) {
                      case "my_territory":
                        targetZone = ZONES.TERRITORY;
                        break;
                      case "my_lob":
                        targetZone = ZONES.LAND_OF_BONDAGE;
                        break;
                      case "opp_territory":
                        targetZone = ZONES.TERRITORY;
                        targetOwnerId = opponentId || "";
                        break;
                      case "opp_lob":
                        targetZone = ZONES.LAND_OF_BONDAGE;
                        targetOwnerId = opponentId || "";
                        break;
                    }

                    // Sende Nachricht an Server für jeden Token in der gewünschten Anzahl
                    if (targetOwnerId) {
                      for (let i = 0; i < count; i++) {
                        (this.room as any).send("createToken", {
                          cardId: selectedToken.Name,
                          zone: targetZone,
                          ownerId: targetOwnerId,
                        });
                      }
                    }
                  }
                });
                this.scene.resume("CardGame");
              },
              onCancel: () => {
                this.scene.resume("CardGame");
              },
            } as any); // Cast zu any, da QuantitySelectionDialogData hier nicht importiert ist, aber die Struktur passt
          } else {
            this.ui.closeSelectionDialog();
          }
        },
        onCancel: () => this.ui.closeSelectionDialog(),
      } as SelectionDialogData);
    });

    keyboard.on("keydown-UP", () => {
      if (this.room.state.activePlayer)
        this.room.send("changeRedeemedSouls", { amount: 1 });
    });
    keyboard.on("keydown-DOWN", () => {
      if (this.room.state.activePlayer)
        this.room.send("changeRedeemedSouls", { amount: -1 });
    });

    CardGameScene.KEY_BINDINGS.forEach(({ key, action }) => {
      keyboard.addKey(key).on("down", () => {
        const me = this.room.state.players?.get(this.room.sessionId);
        const firstCardInHand = me?.hand[0];
        if (firstCardInHand && this.room.state.activePlayer) {
          const updates = action(firstCardInHand);
          this.room.send("updateCardState", {
            cardId: firstCardInHand.id,
            updates,
          });
        }
      });
    });
  }
}
