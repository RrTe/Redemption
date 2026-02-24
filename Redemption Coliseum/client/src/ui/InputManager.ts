import Phaser from "phaser";
import { type TypedRoom } from "./gameUI.js";
import { type NetworkManager } from "../network/NetworkManager.js";
import { type AnimationManager } from "./AnimationManager.js";
import { type PreviewManager } from "./PreviewManager.js";
import { RadialMenu } from "./components/RadialMenu.js";
import type { ActionIconConfig } from "./types/types.js";
import { CardUI } from "./CardUI.js";
import { PileUI } from "./PileUI.js";
import { StackedPileUI } from "./StackedPileUI.js";
import { type MoveCardMessage } from "../../../shared/messages.js";
import { ZONES, PILE_ZONES, type Zone } from "../../../shared/zones.js";
import type { QuantitySelectionDialogData } from "../scenes/QuantitySelectionDialogScene.js";
import { log, DEBUG } from "../utils/logger";
import { ElementManager } from "./ElementManager.js"; // ✨ NEU


// ✨ NEU: Verzögerung (in ms), bevor der Attach-Modus aktiviert wird.
const ATTACH_HOVER_DELAY = 700;

/**
 * Verwaltet alle globalen Input-Handler der Szene,
 * insbesondere für Drag & Drop.
 */
export class InputManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: NetworkManager;
  private animationManager: AnimationManager;
  private previewManager: PreviewManager;
  private dragBounds: Phaser.Geom.Rectangle;
  // Variablen für Doppelklick-Erkennung
  private lastClickTime: number = 0;
  private lastClickedCardId: string | null = null;
  private activeMenu: RadialMenu | null = null; // Referenz auf das offene Menü
  private isDragging: boolean = false; // ✨ NEU: Globaler Drag-Status
  private currentDragTarget: CardUI | null = null; // ✨ NEU: Aktuelles Ziel unter der Maus
  private pendingDragTarget: CardUI | null = null; // ✨ NEU: Potenzielles Ziel für Attach (während Delay)
  private attachHoverTimer: number | null = null; // ✨ NEU: Timer für Attach-Verzögerung
  private currentHoveredDeck: StackedPileUI | null = null; // ✨ NEU: Welches Deck wird gerade gehovert?
  private elementManager: ElementManager; // ✨ NEU

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    dragBounds: Phaser.Geom.Rectangle,
    elementManager: ElementManager // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.dragBounds = dragBounds;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.elementManager = elementManager; // ✨ NEU
  }

  /** Registriert alle globalen Input-Event-Handler für Drag & Drop. */
  public registerInputHandlers() {
    // Handler für Mouseover-Effekte auf Handkarten
    this.scene.input.on("gameobjectover", this.onPointerOver, this);
    this.scene.input.on("gameobjectout", this.onPointerOut, this);

    // Der entscheidende Handler für den Rechtsklick
    this.scene.input.on(
      "gameobjectdown",
      (
        pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
      ) => {
        log(
          "Input", `gameobjectdown on ${
            gameObject.constructor.name
          } (RightBtn: ${pointer.rightButtonDown()})`,
        );

        // Prüfe, ob es ein Rechtsklick war
        if (pointer.rightButtonDown()) {
          let searchZone: Zone | undefined;
          let targetPlayerId: string | undefined;

          // Universelle Rechtsklick-Logik
          if (
            gameObject instanceof PileUI || // Menü für Deck, Reserve etc.
            gameObject instanceof StackedPileUI // Menü für Discard, Banish etc.
          ) {
            // Fall 1: Klick auf einen Stapel. Leere Zonen wie Territory werden hierdurch ignoriert.
            searchZone = gameObject.name as Zone;
            targetPlayerId = gameObject.getData("ownerId");
          } else if (gameObject instanceof Phaser.GameObjects.Zone) {
            // ✨ NEU: Auch Klicks auf die Zone der gegnerischen Hand abfangen.
            if (gameObject.name === ZONES.HAND) {
              const ownerId = gameObject.getData("ownerId");
              // Nur wenn es nicht meine eigene Hand ist (ownerId !== sessionId)
              if (ownerId && ownerId !== this.room.sessionId) {
                searchZone = ZONES.HAND;
                targetPlayerId = ownerId;
              }
            }
          } else if (gameObject instanceof CardUI) {
            // Fall 2: Klick direkt auf eine Karte.
            const cardZone = gameObject.cardData.zone as Zone;

            // ✨ NEU: Erlaube das Radialmenü auch für gegnerische Handkarten (um sie zu durchsuchen/anzusehen).
            const isOpponentHand =
              cardZone === ZONES.HAND &&
              gameObject.cardData.controllerId !== this.room.sessionId;

            // Suche in Stapeln ODER in der gegnerischen Hand erlauben.
            if (PILE_ZONES.includes(cardZone) || isOpponentHand) {
              searchZone = cardZone;
              targetPlayerId = gameObject.cardData.controllerId;
            } else if (cardZone !== ZONES.HAND) {
              // ✨ NEU: Für Karten auf dem Feld (Territory, Battlefield, etc.) öffnen wir das Radial Menu.
              // Handkarten werden weiterhin über 'gameobjectup' behandelt.
              this.openCardRadialMenu(pointer, gameObject);
              return;
            }
          }

          // Wenn eine gültige Zone für die Suche gefunden wurde:
          if (searchZone) {
            log(
              "Input", `Right-clicked on searchable zone: ${searchZone} of player ${targetPlayerId}`,
            );

            // ✨ FIX: Kein Menü auf leeren Stapeln anzeigen.
            // Gilt nicht für die Hand, da diese anders behandelt wird.
            if (searchZone !== ZONES.HAND) {
              const pId = targetPlayerId || this.room.sessionId;
              const player = this.room.state.players.get(pId);
              if (player) {
                const pile = (player as any)[searchZone!];
                if (!pile || pile.length === 0) {
                  log("Input", `Pile ${searchZone} is empty. Not opening radial menu.`);
                  return; // Abbrechen, wenn der Stapel leer ist
                }
              }
            }

            // ✨ NEU: Sonderfall Gegner-Hand: Direkt Suchen, kein Menü.
            if (
              searchZone === ZONES.HAND &&
              targetPlayerId !== this.room.sessionId
            ) {
              this.networkManager.sendRequestSearchPile(
                searchZone,
                targetPlayerId,
              );
              return;
            }

            // Wenn bereits ein Menü offen ist, passiert nichts, da der Blocker den Klick abfängt.
            // Diese Prüfung ist eine zusätzliche Sicherheit für den Fall, dass der Klick durchkommt.
            if (this.activeMenu) {
              this.activeMenu.close();
              return;
            }

            // Statt sofort zu suchen, öffnen wir das Radial Menu.
            const menuConfigs: ActionIconConfig[] = [];

            // 1. Search (Suchen) - Immer verfügbar für Stapel
            menuConfigs.push({
              iconKey: "icon_search",
              actionKey: "search",
              callback: () => {
                log(
                  "Input", `[RadialMenu] Action 'search' triggered for ${searchZone} of ${targetPlayerId}`,
                );
                this.networkManager.sendRequestSearchPile(
                  searchZone!,
                  targetPlayerId,
                );
              },
            });

            // 2. Look (Anschauen) - Nur oberste X Karten (z.B. 5)
            menuConfigs.push({
              iconKey: "icon_look",
              actionKey: "look",
              callback: () => {
                log(
                  "Input", `[RadialMenu] Action 'look' triggered for ${searchZone} of ${
                    targetPlayerId || "self"
                  }`,
                );

                // Ermittle die maximale Anzahl Karten im Stapel
                const pId = targetPlayerId || this.room.sessionId;
                const player = this.room.state.players.get(pId);
                if (!player) return; // ✨ FIX: Safety Check
                const pile = (player as any)[searchZone!];
                const maxCount = pile?.length || 0;

                if (maxCount === 0) return;

                // Öffne den Auswahldialog
                this.scene.scene.pause("CardGame");
                this.scene.scene.launch("QuantitySelectionDialogScene", {
                  title: "Karten ansehen",
                  maxCount: maxCount,
                  onConfirm: (count, position) => {
                    this.networkManager.sendLookAtCards(
                      searchZone!,
                      count,
                      position,
                      targetPlayerId,
                    );
                  },
                  onCancel: () => {
                    this.scene.scene.resume("CardGame");
                  },
                } as QuantitySelectionDialogData);
              },
            });

            // 3. Reveal (Aufdecken) - Nur oberste Karte
            menuConfigs.push({
              iconKey: "icon_reveal",
              actionKey: "reveal",
              callback: () => {
                log(
                  "Input", `[RadialMenu] Action 'reveal' triggered for ${searchZone} of ${
                    targetPlayerId || "self"
                  }`,
                );

                // Ermittle die maximale Anzahl Karten im Stapel
                const pId = targetPlayerId || this.room.sessionId;
                const player = this.room.state.players.get(pId);
                if (!player) return; // ✨ FIX: Safety Check
                const pile = (player as any)[searchZone!];
                const maxCount = pile?.length || 0;

                if (maxCount === 0) return;

                // Öffne den Auswahldialog
                this.scene.scene.pause("CardGame");
                this.scene.scene.launch("QuantitySelectionDialogScene", {
                  title: "Karten aufdecken",
                  maxCount: maxCount,
                  onConfirm: (count, position) => {
                    this.networkManager.sendRevealCards(
                      searchZone!,
                      count,
                      position,
                      targetPlayerId,
                    );
                  },
                  onCancel: () => {
                    this.scene.scene.resume("CardGame");
                  },
                } as QuantitySelectionDialogData);
              },
            });

            // 4. Shuffle (Mischen) - Nur für Decks sinnvoll
            if (searchZone === ZONES.DECK || searchZone === ZONES.RESERVE) {
              menuConfigs.push({
                iconKey: "icon_shuffle",
                actionKey: "shuffle",
                callback: () => {
                  log(
                    "Input", `[RadialMenu] Action 'shuffle' triggered for ${searchZone}`,
                  );
                  // Sende Shuffle-Nachricht
                  this.room.send("shufflePile", { zone: searchZone });
                },
              });
            }

            // 5. Discard (Abwerfen) - Nur für Deck sinnvoll ("oberste Karte abwerfen")
            if (searchZone === ZONES.DECK) {
              menuConfigs.push({
                iconKey: "icon_discard",
                actionKey: "discard",
                callback: () => {
                  log(
                    "Input", `[RadialMenu] Action 'discard' triggered for ${searchZone} of ${
                      targetPlayerId || "self"
                    }`,
                  );

                  const pId = targetPlayerId || this.room.sessionId;
                  const player = this.room.state.players.get(pId);
                  if (!player) return; // ✨ FIX: Safety Check
                  const pile = (player as any)[searchZone!];
                  const maxCount = pile?.length || 0;

                  if (maxCount === 0) return;

                  this.scene.scene.pause("CardGame");
                  this.scene.scene.launch("QuantitySelectionDialogScene", {
                    title: "Karten abwerfen",
                    maxCount: maxCount,
                    onConfirm: (count, position) => {
                      let cardsToDiscard: any[] = [];
                      if (position === "top") {
                        cardsToDiscard = pile.slice(0, count);
                      } else {
                        cardsToDiscard = pile.slice(-count);
                      }

                      cardsToDiscard.forEach((card: any) => {
                        this.networkManager.sendMoveCard({
                          from: ZONES.DECK,
                          to: ZONES.DISCARD,
                          cardId: card.id,
                        });
                      });
                    },
                    onCancel: () => {
                      this.scene.scene.resume("CardGame");
                    },
                  } as QuantitySelectionDialogData);
                },
              });
            }

            // Position des Menüs anpassen, damit es immer im Bild ist.
            const radius = 80; // Der Radius, den wir dem Menü übergeben
            const iconSize =
              Math.min(this.scene.scale.width, this.scene.scale.height) / 12;
            const menuRadius = radius + iconSize / 2; // Ungefährer Gesamtradius des Menüs

            let cx = pointer.x;
            let cy = pointer.y;

            // Position an den Bildschirmrändern anpassen (Clamping)
            cx = Phaser.Math.Clamp(
              cx,
              menuRadius,
              this.scene.scale.width - menuRadius,
            );
            cy = Phaser.Math.Clamp(
              cy,
              menuRadius,
              this.scene.scale.height - menuRadius,
            );

            this.activeMenu = new RadialMenu(
              this.scene,
              cx,
              cy,
              radius,
              menuConfigs,
              () => {
                this.activeMenu = null; // Callback zum Aufräumen
              },
            );

            // Verhindert, dass dieser Klick auch andere Events (wie den Linksklick zum Ziehen) auslöst.
            pointer.event.stopPropagation();
          }
        }
      },
    );

    // Handler für Klick-Interaktionen (Drehen/Wenden) auf Karten
    this.scene.input.on(
      "gameobjectup",
      (
        pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
      ) => {
        log("Input", `gameobjectup on ${gameObject.constructor.name}`);

        // Wir interessieren uns nur für CardUI-Objekte
        if (!(gameObject instanceof CardUI)) return;

        const card = gameObject as CardUI;
        const zone = card.currentZone;

        // Nur in erlaubten Zonen (Territory, LoB, Hand)
        if (
          zone !== ZONES.TERRITORY &&
          zone !== ZONES.LAND_OF_BONDAGE &&
          zone !== ZONES.HAND
        ) {
          return;
        }

        // 1. Rechtsklick: Drehen (180 Grad) -> Toggle 'isFlipped'
        if (pointer.rightButtonReleased()) {
          // ✨ FIX: Nur für Handkarten erlauben, da Feldkarten jetzt das Radial Menu nutzen.
          if (zone === ZONES.HAND) {
            log(
              "Input", `Right Click detected on Hand Card ${card.cardData.id}`,
            );
            this.room.send("updateCardState", {
              cardId: card.cardData.id,
              updates: { isFlipped: !card.cardData.isFlipped },
            });
          }
          return;
        }

        // 2. Linksklick: Doppelklick prüfen -> Wenden (Vorder/Rückseite) -> Toggle 'isFaceDown'
        if (pointer.leftButtonReleased()) {
          const now = Date.now();
          log(
            "Input", `Left Click on Card. Delta: ${now - this.lastClickTime}ms`,
          );
          if (
            this.lastClickedCardId === card.cardData.id &&
            now - this.lastClickTime < 300
          ) {
            this.room.send("updateCardState", {
              cardId: card.cardData.id,
              updates: { isFaceDown: !card.cardData.isFaceDown },
            });
            this.lastClickedCardId = null; // Reset nach erfolgreichem Doppelklick
          } else {
            this.lastClickedCardId = card.cardData.id;
          }
          this.lastClickTime = now;
        }
      },
    );

    this.scene.input.on(
      "dragstart",
      (pointer: Phaser.Input.Pointer, gameObject: CardUI) => {
        this.isDragging = true; // ✨ NEU: Drag-Start markieren
        log("Input", `dragstart on ${gameObject.cardData?.id}`);

        // Verstecke die Vorschau sofort, wenn eine Interaktion startet.
        this.previewManager.hide();

        // ✨ NEU: Stoppe eventuelle Hover-Animationen, damit unsere Physik-Engine
        // die volle Kontrolle über Skalierung und Position hat.
        this.animationManager.stopHandHoverAnimation(gameObject);

        gameObject.setDepth(1000); // ✨ FIX: Drag-Layer muss höher sein als Handkarten (100+)
        // Merke dir die Startposition der Karte.
        gameObject.setData("start_x", gameObject.x);
        gameObject.setData("start_y", gameObject.y);
        gameObject.setData("start_angle", gameObject.angle);

        // ✨ NEU: Initialisiere Drag-Targets, um Sprünge zu vermeiden
        gameObject.dragTargetX = gameObject.x;
        gameObject.dragTargetY = gameObject.y;

        this.currentDragTarget = null; // Reset Target
        gameObject.isBeingDragged = true; // ✨ NEU: Drag-Status setzen
        gameObject.startGlow(); // ✨ NEU: Glow erzwingen/behalten beim Start des Drags
        this.scene.children.bringToTop(gameObject);
      },
    );

    this.scene.input.on(
      "drag",
      (
        pointer: Phaser.Input.Pointer,
        gameObject: CardUI,
        dragX: number,
        dragY: number,
      ) => {
        // ✨ FIX: Sicherheitscheck, falls das Objekt während des Drags zerstört wurde.
        if (!gameObject.scene) return;

        // ✨ NEU: Setze nur das Ziel für die Physik-Engine (CardUI.onSceneUpdate)
        gameObject.dragTargetX = Phaser.Math.Clamp(
          dragX,
          this.dragBounds.left,
          this.dragBounds.right,
        );
        gameObject.dragTargetY = Phaser.Math.Clamp(
          dragY,
          this.dragBounds.top,
          this.dragBounds.bottom,
        );

        // ✨ NEU: Deck-Highlighting Logik (Bottom of Deck)
        // Prüfen, ob wir über dem Deck sind
        const hitObjects = this.scene.input.hitTestPointer(pointer);
        const deckPile = hitObjects.find(obj => obj instanceof StackedPileUI && obj.zoneName === ZONES.DECK) as StackedPileUI | undefined;

        if (deckPile) {
          this.currentHoveredDeck = deckPile;
          const bounds = deckPile.getBounds();
          // Wenn wir in der unteren Hälfte sind -> Highlight an
          if (pointer.y > bounds.centerY) {
            deckPile.showBottomHighlight(true);
            gameObject.setTransparent(true); // ✨ NEU: Karte transparent machen
          } else {
            deckPile.showBottomHighlight(false);
            // Transparenz nur zurücksetzen, wenn wir nicht gerade ein Attach-Ziel haben
            if (!this.currentDragTarget) gameObject.setTransparent(false);
          }
        } else {
          // Wenn wir das Deck verlassen haben, Highlight ausschalten
          if (this.currentHoveredDeck) {
            this.currentHoveredDeck.showBottomHighlight(false);
            this.currentHoveredDeck = null;
            if (!this.currentDragTarget) gameObject.setTransparent(false);
          }
        }

        // ✨ NEU: Zonen-Highlighting beim Draggen
        // Wir suchen nach Zonen unter der Maus (die keine Karten sind)
        const hitZone = hitObjects.find(obj => obj instanceof Phaser.GameObjects.Zone && obj.name) as Phaser.GameObjects.Zone | undefined;
        
        if (hitZone) {
            const zoneName = hitZone.name as Zone;
            const ownerId = hitZone.getData("ownerId");
            const isMe = ownerId === this.room.sessionId;
            
            let label = "";
            // ✨ FIX: Einheitliches Farbschema (Gold) für alle Zonen.
            // Die Unterscheidung erfolgt jetzt rein über den Text.
            const UNIFIED_COLOR = 0xffd700; 
            let color = UNIFIED_COLOR;

            // Logik für Beschriftung
            if (zoneName === ZONES.TERRITORY) {
                label = isMe ? "My Territory" : "Opponent Territory";
            } else if (zoneName === ZONES.LAND_OF_BONDAGE) {
                label = isMe ? "My Land of Bondage" : "Opponent Land of Bondage";
            } else if (zoneName === ZONES.BATTLEFIELD) {
                 // Nur in der Battle-Phase hervorheben
                 if (this.room.state.currentPhase === "battle") {
                     label = "Field of Battle";
                 }
            }

            // Wenn wir einen gültigen Label haben, zeigen wir das Highlight
            if (label) {
                this.elementManager.showZoneHighlight(hitZone, label, color);
            } else {
                this.elementManager.hideZoneHighlight();
            }
        } else {
            // Keine Zone getroffen -> Verstecken
            this.elementManager.hideZoneHighlight();
        }

        // ✨ NEU: Prüfen, ob wir über einer anderen Karte schweben (für Attach)
        // Wir nutzen hitTestPointer, um Objekte unter der Maus zu finden.
        // (Hinweis: hitObjects wurde oben schon geholt, wir können es wiederverwenden oder neu holen)
        // Wir nutzen hier das existierende Array weiter.

        // Suche nach einer CardUI, die NICHT die gezogene Karte ist.
        const target = hitObjects.find(
          (obj) =>
            obj instanceof CardUI &&
            obj !== gameObject &&
            // Nur Karten im Territory oder Battlefield erlauben (keine Handkarten, keine Piles)
            (obj as CardUI).currentZone !== ZONES.HAND &&
            !PILE_ZONES.includes((obj as CardUI).currentZone) &&
            // ✨ FIX: Keine Lost Souls als Ziel (wie gewünscht)
            (obj as CardUI).cardData.Type !== "Lost Soul",
        ) as CardUI | undefined;

        if (target) {
          if (this.currentDragTarget !== target) {
            // Wenn wir bereits auf dieses Ziel warten, Timer weiterlaufen lassen
            if (this.pendingDragTarget === target) return;

            // Neues potenzielles Ziel gefunden!

            // 1. Alten Timer abbrechen
            if (this.attachHoverTimer !== null) {
              clearTimeout(this.attachHoverTimer);
              this.attachHoverTimer = null;
            }

            // 2. Altes aktives Ziel deaktivieren (sofortiges Feedback bei Wechsel)
            if (this.currentDragTarget) {
              this.currentDragTarget.showTargetGlow(false);
              this.currentDragTarget = null;
              
              // ✨ FIX: Transparenz nur zurücksetzen, wenn wir NICHT über dem Deck-Boden sind
              const isOverDeckBottom = this.currentHoveredDeck && pointer.y > this.currentHoveredDeck.getBounds().centerY;
              if (!isOverDeckBottom) {
                gameObject.setTransparent(false);
              }
            }

            // 3. Neuen Timer starten (400ms Verzögerung)
            this.pendingDragTarget = target;
            this.attachHoverTimer = window.setTimeout(() => {
              // Prüfen, ob wir noch draggen (Sicherheit)
              if (!this.isDragging) return;

              this.currentDragTarget = target;
              this.currentDragTarget.showTargetGlow(true);
              gameObject.setTransparent(true); // "Geist"-Effekt

              this.pendingDragTarget = null;
              this.attachHoverTimer = null;
            }, ATTACH_HOVER_DELAY);
          }
        } else {
          // Kein Ziel
          // Timer abbrechen
          if (this.attachHoverTimer !== null) {
            clearTimeout(this.attachHoverTimer);
            this.attachHoverTimer = null;
          }
          this.pendingDragTarget = null;

          if (this.currentDragTarget) {
            this.currentDragTarget.showTargetGlow(false);
            this.currentDragTarget = null;
            
            // ✨ FIX: Auch hier prüfen, ob wir über dem Deck sind, bevor wir resetten
            const isOverDeckBottom = this.currentHoveredDeck && pointer.y > this.currentHoveredDeck.getBounds().centerY;
            if (!isOverDeckBottom) {
                gameObject.setTransparent(false); // Reset
            }
          }
        }
      },
    );

    this.scene.input.on(
      "dragend",
      (pointer: Phaser.Input.Pointer, gameObject: CardUI, dropped: boolean) => {
        this.isDragging = false; // ✨ NEU: Drag-Ende markieren
        if (gameObject.scene) {
          // ✨ FIX: Reset depth based on zone to avoid z-fighting with hand cards (100+)
          const baseDepth = gameObject.currentZone === ZONES.HAND ? 100 : 0;
          gameObject.setDepth(baseDepth);
        }

        gameObject.isBeingDragged = false; // ✨ NEU: Drag-Status zurücksetzen
        gameObject.resetDragEffects(); // ✨ NEU: Alle visuellen Effekte (Tilt, Scale, Tint, Overlay) zurücksetzen
        gameObject.setTransparent(false); // Sicherstellen, dass Transparenz weg ist
        gameObject.stopGlow(); // ✨ NEU: Glow beenden

        // ✨ NEU: Deck-Highlight zurücksetzen
        if (this.currentHoveredDeck) {
          this.currentHoveredDeck.showBottomHighlight(false);
          this.currentHoveredDeck = null;
        }

        // ✨ NEU: Zonen-Highlight verstecken
        this.elementManager.hideZoneHighlight();

        // Timer aufräumen
        if (this.attachHoverTimer !== null) {
          clearTimeout(this.attachHoverTimer);
          this.attachHoverTimer = null;
        }
        this.pendingDragTarget = null;

        if (this.currentDragTarget) {
          this.currentDragTarget.showTargetGlow(false);
          this.currentDragTarget = null;
        }

        // Wenn die Karte nicht auf einer gültigen Zone abgelegt wurde...
        if (!dropped) {
          // ...animieren wir sie zurück an ihre Startposition.
          this.scene.tweens.add({
            targets: gameObject,
            x: gameObject.getData("start_x"),
            y: gameObject.getData("start_y"),
            angle: gameObject.getData("start_angle"),
            ease: "Power1",
            duration: 200, // Eine kurze, knackige Animation
          });
        }
        // Wenn `dropped` true ist, wird der 'drop'-Handler ausgelöst und der Server
        // kümmert sich um die neue Position.
      },
    );

    this.scene.input.on(
      "drop",
      (
        pointer: Phaser.Input.Pointer,
        gameObject: CardUI,
        dropZone: Phaser.GameObjects.Zone | PileUI,
      ) => {
        log("Input", `Drop called with dropzone:`, dropZone);

        const fromZone = gameObject.cardData.zone as Zone;
        const toZone = dropZone.name as Zone;
        const targetOwnerId = dropZone.getData("ownerId");

        // ✨ NEU: Attach-Logik beim Drop
        // Wir prüfen manuell, ob wir über einer Karte gedroppt haben, da Phaser's 'drop' Event
        // sich auf die Zone bezieht, nicht auf überlappende GameObjects.
        // Wir nutzen das im 'drag'-Handler ermittelte Target.
        if (this.currentDragTarget) {
          log(
            "Input", `[DROP] Attaching card ${gameObject.cardData.id} to ${this.currentDragTarget.cardData.id}`,
          );
          log(
            "Input", `[DROP] Sending moveCard with attachTo: ${this.currentDragTarget.cardData.id}`,
          );
          // Animation abspielen
          this.currentDragTarget.playAttachAnimation();

          // Nachricht an Server senden
          this.networkManager.sendMoveCard({
            from: fromZone,
            to: this.currentDragTarget.currentZone, // In die Zone des Ziels bewegen
            cardId: gameObject.cardData.id,
            coords: { attachTo: this.currentDragTarget.cardData.id },
          });
          return; // Fertig, keine weitere Zonen-Logik
        }

        // ✨ NEU: Token-Regeln
        // Tokens dürfen nicht auf die Hand, ins Deck oder in die Reserve.
        const isToken =
          gameObject.cardData.Type &&
          gameObject.cardData.Type.includes("Token");
        const forbiddenTokenZones = [ZONES.HAND, ZONES.DECK, ZONES.RESERVE];

        if (isToken && forbiddenTokenZones.includes(toZone)) {
          log("Input", `[DROP] Blocked Token from entering ${toZone}.`);
          // Zurück zur Startposition animieren
          this.scene.tweens.add({
            targets: gameObject,
            x: gameObject.getData("start_x"),
            y: gameObject.getData("start_y"),
            angle: gameObject.getData("start_angle"),
            ease: "Power1",
            duration: 200,
          });
          return;
        }

        // ✨ NEU: Paralysierte Karten dürfen nicht ins Battlefield bewegt werden.
        if (toZone === ZONES.BATTLEFIELD && gameObject.isParalyzed) {
          log("Input", `[DROP] Blocked paralyzed card from entering Battlefield.`);
          // Zurück zur Startposition animieren (manuell, da dropped=true ist)
          this.scene.tweens.add({
            targets: gameObject,
            x: gameObject.getData("start_x"),
            y: gameObject.getData("start_y"),
            angle: gameObject.getData("start_angle"),
            ease: "Power1",
            duration: 200,
          });
          return; // Abbruch: Keine Nachricht an den Server senden
        }

        const currentControllerId = gameObject.cardData.controllerId;

        // ✨ NEU: Prüfen, ob die Karte nur innerhalb derselben "freien" Zone verschoben wird.
        const isSameZoneMove =
          fromZone === toZone &&
          [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
            fromZone,
          ) &&
          // ✨ FIX: Nur wenn kein neuer Besitzer definiert ist (z.B. Battlefield)
          // ODER der Besitzer gleich bleibt. Erlaubt Transfer zum Gegner (Besitzerwechsel).
          (!targetOwnerId || targetOwnerId === currentControllerId);

        if (isSameZoneMove) {
          // Wenn ja, senden wir nur ein Koordinaten-Update, um Counter etc. nicht zurückzusetzen.
          log(
            "Input", `[MOVE] Card moved within the same zone. Sending coordinate update only.`,
          );
          this.room.send("updateCardState", {
            cardId: gameObject.cardData.id,
            updates: { x: gameObject.x, y: gameObject.y },
          });
        } else {
          // Ansonsten wird die normale "moveCard"-Logik für Zonenwechsel ausgeführt.
          const coords: MoveCardMessage["coords"] = {
            x: gameObject.x,
            y: gameObject.y,
            targetPlayerId: dropZone.getData("ownerId"),
          };

          if (toZone === ZONES.DECK) {
            const dropZoneBounds = dropZone.getBounds();
            if (pointer.y > dropZoneBounds.centerY) {
              coords.position = "bottom";
            }
          }

          const message: MoveCardMessage = {
            from: fromZone,
            to: toZone,
            cardId: gameObject.cardData.id,
            coords,
          };
          log("Input", `[MOVE] Sending full moveCard message for zone change:`, message);
          this.networkManager.sendMoveCard(message);
        }
      },
    );
  }

  /**
   * Handler für das "Mouse Over"-Event auf einem Spielobjekt.
   * Hebt die eigene Handkarte leicht an und vergrößert sie.
   */
  private onPointerOver(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    // ✨ NEU: Verhindere Hover-Effekte auf anderen Karten, während eine Karte gezogen wird.
    if (this.isDragging) {
      // Safety-Check: Falls der Pointer nicht mehr gedrückt ist, ist der Drag vorbei.
      // Dies verhindert, dass der Status hängen bleibt, falls 'dragend' verschluckt wurde.
      if (!pointer.isDown) {
        this.isDragging = false;
      } else {
        return;
      }
    }

    // ✨ NEU: Blockiere Hover-Effekte, wenn Animationen laufen (z.B. Dominants, Draws).
    // Das verhindert, dass Karten im Hintergrund aufleuchten oder Previews anzeigen,
    // während eine wichtige Animation (wie ein Dominant-Effekt) abgespielt wird.
    if (this.animationManager.activeDrawTweens.size > 0) {
      return;
    }

    if (!(gameObject instanceof CardUI)) return;

    const card = gameObject;

    // Zeige IMMER die Vorschau an, egal wem die Karte gehört oder wo sie liegt.
    this.previewManager.show(card, this.room.sessionId);

    const isMyHandCard =
      card.currentZone === ZONES.HAND &&
      card.cardData.controllerId === this.room.sessionId;

    if (isMyHandCard) {
      // Delegiere die Animation an den AnimationManager.
      this.animationManager.playHandHoverAnimation(card);
      // ✨ FIX: Sende an den globalen Game-Event-Bus, da der SoundManager dort lauscht.
      this.scene.game.events.emit("playSound", "CARD_HOVER");
    } else if (
      [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
        card.currentZone,
      )
    ) {
      // ✨ FIX: Globaler Event-Bus
      this.scene.game.events.emit("playSound", "CARD_HOVER_FIELD");
      this.animationManager.playTerritoryHoverAnimation(card);
    }

    // ✨ NEU: Starte den Flammen-Effekt (prüft intern auf PILE_ZONES)
    card.startGlow();
  }

  /**
   * Handler für das "Mouse Out"-Event auf einem Spielobjekt.
   * Setzt die Handkarte auf ihre ursprüngliche Position und Größe zurück.
   */
  private onPointerOut(
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ) {
    if (!(gameObject instanceof CardUI)) return;

    const card = gameObject;

    // Verstecke die Vorschau wieder.
    this.previewManager.hide();

    const isMyHandCard =
      card.currentZone === ZONES.HAND &&
      card.cardData.controllerId === this.room.sessionId;

    if (isMyHandCard) {
      // Delegiere die Animation an den AnimationManager.
      this.animationManager.playHandHoverOutAnimation(card);
    } else if (
      [ZONES.TERRITORY, ZONES.LAND_OF_BONDAGE, ZONES.BATTLEFIELD].includes(
        card.currentZone,
      )
    ) {
      // ✨ NEU: Animation beenden (auch für LoB und Battlefield)
      this.animationManager.playTerritoryHoverOutAnimation(card);
    }

    // ✨ NEU: Stoppe den Flammen-Effekt, ABER NUR, wenn die Karte nicht gerade gezogen wird.
    if (!card.isBeingDragged) {
      card.stopGlow();
    }
  }

  /**
   * Öffnet das Radial Menu für eine Karte auf dem Spielfeld.
   */
  private openCardRadialMenu(pointer: Phaser.Input.Pointer, card: CardUI) {
    if (this.activeMenu) {
      this.activeMenu.close();
      return;
    }

    const menuConfigs: ActionIconConfig[] = [
      {
        iconKey: "icon_turn",
        actionKey: "turn",
        callback: () => {
          // ✨ FIX: "Turn" soll die Karte wenden (Vorder-/Rückseite), wie der alte Doppelklick.
          this.room.send("updateCardState", {
            cardId: card.cardData.id,
            updates: { isFaceDown: !card.cardData.isFaceDown },
          });
        },
      },
      {
        iconKey: "icon_flip",
        actionKey: "flip",
        callback: () => {
          // ✨ FIX: "Flip" soll die Karte um 180 Grad drehen, wie der alte Rechtsklick.
          this.room.send("updateCardState", {
            cardId: card.cardData.id,
            updates: { isFlipped: !card.cardData.isFlipped },
          });
        },
      },
      {
        iconKey: "icon_paralyze",
        actionKey: "paralyze",
        callback: () => {
          this.openCounterDialog(card, "paralyze", "Paralyze Wert");
        },
      },
      {
        iconKey: "icon_setaside",
        actionKey: "setaside",
        callback: () => {
          this.openCounterDialog(card, "setaside", "Set Aside Wert");
        },
      },
    ];

    // Positionierung
    const radius = 80;
    const iconSize =
      Math.min(this.scene.scale.width, this.scene.scale.height) / 12;
    const menuRadius = radius + iconSize / 2;

    let cx = Phaser.Math.Clamp(
      pointer.x,
      menuRadius,
      this.scene.scale.width - menuRadius,
    );
    let cy = Phaser.Math.Clamp(
      pointer.y,
      menuRadius,
      this.scene.scale.height - menuRadius,
    );

    this.activeMenu = new RadialMenu(
      this.scene,
      cx,
      cy,
      radius,
      menuConfigs,
      () => {
        this.activeMenu = null;
      },
    );

    pointer.event.stopPropagation();
  }

  /**
   * Öffnet den Dialog zum Einstellen von Countern (Paralyze/Setaside).
   */
  private openCounterDialog(card: CardUI, counterKey: string, title: string) {
    // Aktuellen Wert holen (Standard 0)
    // Wir greifen hier auf das MapSchema zu. Da es im Client als any/Map behandelt wird:
    const currentVal = (card.cardData.counters as any).get(counterKey) || 0;

    this.scene.scene.pause("CardGame");
    this.scene.scene.launch("QuantitySelectionDialogScene", {
      title: title,
      maxCount: 99, // Hohes Limit für Counter
      minCount: 0, // Erlaubt auch 0 (zum Entfernen)
      enablePositionSelection: false, // Keine Top/Bottom Auswahl nötig
      onConfirm: (count: number) => {
        this.room.send("updateCardState", {
          cardId: card.cardData.id,
          updates: { counters: { [counterKey]: count } },
        });
      },
      onCancel: () => {
        this.scene.scene.resume("CardGame");
      },
    } as QuantitySelectionDialogData);
  }
}
