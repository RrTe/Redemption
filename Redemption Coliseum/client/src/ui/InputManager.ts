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
import { log } from "../utils/logger";
import { ElementManager } from "./ElementManager.js"; // ✨ NEU
import { DragDropHandler } from "./DragDropHandler.js"; // ✨ REFACTOR

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
  private elementManager: ElementManager; // ✨ NEU
  private dragDropHandler: DragDropHandler; // ✨ REFACTOR

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: NetworkManager,
    animationManager: AnimationManager,
    previewManager: PreviewManager,
    dragBounds: Phaser.Geom.Rectangle,
    elementManager: ElementManager, // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.dragBounds = dragBounds;
    this.networkManager = networkManager;
    this.animationManager = animationManager;
    this.previewManager = previewManager;
    this.elementManager = elementManager; // ✨ NEU

    // ✨ REFACTOR: Create the dedicated handler for drag and drop.
    this.dragDropHandler = new DragDropHandler(
      scene,
      room,
      networkManager,
      animationManager,
      previewManager,
      elementManager,
      dragBounds,
    );
  }

  /** ✨ NEU: Aufräumen von Timern und Listeners. */
  public destroy() {
    // ✨ REFACTOR: Delegate cleanup to the handler.
    this.dragDropHandler.destroy();
    // Scene-Input-Listener werden von Phaser beim Scene-Shutdown automatisch entfernt.
  }

  /** Registriert alle globalen Input-Event-Handler für Drag & Drop. */
  public registerInputHandlers() {
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
          "Input",
          `gameobjectdown on ${
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
              "Input",
              `Right-clicked on searchable zone: ${searchZone} of player ${targetPlayerId}`,
            );

            // ✨ FIX: Kein Menü auf leeren Stapeln anzeigen.
            // Gilt nicht für die Hand, da diese anders behandelt wird.
            if (searchZone !== ZONES.HAND) {
              const pId = targetPlayerId || this.room.sessionId;
              const player = this.room.state.players.get(pId);
              if (player) {
                const pile = (player as any)[searchZone!];
                if (!pile || pile.length === 0) {
                  log(
                    "Input",
                    `Pile ${searchZone} is empty. Not opening radial menu.`,
                  );
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
                  "Input",
                  `[RadialMenu] Action 'search' triggered for ${searchZone} of ${targetPlayerId}`,
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
                  "Input",
                  `[RadialMenu] Action 'look' triggered for ${searchZone} of ${
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
                  title: "View Cards",
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
                  "Input",
                  `[RadialMenu] Action 'reveal' triggered for ${searchZone} of ${
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
                  title: "Reveal Cards",
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
                    "Input",
                    `[RadialMenu] Action 'shuffle' triggered for ${searchZone}`,
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
                    "Input",
                    `[RadialMenu] Action 'discard' triggered for ${searchZone} of ${
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
                    title: "Discard Cards",
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
              "Input",
              `Right Click detected on Hand Card ${card.cardData.id}`,
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
            "Input",
            `Left Click on Card. Delta: ${now - this.lastClickTime}ms`,
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

    // ✨ REFACTOR: Delegate drag event registration to the handler.
    this.dragDropHandler.registerHandlers();
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
    if (this.dragDropHandler.isDragging) {
      // Safety-Check: Falls der Pointer nicht mehr gedrückt ist, ist der Drag vorbei.
      // Dies verhindert, dass der Status hängen bleibt, falls 'dragend' verschluckt wurde.
      if (!pointer.isDown) {
        this.dragDropHandler.isDragging = false;
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
          this.openCounterDialog(card, "paralyze", "Paralyze Value");
        },
      },
      {
        iconKey: "icon_setaside",
        actionKey: "setaside",
        callback: () => {
          this.openCounterDialog(card, "setaside", "Set Aside Value");
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
